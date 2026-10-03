import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native';
import { BottomSheet } from './BottomSheet';
import { colors } from '../../theme/colors';
import {
  scheduleMeetingViaGoogle,
  type MeetingWithDeal,
  supabase,
} from '@kairo/api';

interface ScheduleMeetingSheetProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealName?: string;
  companyName?: string;
  onMeetingScheduled?: (meeting: MeetingWithDeal) => void;
}

const DURATION_OPTIONS = [
  { label: '15m', value: 15 },
  { label: '30m', value: 30 },
  { label: '45m', value: 45 },
  { label: '60m', value: 60 },
];

function getDefaultDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getDefaultTime(): string {
  const d = new Date();
  const nextHour = (d.getHours() + 1) % 24;
  return `${String(nextHour).padStart(2, '0')}:00`;
}

export function ScheduleMeetingSheet({
  open,
  onClose,
  dealId,
  dealName,
  companyName,
  onMeetingScheduled,
}: ScheduleMeetingSheetProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getDefaultDate());
  const [time, setTime] = useState(getDefaultTime());
  const [duration, setDuration] = useState(30);
  const [attendeesInput, setAttendeesInput] = useState('');
  const [createMeet, setCreateMeet] = useState(true);
  const [description, setDescription] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [createdMeeting, setCreatedMeeting] = useState<MeetingWithDeal | null>(null);

  useEffect(() => {
    if (open) {
      const defaultTitle = dealName
        ? `${dealName}${companyName ? ` · ${companyName}` : ''}`
        : 'Deal Discovery Call';
      setTitle(defaultTitle);
      setDate(getDefaultDate());
      setTime(getDefaultTime());
      setDuration(30);
      setAttendeesInput('');
      setCreateMeet(true);
      setDescription('');
      setError(null);
      setErrorCode(null);
      setCreatedMeeting(null);
    }
  }, [open, dealName, companyName]);

  async function handleSchedule() {
    if (!title.trim()) {
      setError('Meeting title is required.');
      return;
    }
    if (!date.trim() || !time.trim()) {
      setError('Date and time are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const startDateTime = new Date(`${date.trim()}T${time.trim()}:00`);
      if (Number.isNaN(startDateTime.getTime())) {
        throw new Error('Invalid date or time specified. Use YYYY-MM-DD and HH:MM.');
      }

      const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

      const rawAttendees = attendeesInput
        .split(/[\s,]+/)
        .map((email) => email.trim())
        .filter((email) => email.length > 0 && email.includes('@'));

      const meeting = await scheduleMeetingViaGoogle({
        deal_id: dealId,
        title: title.trim(),
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        attendees: rawAttendees,
        description: description.trim() || undefined,
        create_meet: createMeet,
      });

      setCreatedMeeting(meeting);
      if (onMeetingScheduled) {
        onMeetingScheduled(meeting);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to schedule meeting.');
      setErrorCode(err?.code || null);
    } finally {
      setLoading(false);
    }
  }

  async function handleReauthorize() {
    try {
      setLoading(true);
      const { data, error: fetchErr } = await supabase.functions.invoke(
        'google-calendar-connect?platform=mobile',
        { method: 'GET' }
      );

      if (fetchErr || !data?.auth_url) {
        throw new Error('Failed to generate Google Calendar auth link.');
      }

      await Linking.openURL(data.auth_url);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect calendar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Schedule Meeting">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {createdMeeting ? (
          <View style={styles.successContainer}>
            <View style={styles.successBanner}>
              <Text style={styles.successIcon}>✓</Text>
              <View style={styles.successBannerText}>
                <Text style={styles.successTitle}>Meeting Scheduled</Text>
                <Text style={styles.successSubtitle}>
                  Linked directly to {dealName || 'this deal'} and saved to Google Calendar.
                </Text>
              </View>
            </View>

            <View style={styles.meetingCard}>
              <Text style={styles.cardLabel}>MEETING TITLE</Text>
              <Text style={styles.cardTitle}>{createdMeeting.title}</Text>

              <View style={styles.metaRow}>
                <View style={styles.metaCol}>
                  <Text style={styles.cardLabel}>DATE & TIME</Text>
                  <Text style={styles.cardValue}>
                    {createdMeeting.start_time
                      ? new Date(createdMeeting.start_time).toLocaleString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'Scheduled'}
                  </Text>
                </View>

                {createdMeeting.meeting_link ? (
                  <View style={styles.metaCol}>
                    <Text style={styles.cardLabel}>VIDEO LINK</Text>
                    <Text style={styles.meetValue}>🎥 Google Meet</Text>
                  </View>
                ) : null}
              </View>

              {createdMeeting.meeting_link ? (
                <View style={styles.linkContainer}>
                  <TextInput
                    editable={false}
                    selectTextOnFocus
                    value={createdMeeting.meeting_link}
                    style={styles.linkInput}
                  />
                  <TouchableOpacity
                    style={styles.openLinkBtn}
                    onPress={() => {
                      if (createdMeeting.meeting_link) {
                        Linking.openURL(createdMeeting.meeting_link);
                      }
                    }}
                  >
                    <Text style={styles.openLinkBtnText}>Open</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            <TouchableOpacity style={styles.doneButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formContainer}>
            <View style={styles.field}>
              <Text style={styles.label}>Meeting Title *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Acme Corp · Discovery Call"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.halfCol]}>
                <Text style={styles.label}>Date (YYYY-MM-DD) *</Text>
                <TextInput
                  style={styles.input}
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-10-05"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={[styles.field, styles.halfCol]}>
                <Text style={styles.label}>Start Time (HH:MM) *</Text>
                <TextInput
                  style={styles.input}
                  value={time}
                  onChangeText={setTime}
                  placeholder="14:00"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Duration</Text>
              <View style={styles.durationRow}>
                {DURATION_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.durationBtn,
                      duration === opt.value && styles.durationBtnActive,
                    ]}
                    onPress={() => setDuration(opt.value)}
                  >
                    <Text
                      style={[
                        styles.durationBtnText,
                        duration === opt.value && styles.durationBtnTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Attendees (Emails)</Text>
              <TextInput
                style={styles.input}
                value={attendeesInput}
                onChangeText={setAttendeesInput}
                placeholder="buyer@acme.com, tech@acme.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Text style={styles.helperText}>
                Separate multiple emails with commas. Invites sent via Google Calendar.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setCreateMeet(!createMeet)}
              activeOpacity={0.7}
            >
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>🎥 Add Google Meet</Text>
                <Text style={styles.toggleSubtitle}>Generate a video conference link</Text>
              </View>
              <View style={[styles.checkbox, createMeet && styles.checkboxActive]}>
                {createMeet && <Text style={styles.checkmark}>✓</Text>}
              </View>
            </TouchableOpacity>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
                {errorCode === 'SCOPE_UPGRADE_REQUIRED' && (
                  <TouchableOpacity
                    style={styles.reauthButton}
                    onPress={handleReauthorize}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.reauthButtonText}>
                      Grant Google Calendar Write Access
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSchedule}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.submitButtonText}>📅 Schedule in Google Calendar</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 520,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  formContainer: {
    gap: 12,
  },
  field: {
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  helperText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfCol: {
    flex: 1,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  durationBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  durationBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  durationBtnTextActive: {
    color: colors.glow,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginVertical: 4,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  toggleSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.white,
    fontSize: 13,
    fontWeight: 'bold',
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 4,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 12,
    lineHeight: 16,
  },
  reauthButton: {
    marginTop: 8,
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  reauthButtonText: {
    color: colors.glow,
    fontSize: 12,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  successContainer: {
    gap: 14,
    paddingVertical: 4,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  successIcon: {
    fontSize: 18,
    color: colors.success,
    fontWeight: 'bold',
  },
  successBannerText: {
    flex: 1,
  },
  successTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  successSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meetingCard: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaCol: {
    flex: 1,
  },
  cardValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 2,
  },
  meetValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.success,
    marginTop: 2,
  },
  linkContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  linkInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    color: colors.textSecondary,
  },
  openLinkBtn: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  openLinkBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  doneButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});

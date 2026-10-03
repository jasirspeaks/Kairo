import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { supabase, useAuth, syncGoogleCalendar, getMeetings, getDeals } from '@kairo/api';
import { INITIAL_DEAL_STAGE, type MeetingWithDeal, type Deal } from '@kairo/core';
import { colors } from '../theme/colors';
import { useNavigation } from '../navigation/NavigationContext';
import { BottomSheet } from '../components/ui/BottomSheet';

function formatMeetingTime(startTime: string | null): string {
  if (!startTime) return 'No time set';
  const date = new Date(startTime);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function InboxScreen() {
  const { user } = useAuth();
  const { navigate } = useNavigation();

  const [meetings, setMeetings] = useState<MeetingWithDeal[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Assignment Modal
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingWithDeal | null>(null);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [newDealName, setNewDealName] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newDealValue, setNewDealValue] = useState('');
  const [processing, setProcessing] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');

  const userRef = useRef(user);
  userRef.current = user;

  async function loadData() {
    if (!user) return;
    try {
      const [meetingList, dealList] = await Promise.all([
        getMeetings(user.id),
        getDeals(user.id),
      ]);
      setMeetings(meetingList);
      setDeals(dealList);
    } catch (err) {
      console.error('Error loading inbox data:', err);
    }
  }

  async function handleSyncAndRefresh() {
    if (!user) return;
    setSyncing(true);
    try {
      await syncGoogleCalendar();
      await loadData();
    } finally {
      setSyncing(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    loadData().finally(() => setLoading(false));

    // Supabase realtime channel for instant meeting updates
    const channelId = Math.random().toString(36).slice(2);
    const channel = supabase
      .channel(`mobile-inbox-${user.id}-${channelId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meetings', filter: `user_id=eq.${user.id}` },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  function handleOpenAssign(meeting: MeetingWithDeal) {
    setSelectedMeeting(meeting);
    setMode('existing');
    setSelectedDealId(deals.length > 0 ? deals[0].id : '');
    setNewDealName(meeting.title || '');
    setNewCompanyName('');
    setNewDealValue('');
    setAssignmentError('');
  }

  async function handleAssignMeeting() {
    if (!user || !selectedMeeting) return;
    setProcessing(true);
    setAssignmentError('');

    try {
      let targetDealId = selectedDealId;

      if (mode === 'new') {
        if (!newDealName.trim() || !newCompanyName.trim()) {
          setAssignmentError('Please enter both Deal Name and Company Name.');
          setProcessing(false);
          return;
        }

        const parsedValue = newDealValue.trim()
          ? Number(newDealValue.replace(/[,$]/g, ''))
          : null;

        const { data: newDeal, error: dealError } = await supabase
          .from('deals')
          .insert({
            user_id: user.id,
            deal_name: newDealName.trim(),
            company_name: newCompanyName.trim(),
            deal_stage: INITIAL_DEAL_STAGE,
            deal_value: parsedValue,
            status: 'active',
            risk_level: 'none',
          })
          .select()
          .single();

        if (dealError || !newDeal) {
          throw new Error('Failed to create new deal.');
        }
        targetDealId = newDeal.id;
      }

      const { error: updateError } = await supabase
        .from('meetings')
        .update({
          deal_id: targetDealId,
          status: 'assigned',
        })
        .eq('id', selectedMeeting.id);

      if (updateError) throw updateError;

      setSelectedMeeting(null);
      await loadData();
    } catch (err: any) {
      setAssignmentError(err?.message || 'Failed to assign meeting.');
    } finally {
      setProcessing(false);
    }
  }

  const unassignedMeetings = meetings.filter((m) => m.status === 'unassigned' || !m.deal_id);
  const assignedMeetings = meetings.filter((m) => m.status === 'assigned' && m.deal_id);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Meeting Inbox</Text>
          <Text style={styles.headerSubtitle}>
            {unassignedMeetings.length} unassigned {unassignedMeetings.length === 1 ? 'meeting' : 'meetings'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.syncButton}
          onPress={handleSyncAndRefresh}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={styles.syncButtonText}>🔄 Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                handleSyncAndRefresh();
              }}
              tintColor={colors.primary}
            />
          }
        >
          {/* Section: Needs Assignment */}
          <Text style={styles.sectionHeading}>
            NEEDS ASSIGNMENT ({unassignedMeetings.length})
          </Text>

          {unassignedMeetings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>✨</Text>
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>
                No unassigned calendar meetings. New calendar events will appear here automatically.
              </Text>
            </View>
          ) : (
            unassignedMeetings.map((meeting) => (
              <View key={meeting.id} style={styles.meetingCard}>
                <View style={styles.meetingInfo}>
                  <Text style={styles.meetingTitle}>
                    {meeting.title || 'Untitled Meeting'}
                  </Text>
                  <Text style={styles.meetingTime}>
                    📅 {formatMeetingTime(meeting.start_time)}
                  </Text>
                  {meeting.attendees && Array.isArray(meeting.attendees) && meeting.attendees.length > 0 && (
                    <Text style={styles.meetingAttendees} numberOfLines={1}>
                      👥 {meeting.attendees.map((a: any) => a.email || a).join(', ')}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.assignButton}
                  onPress={() => handleOpenAssign(meeting)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.assignButtonText}>Assign Deal</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Section: Assigned Meetings */}
          {assignedMeetings.length > 0 && (
            <>
              <Text style={[styles.sectionHeading, { marginTop: 24 }]}>
                ASSIGNED MEETINGS ({assignedMeetings.length})
              </Text>
              {assignedMeetings.map((meeting) => (
                <TouchableOpacity
                  key={meeting.id}
                  style={[styles.meetingCard, styles.assignedCard]}
                  onPress={() => {
                    if (meeting.deal_id) {
                      navigate('deal_review', { dealId: meeting.deal_id });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.meetingInfo}>
                    <Text style={styles.meetingTitle}>
                      {meeting.title || 'Untitled Meeting'}
                    </Text>
                    <Text style={styles.meetingTime}>
                      📅 {formatMeetingTime(meeting.start_time)}
                    </Text>
                    {meeting.deal && (
                      <View style={styles.dealBadge}>
                        <Text style={styles.dealBadgeText}>
                          🏢 {meeting.deal.company_name} — {meeting.deal.deal_name}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Assignment Bottom Sheet */}
      <BottomSheet
        visible={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        title="Assign Meeting to Deal"
      >
        {selectedMeeting && (
          <View style={styles.sheetBody}>
            <View style={styles.sheetMeetingBanner}>
              <Text style={styles.sheetMeetingTitle}>
                {selectedMeeting.title || 'Untitled Meeting'}
              </Text>
              <Text style={styles.sheetMeetingTime}>
                {formatMeetingTime(selectedMeeting.start_time)}
              </Text>
            </View>

            {assignmentError ? (
              <View style={styles.sheetErrorBox}>
                <Text style={styles.sheetErrorText}>{assignmentError}</Text>
              </View>
            ) : null}

            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, mode === 'existing' && styles.modeButtonActive]}
                onPress={() => setMode('existing')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === 'existing' && styles.modeButtonTextActive,
                  ]}
                >
                  Existing Deal
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeButton, mode === 'new' && styles.modeButtonActive]}
                onPress={() => setMode('new')}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === 'new' && styles.modeButtonTextActive,
                  ]}
                >
                  Create New Deal
                </Text>
              </TouchableOpacity>
            </View>

            {mode === 'existing' ? (
              <View style={styles.field}>
                <Text style={styles.label}>Select Deal</Text>
                {deals.length === 0 ? (
                  <Text style={styles.noDealsText}>
                    No active deals found. Switch to "Create New Deal" above.
                  </Text>
                ) : (
                  <ScrollView style={styles.dealPickerList}>
                    {deals.map((deal) => (
                      <TouchableOpacity
                        key={deal.id}
                        style={[
                          styles.dealPickerItem,
                          selectedDealId === deal.id && styles.dealPickerItemActive,
                        ]}
                        onPress={() => setSelectedDealId(deal.id)}
                      >
                        <Text style={styles.dealPickerCompany}>
                          {deal.company_name}
                        </Text>
                        <Text style={styles.dealPickerName}>{deal.deal_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            ) : (
              <View style={styles.newDealFields}>
                <View style={styles.field}>
                  <Text style={styles.label}>Company / Account Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Acme Corp"
                    placeholderTextColor={colors.text.tertiary}
                    value={newCompanyName}
                    onChangeText={setNewCompanyName}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Deal Name *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Acme Corp - Enterprise Pilot"
                    placeholderTextColor={colors.text.tertiary}
                    value={newDealName}
                    onChangeText={setNewDealName}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Estimated Value ($)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 50000"
                    placeholderTextColor={colors.text.tertiary}
                    value={newDealValue}
                    onChangeText={setNewDealValue}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitButton, processing && styles.buttonDisabled]}
              onPress={handleAssignMeeting}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Confirm Assignment</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  syncButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  syncButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  meetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  assignedCard: {
    borderColor: colors.borderSubtle,
    opacity: 0.85,
  },
  meetingInfo: {
    flex: 1,
    marginRight: 10,
  },
  meetingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  meetingTime: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  meetingAttendees: {
    fontSize: 11,
    color: colors.text.tertiary,
    marginTop: 4,
  },
  dealBadge: {
    backgroundColor: colors.primaryGlow,
    alignSelf: 'flex-start',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  dealBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  assignButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  assignButtonText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 20,
    color: colors.text.tertiary,
  },
  sheetBody: {
    gap: 14,
  },
  sheetMeetingBanner: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 12,
  },
  sheetMeetingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sheetMeetingTime: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  sheetErrorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  sheetErrorText: {
    color: colors.dangerText,
    fontSize: 12,
  },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
  },
  modeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.tertiary,
  },
  modeButtonTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  input: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.text.primary,
  },
  dealPickerList: {
    maxHeight: 180,
  },
  dealPickerItem: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  dealPickerItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryGlow,
  },
  dealPickerCompany: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  dealPickerName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 2,
  },
  noDealsText: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontStyle: 'italic',
  },
  newDealFields: {
    gap: 10,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
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
});

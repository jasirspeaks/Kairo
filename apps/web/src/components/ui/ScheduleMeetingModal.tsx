import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Video,
  Users,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import {
  scheduleMeetingViaGoogle,
  MeetingWithDeal,
} from '../../lib/kairo';
import { supabase } from '../../lib/supabase';

interface ScheduleMeetingModalProps {
  open: boolean;
  onClose: () => void;
  dealId: string;
  dealName?: string;
  companyName?: string;
  onMeetingScheduled?: (meeting: MeetingWithDeal) => void;
}

const DURATION_OPTIONS = [
  { label: '15 mins', value: 15 },
  { label: '30 mins', value: 30 },
  { label: '45 mins', value: 45 },
  { label: '60 mins', value: 60 },
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

export function ScheduleMeetingModal({
  open,
  onClose,
  dealId,
  dealName,
  companyName,
  onMeetingScheduled,
}: ScheduleMeetingModalProps) {
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
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (open) {
      const defaultTitle = dealName
        ? `${dealName} ${companyName ? `· ${companyName}` : ''}`
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
      setCopiedLink(false);
    }
  }, [open, dealName, companyName]);

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Meeting title is required.');
      return;
    }
    if (!date || !time) {
      setError('Date and time are required.');
      return;
    }

    setLoading(true);
    setError(null);
    setErrorCode(null);

    try {
      const startDateTime = new Date(`${date}T${time}:00`);
      if (Number.isNaN(startDateTime.getTime())) {
        throw new Error('Invalid date or time specified.');
      }

      const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);

      // Parse comma or space separated emails
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error: fetchErr } = await supabase.functions.invoke('google-calendar-connect', {
        method: 'GET',
      });

      if (fetchErr || !data?.auth_url) {
        throw new Error('Failed to generate Google Calendar auth link.');
      }

      window.location.href = data.auth_url;
    } catch (err: any) {
      setError(err?.message || 'Failed to connect calendar.');
    } finally {
      setLoading(false);
    }
  }

  function copyMeetingLink() {
    if (!createdMeeting?.meeting_link) return;
    navigator.clipboard.writeText(createdMeeting.meeting_link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Schedule Meeting">
      {createdMeeting ? (
        <div className="space-y-4 py-2 animate-fade-in">
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-textPrimary">Meeting Scheduled</p>
              <p className="text-xs text-textSecondary mt-0.5">
                Linked directly to {dealName || 'this deal'} and saved to Google Calendar.
              </p>
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <div>
              <p className="text-xs text-textMuted font-medium">Meeting Title</p>
              <p className="text-sm font-semibold text-textPrimary">{createdMeeting.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-textMuted font-medium">Date & Time</p>
                <p className="font-semibold text-textPrimary">
                  {createdMeeting.start_time
                    ? new Date(createdMeeting.start_time).toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : 'Scheduled'}
                </p>
              </div>

              {createdMeeting.meeting_link && (
                <div>
                  <p className="text-textMuted font-medium">Video Conference</p>
                  <p className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Video className="w-3.5 h-3.5" /> Google Meet
                  </p>
                </div>
              )}
            </div>

            {createdMeeting.meeting_link && (
              <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
                <input
                  readOnly
                  value={createdMeeting.meeting_link}
                  className="input-field text-xs py-1.5 font-mono truncate select-all flex-1"
                />
                <Button size="sm" variant="secondary" onClick={copyMeetingLink}>
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy Link
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button className="w-full" size="lg" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSchedule} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              Meeting Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Corp · Discovery Call"
              className="input-field"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                <Calendar className="w-3.5 h-3.5 inline mr-1 text-textMuted" />
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                <Clock className="w-3.5 h-3.5 inline mr-1 text-textMuted" />
                Start Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  className={`text-xs py-2 px-2 rounded-lg border font-medium transition-colors ${
                    duration === opt.value
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'border-border text-textMuted hover:text-textSecondary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-textSecondary mb-1.5">
              <Users className="w-3.5 h-3.5 inline mr-1 text-textMuted" />
              Attendees (Email addresses)
            </label>
            <input
              type="text"
              value={attendeesInput}
              onChange={(e) => setAttendeesInput(e.target.value)}
              placeholder="prospect@acme.com, buyer@acme.com"
              className="input-field"
            />
            <p className="text-[11px] text-textMuted mt-1">
              Separate multiple emails with commas. Calendar invites will be dispatched automatically.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-surfaceHigh/60 border border-border">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-emerald-400" />
              <div>
                <p className="text-xs font-semibold text-textPrimary">Add Google Meet</p>
                <p className="text-[11px] text-textMuted">Generate a video conferencing link</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={createMeet}
              onChange={(e) => setCreateMeet(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-400/10 border border-red-400/20 text-xs text-red-400 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="flex-1">{error}</p>
              </div>

              {errorCode === 'SCOPE_UPGRADE_REQUIRED' && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="w-full mt-2"
                  onClick={handleReauthorize}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Grant Google Calendar Write Access
                </Button>
              )}
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              className="w-full"
              size="lg"
              loading={loading}
              disabled={loading}
            >
              <Calendar className="w-4 h-4" /> Schedule in Google Calendar
            </Button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}

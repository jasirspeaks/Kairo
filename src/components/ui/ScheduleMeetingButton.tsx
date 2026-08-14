import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, X, CheckCircle2 } from 'lucide-react';
import { checkCalendarConnected, syncGoogleCalendar } from '../../lib/kairo';
import { supabase } from '../../lib/supabase';
import { Button } from './Button';

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/r';

interface ScheduleMeetingButtonProps {
  userId: string | undefined;
  // Which deal this click is scheduling for. When present, Kairo records a
  // "schedule intent" so the next brand-new event the user creates in
  // Google Calendar gets auto-assigned to this deal -- the user never has
  // to come back and manually attach it in Inbox. Omit this prop (e.g. a
  // generic "view my calendar" context with no deal in scope) to open
  // Google Calendar without recording an intent.
  dealId?: string;
  className?: string;
  variant?: 'secondary' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}

// "Schedule Next Meeting" everywhere in the product (Call Review, Deal
// Review) needs to agree on three things: is this user's Google Calendar
// actually connected, which deal is this click for, and did the meeting
// they just made in Google Calendar actually get linked back. If the
// calendar isn't connected, say so plainly and point at Settings rather
// than opening a blank/broken calendar view.
export function ScheduleMeetingButton({ userId, dealId, className, variant = 'secondary', size = 'md' }: ScheduleMeetingButtonProps) {
  const navigate = useNavigate();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const awaitingReturn = useRef(false);

  useEffect(() => {
    if (!userId) return;
    checkCalendarConnected(userId).then(setConnected);
  }, [userId]);

  // When the user comes back to this tab after a click that opened Google
  // Calendar, trigger one sync so the new event (if they made one) gets
  // pulled in and, via the schedule intent, auto-assigned to this deal.
  // This is the only reliable moment Kairo has to know "they're probably
  // done over there" -- there's no webhook for "user finished in a tab
  // they opened by hand."
  useEffect(() => {
    async function handleFocus() {
      if (!awaitingReturn.current || !userId) return;
      awaitingReturn.current = false;
      setConfirming(true);
      await syncGoogleCalendar();
      setTimeout(() => setConfirming(false), 4000);
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [userId]);

  async function handleClick() {
    if (!connected) {
      setShowPrompt(true);
      return;
    }

    if (userId && dealId) {
      // Best-effort -- if this write fails, the user still gets to
      // Google Calendar, they'll just need to assign the meeting to the
      // deal manually from Inbox afterward.
      await supabase.from('pending_schedule_intents').insert({ user_id: userId, deal_id: dealId });
      awaitingReturn.current = true;
    }

    window.open(GOOGLE_CALENDAR_URL, '_blank', 'noopener,noreferrer');
  }

  const confirmationBanner = confirming && (
    <div className="mt-2 flex items-center gap-2 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-3 py-2 animate-fade-in">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
      <p className="text-emerald-400 text-xs">
        {dealId ? "Checking for your new meeting to link it to this deal…" : 'Syncing your calendar…'}
      </p>
    </div>
  );

  if (variant === 'icon') {
    return (
      <>
        <button
          onClick={handleClick}
          className={className || 'w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary'}
          aria-label="Schedule Next Meeting"
        >
          <Calendar className="w-4 h-4" />
        </button>
        {showPrompt && (
          <CalendarConnectPrompt onClose={() => setShowPrompt(false)} onGoToSettings={() => navigate('/app/settings')} />
        )}
        {confirmationBanner}
      </>
    );
  }

  return (
    <>
      <Button variant="secondary" size={size} className={className} onClick={handleClick}>
        <Calendar className="w-4 h-4" /> Schedule Next Meeting
      </Button>
      {showPrompt && (
        <CalendarConnectPrompt onClose={() => setShowPrompt(false)} onGoToSettings={() => navigate('/app/settings')} />
      )}
      {confirmationBanner}
    </>
  );
}

function CalendarConnectPrompt({ onClose, onGoToSettings }: { onClose: () => void; onGoToSettings: () => void }) {
  return (
    <div className="mt-2 flex items-start gap-2 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 animate-fade-in">
      <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-textPrimary text-xs font-medium mb-0.5">Google Calendar isn't connected</p>
        <p className="text-textSecondary text-xs leading-relaxed mb-2">
          Connect your calendar in Settings to schedule meetings from Kairo.
        </p>
        <button onClick={onGoToSettings} className="text-primary text-xs font-semibold">
          Go to Settings →
        </button>
      </div>
      <button onClick={onClose} className="text-textMuted flex-shrink-0" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
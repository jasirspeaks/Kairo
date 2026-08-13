import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, X } from 'lucide-react';
import { checkCalendarConnected } from '../../lib/kairo';
import { Button } from './Button';

const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/r';

interface ScheduleMeetingButtonProps {
  userId: string | undefined;
  className?: string;
  variant?: 'secondary' | 'icon';
  size?: 'sm' | 'md' | 'lg';
}

// "Schedule Next Meeting" everywhere in the product (Call Review, Deal
// Review) needs to agree on one thing: is this user's Google Calendar
// actually connected? If yes, send them straight to their calendar. If
// not, Kairo has no calendar to schedule into -- say so plainly and point
// at Settings, rather than opening a blank/broken calendar view.
export function ScheduleMeetingButton({ userId, className, variant = 'secondary', size = 'md' }: ScheduleMeetingButtonProps) {
  const navigate = useNavigate();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!userId) return;
    checkCalendarConnected(userId).then(setConnected);
  }, [userId]);

  function handleClick() {
    if (connected) {
      window.open(GOOGLE_CALENDAR_URL, '_blank', 'noopener,noreferrer');
    } else {
      setShowPrompt(true);
    }
  }

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
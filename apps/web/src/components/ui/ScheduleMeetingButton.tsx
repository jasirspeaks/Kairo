import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, X } from 'lucide-react';
import { checkCalendarConnected, MeetingWithDeal } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { Button } from './Button';
import { UpgradeModal } from './UpgradeModal';
import { ScheduleMeetingModal } from './ScheduleMeetingModal';

interface ScheduleMeetingButtonProps {
  userId?: string;
  dealId?: string;
  dealName?: string;
  companyName?: string;
  className?: string;
  variant?: 'secondary' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  onMeetingScheduled?: (meeting: MeetingWithDeal) => void;
}

export function ScheduleMeetingButton({
  userId: propUserId,
  dealId,
  dealName,
  companyName,
  className,
  variant = 'secondary',
  size = 'md',
  onMeetingScheduled,
}: ScheduleMeetingButtonProps) {
  const { user } = useAuth();
  const userId = propUserId || user?.id;
  const navigate = useNavigate();
  const { canWrite } = useSubscription(userId);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  useEffect(() => {
    if (!userId) return;
    checkCalendarConnected(userId).then(setConnected);
  }, [userId]);

  async function handleClick() {
    if (!canWrite) {
      setShowUpgradeModal(true);
      return;
    }

    if (!connected) {
      setShowPrompt(true);
      return;
    }

    if (dealId) {
      setShowScheduleModal(true);
    }
  }

  const promptComponent = showPrompt && (
    <CalendarConnectPrompt
      onClose={() => setShowPrompt(false)}
      onGoToSettings={() => navigate('/app/settings')}
    />
  );

  return (
    <>
      {variant === 'icon' ? (
        <button
          onClick={handleClick}
          className={
            className ||
            'w-8 h-8 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors'
          }
          aria-label="Schedule Next Meeting"
        >
          <Calendar className="w-4 h-4" />
        </button>
      ) : (
        <Button
          variant="secondary"
          size={size}
          className={className}
          onClick={handleClick}
        >
          <Calendar className="w-4 h-4" /> Schedule Next Meeting
        </Button>
      )}

      {promptComponent}
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />

      {dealId && (
        <ScheduleMeetingModal
          open={showScheduleModal}
          onClose={() => setShowScheduleModal(false)}
          dealId={dealId}
          dealName={dealName}
          companyName={companyName}
          onMeetingScheduled={(m) => {
            if (onMeetingScheduled) onMeetingScheduled(m);
          }}
        />
      )}
    </>
  );
}

function CalendarConnectPrompt({
  onClose,
  onGoToSettings,
}: {
  onClose: () => void;
  onGoToSettings: () => void;
}) {
  return (
    <div className="mt-2 flex items-start gap-2 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 animate-fade-in">
      <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-textPrimary text-xs font-medium mb-0.5">
          Google Calendar isn't connected
        </p>
        <p className="text-textSecondary text-xs leading-relaxed mb-2">
          Connect your calendar in Settings to schedule meetings from Kairo.
        </p>
        <button
          onClick={onGoToSettings}
          className="text-primary text-xs font-semibold hover:underline"
        >
          Go to Settings →
        </button>
      </div>
      <button
        onClick={onClose}
        className="text-textMuted hover:text-textPrimary flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
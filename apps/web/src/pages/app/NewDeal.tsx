import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Building2, FileText, AlertCircle, DollarSign, Calendar, CheckCircle2, X, Mic } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reviewCall, saveDealState, resolveDealStage, checkCalendarConnected, getDealLongitudinalHistory } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../hooks/useSubscription';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { TopBar } from '../../components/layout/TopBar';
import { RecordCallScreen } from '../../components/record/RecordCallScreen';
import { UpgradeModal } from '../../components/ui/UpgradeModal';
import { ScheduleMeetingModal } from '../../components/ui/ScheduleMeetingModal';
import { INITIAL_DEAL_STAGE } from '../../types';
import { cn } from '../../lib/utils';

type Step = 'deal' | 'transcript' | 'record' | 'scheduled';

export function NewDeal() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { canWrite } = useSubscription(user?.id);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [step, setStep] = useState<Step>('deal');
  const [dealName, setDealName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [transcript, setTranscript] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // Set once "Schedule First Meeting" successfully creates the deal, so the
  // transcript step (if the user backs out and picks Upload First Call
  // instead) reuses the same deal row rather than creating a second one.
  // Also set when navigated here from DealReview's "Add a Call" empty-state
  // (via route state.existingDealId) -- in that case the deal already exists
  // and must never be deleted on unmount regardless of outcome.
  const [scheduledDealId, setScheduledDealId] = useState<string | null>(null);
  const scheduledDealIdRef = useRef<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const [creatingDeal, setCreatingDeal] = useState(false);

  // Tracks whether a meeting or call was successfully submitted so the unmount cleanup
  // knows NOT to delete the deal. Starts false.
  const meetingScheduledRef = useRef(false);
  const callSucceeded = useRef(false);

  // True when the deal row was created by a pre-existing deal (navigated
  // here from DealReview empty-state). We must NEVER delete it on unmount --
  // it has other data (stakeholders, deal_state) that we didn't create.
  const dealIsPreexisting = useRef(false);

  // Bootstrap from route state when DealReview's "Add a Call" empty-state
  // navigates here with an existing dealId. Jump straight to the transcript
  // step so the user doesn't have to re-enter deal info or create a new row.
  useEffect(() => {
    const state = location.state as { existingDealId?: string } | null;
    if (state?.existingDealId) {
      const existingId = state.existingDealId;
      setScheduledDealId(existingId);
      scheduledDealIdRef.current = existingId;
      dealIsPreexisting.current = true;
      setStep('transcript');

      supabase.from('deals').select('*').eq('id', existingId).single().then(({ data }) => {
        if (data) {
          setDealName(data.deal_name || '');
          setCompanyName(data.company_name || '');
          if (data.deal_value) setDealValue(String(data.deal_value));
        }
      });
    }
    // location.state is stable for the lifetime of this mount -- only run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    checkCalendarConnected(user.id).then(setCalendarConnected);
  }, [user]);

  // Orphan-deal cleanup: if we created a deal row but the user navigates
  // away before a meeting is scheduled or a call was successfully submitted,
  // delete the empty deal so it doesn't clutter the dashboard. Skip if the deal was
  // pre-existing (navigated here from DealReview) -- we don't own that row.
  useEffect(() => {
    return () => {
      const dealIdToDelete = scheduledDealIdRef.current;
      if (dealIdToDelete && !callSucceeded.current && !meetingScheduledRef.current && !dealIsPreexisting.current) {
        // Best-effort fire-and-forget -- no UI to report errors to at this point.
        supabase.from('deals').delete().eq('id', dealIdToDelete);
      }
    };
  }, []);

  async function createDealRow(): Promise<string | null> {
    if (!user) return null;
    const parsedValue = dealValue.trim() ? Number(dealValue.replace(/[,$]/g, '')) : null;

    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        user_id: user.id,
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        deal_stage: INITIAL_DEAL_STAGE,
        deal_value: parsedValue,
        status: 'active',
        risk_level: 'none',
      })
      .select()
      .single();

    if (dealError || !deal) {
      setError('Failed to create deal.');
      return null;
    }
    return deal.id;
  }

  // "Schedule First Meeting" -- opens canonical ScheduleMeetingModal
  async function handleScheduleFirstMeeting() {
    if (!dealName.trim() || !companyName.trim()) return;
    if (!canWrite) { setShowUpgradeModal(true); return; }
    if (!calendarConnected) {
      setShowConnectPrompt(true);
      return;
    }
    if (!user) return;

    setError('');
    setCreatingDeal(true);

    let dealId = scheduledDealIdRef.current ?? scheduledDealId;
    if (dealId) {
      // Update existing deal in case user changed deal basics
      const parsedValue = dealValue.trim() ? Number(dealValue.replace(/[,$]/g, '')) : null;
      await supabase
        .from('deals')
        .update({
          deal_name: dealName.trim(),
          company_name: companyName.trim(),
          deal_value: parsedValue,
        })
        .eq('id', dealId);
    } else {
      dealId = await createDealRow();
      if (!dealId) {
        setCreatingDeal(false);
        return;
      }
      setScheduledDealId(dealId);
      scheduledDealIdRef.current = dealId;
    }

    setCreatingDeal(false);
    setShowScheduleModal(true);
  }

  function handleUploadFirstCall(e: React.FormEvent) {
    e.preventDefault();
    if (!dealName.trim() || !companyName.trim()) return;
    if (!canWrite) { setShowUpgradeModal(true); return; }
    setStep('transcript');
  }

  function handleRecordNow() {
    if (!dealName.trim() || !companyName.trim()) return;
    if (!canWrite) { setShowUpgradeModal(true); return; }
    setError('');
    setStep('record');
  }

  // Passed to RecordCallScreen as `createDeal` -- only invoked on Stop,
  // reusing scheduledDealId if "Schedule First Meeting" already created
  // this deal earlier in the same visit, same pattern handleSubmit uses.
  async function handleCreateDealForRecording(): Promise<string | null> {
    if (scheduledDealIdRef.current) return scheduledDealIdRef.current;
    if (scheduledDealId) return scheduledDealId;
    const dealId = await createDealRow();
    if (dealId) {
      setScheduledDealId(dealId);
      scheduledDealIdRef.current = dealId;
    }
    return dealId;
  }

  function handleRecordingComplete(result: { conversationId: string; dealId: string }) {
    callSucceeded.current = true;
    navigate(`/app/deals/${result.dealId}/calls/${result.conversationId}`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!canWrite) { setShowUpgradeModal(true); return; }

    const text = transcript.trim();

    if (!text) { setError('Please paste a transcript before reviewing.'); return; }
    if (text.length < 100) { setError('Transcript is too short.'); return; }
    if (text.length > 50000) { setError('Transcript is too long.'); return; }

    setAnalyzing(true);
    setError('');

    let dealId: string | null = scheduledDealIdRef.current ?? scheduledDealId;
    let createdDealHere = false;

    try {
      if (!dealId) {
        dealId = await createDealRow();
        if (!dealId) throw new Error('Failed to create deal.');
        createdDealHere = true;
        setScheduledDealId(dealId);
        scheduledDealIdRef.current = dealId;
      }

      let previousReview: any = null;
      let hist: any = null;
      let currentStage = INITIAL_DEAL_STAGE;

      if (dealIsPreexisting.current && dealId) {
        const [{ data: existingState }, { data: existingDeal }, histData] = await Promise.all([
          supabase.from('deal_state').select('*').eq('deal_id', dealId).maybeSingle(),
          supabase.from('deals').select('deal_stage').eq('id', dealId).maybeSingle(),
          getDealLongitudinalHistory(dealId).catch(() => null),
        ]);
        if (existingDeal?.deal_stage) currentStage = existingDeal.deal_stage;
        if (existingState) {
          previousReview = (existingState as any).deal ? existingState : { deal: existingState, call: null };
        }
        hist = histData;
      }

      const review = await reviewCall(text, {
        deal_id: dealId || undefined,
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        deal_stage: currentStage,
        previous_review: previousReview,
        longitudinal_history: hist || undefined,
        seller_context: {
          what_you_sell: profile?.what_you_sell || undefined,
          who_you_are: profile?.who_you_are || undefined,
        },
      });

      const resolvedStage = resolveDealStage(currentStage, review);

      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: dealId,
          deal_stage: resolvedStage,
          input_type: 'transcript',
          transcript: text,
          status: 'complete',
          analysis_json: review,
        })
        .select()
        .single();

      if (convError || !conv) throw new Error('Failed to save conversation.');

      // Persist deal review state and pass conversationId for atomic evidence & history tracking
      await saveDealState(dealId, user.id, review, resolvedStage, conv.id);

      callSucceeded.current = true;
      navigate(`/app/deals/${dealId}/calls/${conv.id}`);

    } catch (err: any) {
      // Only delete the deal if we created it in this submission -- a deal
      // that already existed (created earlier via Schedule First Meeting)
      // must survive a failed transcript review.
      if (dealId && createdDealHere) {
        await supabase.from('deals').delete().eq('id', dealId);
      }
      setError(err.message || 'Something went wrong. Please try again.');
      setAnalyzing(false);
    }
  }

  if (analyzing) {
    return (
      <div className="min-h-[calc(100vh-64px)]">
        <LoadingState phase="analyzing" />
      </div>
    );
  }

  if (step === 'record') {
    return (
      <RecordCallScreen
        dealId={scheduledDealId || undefined}
        createDeal={handleCreateDealForRecording}
        onComplete={handleRecordingComplete}
        onClose={() => setStep('deal')}
      />
    );
  }

  if (step === 'scheduled') {
    return (
      <div className="animate-fade-in">
        <div className="-mx-4 md:hidden">
          <TopBar title="Deal Created" />
        </div>
        <div className="min-h-[calc(100vh-64px)] md:min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="card p-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-2xl font-display font-bold text-textPrimary mb-2">
                {dealName} is on the board
              </h1>
              <p className="text-textSecondary text-sm leading-relaxed mb-8">
                Your first meeting with {companyName} is on the calendar. Kairo will start building the deal review as soon as the call happens.
              </p>
              <Button size="lg" className="w-full" onClick={() => navigate('/app/dashboard')}>
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-xl">
      {/* Mobile: TopBar handles back nav + title */}
      <div className="-mx-4 md:hidden">
        <TopBar
          title={step === 'deal' ? 'New Deal' : 'Add Transcript'}
          onBack={step === 'transcript' ? () => setStep('deal') : () => navigate(-1)}
        />
      </div>

      <div className="mb-6 md:mb-8">
        {/* Desktop-only back button, shown only on the transcript sub-screen */}
        <div className="hidden md:block">
          {step === 'transcript' && (
            <button
              onClick={() => setStep('deal')}
              className="flex items-center gap-1.5 text-textMuted hover:text-textPrimary text-xs mb-4 transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" /> Back
            </button>
          )}

          <h1 className="text-2xl font-display font-bold text-textPrimary mb-1">
            {step === 'deal' ? 'New Deal' : 'Add Transcript'}
          </h1>
          <p className="text-textSecondary text-sm">
            {step === 'deal'
              ? 'Start by naming the deal, then schedule the first call or upload one you already had.'
              : 'Paste the call transcript. Kairo will review the deal and identify what matters most.'
            }
          </p>
        </div>

        {/* Mobile: title/subtitle only, no step indicator */}
        <p className="text-textSecondary text-sm mt-3 md:hidden">
          {step === 'deal'
            ? 'Start by naming the deal, then schedule the first call or upload one you already had.'
            : 'Paste the call transcript. Kairo will review the deal and identify what matters most.'
          }
        </p>
      </div>

      {step === 'deal' && (
        <form onSubmit={handleUploadFirstCall} className="space-y-4">
          <div className="card p-4 md:p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Deal Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="text"
                  value={dealName}
                  onChange={e => setDealName(e.target.value)}
                  placeholder="e.g. Acme Corp — Enterprise Plan"
                  className="input-field pl-10"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Company Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">
                Deal Value <span className="text-textMuted">(optional)</span>
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted" />
                <input
                  type="text"
                  inputMode="decimal"
                  value={dealValue}
                  onChange={e => setDealValue(e.target.value)}
                  placeholder="e.g. 25000"
                  className="input-field pl-10"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex gap-2 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              disabled={!dealName.trim() || !companyName.trim() || creatingDeal}
              loading={creatingDeal}
              onClick={handleScheduleFirstMeeting}
            >
              <Calendar className="w-4 h-4" />
              Schedule First Meeting
            </Button>
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!dealName.trim() || !companyName.trim()}
            >
              <FileText className="w-4 h-4" />
              Upload First Call
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-textMuted text-xs">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="flex flex-col items-center gap-2 pt-1 pb-2">
            <button
              type="button"
              onClick={handleRecordNow}
              disabled={!dealName.trim() || !companyName.trim()}
              aria-label="Record call now"
              className="w-16 h-16 rounded-full bg-primary hover:bg-primaryLight text-white flex items-center justify-center shadow-purple-glow transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              <Mic className="w-6 h-6" />
            </button>
            <p className="text-textMuted text-xs">Record Now</p>
          </div>

          {showConnectPrompt && (
            <div className="flex items-start gap-2 bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-3 animate-fade-in">
              <Calendar className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-textPrimary text-xs font-medium mb-0.5">Google Calendar isn't connected</p>
                <p className="text-textSecondary text-xs leading-relaxed mb-2">
                  Connect your calendar in Settings to schedule the first meeting from here. For now, you can still upload a call you already had.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/app/settings')}
                  className="text-primary text-xs font-semibold"
                >
                  Go to Settings →
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectPrompt(false)}
                className="text-textMuted flex-shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </form>
      )}

      {step === 'transcript' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="card p-4 md:p-6 space-y-4">
            <div className="flex items-center gap-3 pb-4 border-b border-border">
              <div className="w-8 h-8 rounded-lg bg-primary/8 border border-primary/15 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-textPrimary text-sm font-medium truncate">{dealName}</p>
                <p className="text-textMuted text-xs">{companyName}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-textSecondary">Transcript</label>
                {transcript.length > 0 && (
                  <span className={cn(
                    'text-xs',
                    transcript.length > 50000 ? 'text-red-400 font-semibold' :
                    transcript.length > 40000 ? 'text-amber-400 font-medium' : 'text-textMuted'
                  )}>
                    {transcript.length.toLocaleString()} / 50,000 chars
                  </span>
                )}
              </div>
              <textarea
                value={transcript}
                onChange={e => setTranscript(e.target.value)}
                placeholder={`Paste your call transcript here.\n\nRep: Thanks for taking the time today...\nProspect: Of course...\n\nInclude speaker labels for better analysis.`}
                className="input-field min-h-56 md:min-h-64 resize-y font-mono text-xs leading-relaxed"
                autoFocus
              />
              <p className="text-xs text-textMuted mt-1.5">
                {transcript.length > 0
                  ? `${transcript.trim().split(/\s+/).filter(Boolean).length} words`
                  : 'Include speaker labels (Rep: / Prospect:) for best results'
                }
              </p>
            </div>
          </div>

          {error && (
            <div className="flex gap-2 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={!transcript.trim()}>
            <FileText className="w-4 h-4" />
            Review Deal
          </Button>
        </form>
      )}

      <UpgradeModal open={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} />

      {scheduledDealId && (
        <ScheduleMeetingModal
          open={showScheduleModal}
          onClose={() => {
            setShowScheduleModal(false);
            if (meetingScheduledRef.current) {
              setStep('scheduled');
            }
          }}
          dealId={scheduledDealId}
          dealName={dealName}
          companyName={companyName}
          onMeetingScheduled={() => {
            meetingScheduledRef.current = true;
          }}
        />
      )}
    </div>
  );
}
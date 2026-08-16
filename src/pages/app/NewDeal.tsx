import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, FileText, AlertCircle, DollarSign, Layers, Calendar, CheckCircle2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { reviewCall, saveDealState, saveStakeholders, getRiskLevel, resolveDealStage, checkCalendarConnected, syncGoogleCalendar, GOOGLE_CALENDAR_URL } from '../../lib/kairo';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { TopBar } from '../../components/layout/TopBar';
import { DEAL_STAGES, DealStage } from '../../types';

type Step = 'deal' | 'transcript' | 'awaiting-meeting' | 'scheduled';

// How long we let a "Schedule First Meeting" click wait for the event to
// show up as assigned before giving up quietly. Mirrors the intent window
// google-calendar-sync uses, plus a little slack for the sync round-trip.
const AWAIT_MEETING_TIMEOUT_MS = 20_000;
const AWAIT_MEETING_POLL_MS = 1500;

export function NewDeal() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [step, setStep] = useState<Step>('deal');
  const [dealName, setDealName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [dealStage, setDealStage] = useState<DealStage>('Qualification');
  const [dealValue, setDealValue] = useState('');
  const [transcript, setTranscript] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');

  // Set once "Schedule First Meeting" successfully creates the deal, so the
  // transcript step (if the user backs out and picks Upload First Call
  // instead) reuses the same deal row rather than creating a second one.
  const [scheduledDealId, setScheduledDealId] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [showConnectPrompt, setShowConnectPrompt] = useState(false);
  const [creatingDeal, setCreatingDeal] = useState(false);
  const awaitingReturn = useRef(false);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    checkCalendarConnected(user.id).then(setCalendarConnected);
  }, [user]);

  useEffect(() => {
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  function clearPolling() {
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
  }

  // The only reliable signal that a meeting actually got scheduled: a
  // scheduled_meetings row assigned to this deal. syncGoogleCalendar()
  // itself returns void, so after triggering a sync we poll the table
  // directly rather than trusting that the fetch alone means success.
  async function checkForAssignedMeeting(dealId: string): Promise<boolean> {
    const { data } = await supabase
      .from('scheduled_meetings')
      .select('id')
      .eq('deal_id', dealId)
      .eq('status', 'assigned')
      .limit(1)
      .maybeSingle();
    return !!data;
  }

  function beginAwaitingMeeting(dealId: string) {
    setStep('awaiting-meeting');

    pollIntervalRef.current = setInterval(async () => {
      const found = await checkForAssignedMeeting(dealId);
      if (found) {
        clearPolling();
        setStep('scheduled');
      }
    }, AWAIT_MEETING_POLL_MS);

    pollTimeoutRef.current = setTimeout(() => {
      clearPolling();
      // No assigned meeting turned up in time -- the user either didn't
      // finish scheduling or made an event with no video link. Return
      // quietly to deal info; the deal itself is already saved.
      setStep('deal');
    }, AWAIT_MEETING_TIMEOUT_MS);
  }

  // Fires when the user comes back to this tab after Google Calendar opened.
  useEffect(() => {
    async function handleFocus() {
      if (!awaitingReturn.current) return;
      awaitingReturn.current = false;
      await syncGoogleCalendar();
      if (scheduledDealId) {
        const found = await checkForAssignedMeeting(scheduledDealId);
        if (found) {
          clearPolling();
          setStep('scheduled');
        }
        // If not found yet, the background poll (already running) keeps
        // checking until AWAIT_MEETING_TIMEOUT_MS.
      }
    }
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [scheduledDealId]);

  async function createDealRow(): Promise<string | null> {
    if (!user) return null;
    const parsedValue = dealValue.trim() ? Number(dealValue.replace(/[,$]/g, '')) : null;

    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .insert({
        user_id: user.id,
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        deal_stage: dealStage,
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

  // "Schedule First Meeting" -- only does anything if calendar is connected.
  // If it's not, this is a no-op other than surfacing the connect prompt;
  // no deal gets created and nothing opens.
  async function handleScheduleFirstMeeting() {
    if (!calendarConnected) {
      setShowConnectPrompt(true);
      return;
    }
    if (!user) return;

    setError('');
    setCreatingDeal(true);

    const dealId = scheduledDealId ?? await createDealRow();

    if (!dealId) {
      setCreatingDeal(false);
      return;
    }
    setScheduledDealId(dealId);

    // Best-effort -- if this write fails the user still reaches Google
    // Calendar, they'd just need to assign the meeting manually afterward.
    await supabase.from('pending_schedule_intents').insert({ user_id: user.id, deal_id: dealId });
    awaitingReturn.current = true;

    setCreatingDeal(false);
    window.open(GOOGLE_CALENDAR_URL, '_blank', 'noopener,noreferrer');
    beginAwaitingMeeting(dealId);
  }

  function handleUploadFirstCall(e: React.FormEvent) {
    e.preventDefault();
    if (!dealName.trim() || !companyName.trim()) return;
    setStep('transcript');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const text = transcript.trim();

    if (!text) { setError('Please paste a transcript before reviewing.'); return; }
    if (text.length < 100) { setError('Transcript is too short.'); return; }
    if (text.length > 50000) { setError('Transcript is too long.'); return; }

    setAnalyzing(true);
    setError('');

    let dealId: string | null = scheduledDealId;
    let createdDealHere = false;

    try {
      if (!dealId) {
        dealId = await createDealRow();
        if (!dealId) throw new Error('Failed to create deal.');
        createdDealHere = true;
      }

      // First call for this deal: call-review still produces the full
      // deal-shaped extraction (call + deal halves) -- there's no separate
      // "first call" code path on the frontend, the AI handles that
      // distinction internally based on previous_review being null.
      const review = await reviewCall(text, {
        deal_name: dealName.trim(),
        company_name: companyName.trim(),
        deal_stage: dealStage,
        previous_review: null,
        seller_context: {
          what_you_sell: profile?.what_you_sell || undefined,
          who_you_are: profile?.who_you_are || undefined,
        },
      });

      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          deal_id: dealId,
          deal_stage: dealStage,
          input_type: 'transcript',
          transcript: text,
          status: 'complete',
          analysis_json: review,
        })
        .select()
        .single();

      if (convError || !conv) throw new Error('Failed to save conversation.');

      // Deal Review needs data starting at call 1, not just call 2+.
      // review.deal is already the complete current-state extraction --
      // write it straight to deal_state, no aggregation step.
      await saveDealState(dealId, user.id, review);
      await saveStakeholders(dealId, user.id, review);

      // A first call can already be an explicit close (logging a deal
      // that was won or lost before the seller started using Kairo) --
      // resolveDealStage promotes to Closed Won/Lost only when the AI's
      // read is unambiguous, otherwise it's a no-op and the stage the
      // user picked stands.
      const resolvedStage = resolveDealStage(dealStage, review.deal.status);

      await supabase.from('deals').update({
        deal_stage: resolvedStage,
        risk_level: getRiskLevel(review.deal.status),
        updated_at: new Date().toISOString(),
      }).eq('id', dealId);

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

  if (step === 'awaiting-meeting') {
    return (
      <div className="animate-fade-in">
        <div className="-mx-4 md:hidden">
          <TopBar title="Scheduling" />
        </div>
        <div className="min-h-[calc(100vh-64px)] md:min-h-[calc(100vh-160px)] flex items-center justify-center px-4">
          <div className="flex flex-col items-center text-center max-w-xs">
            <div className="relative mb-8">
              <div className="w-14 h-14 rounded-full border-2 border-border flex items-center justify-center">
                <div className="w-10 h-10 rounded-full border-2 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
              </div>
            </div>
            <p className="text-textPrimary font-semibold font-display text-lg mb-2">
              Waiting for your meeting
            </p>
            <p className="text-textSecondary text-sm">
              Finish scheduling in Google Calendar, then come back here. Kairo will pick it up automatically.
            </p>
          </div>
        </div>
      </div>
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
              <label className="block text-xs font-medium text-textSecondary mb-1.5">Deal Stage</label>
              <div className="relative">
                <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-textMuted pointer-events-none" />
                <select
                  value={dealStage}
                  onChange={e => setDealStage(e.target.value as DealStage)}
                  className="input-field pl-10 appearance-none"
                >
                  {DEAL_STAGES.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
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
                <p className="text-textMuted text-xs">{companyName} · {dealStage}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1.5">Transcript</label>
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
    </div>
  );
}
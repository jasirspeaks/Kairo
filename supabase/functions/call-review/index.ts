import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const GEMINI_MODEL_OVERRIDE = Deno.env.get('GEMINI_MODEL');
const MODEL_CHAIN = GEMINI_MODEL_OVERRIDE
  ? [GEMINI_MODEL_OVERRIDE]
  : ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

// Deal Stage values Kairo tracks -- kept in sync manually with DEAL_STAGES
// in src/types/index.ts. Closed Won/Closed Lost are NEVER produced here;
// those are derived separately from deal.status in resolveDealStage()
// (src/lib/kairo.ts) and its edge-function equivalent
// (_shared/deal-writeback.ts). This list exists so the model's
// suggested_deal_stage can be validated against a known set.
const DEAL_STAGE_VALUES = [
  'Qualification',
  'Discovery',
  'Demo',
  'Evaluation',
  'Alignment',
  'Proposal',
  'Negotiation',
  'Procurement',
  'Decision',
] as const;

const SYSTEM_PROMPT = `You are Kairo.

Kairo is a deal intelligence system. The deal is the object under evaluation. This call is one piece of evidence about it. It is not the thing being reviewed.

You are not a coach, not a note-taker, not a summarizer. You are the most experienced revenue leader in the building, the one every AE dreads and wants in the room before a big call, because they catch the thing everyone else missed. You have sat through thousands of deals. You know exactly how deals actually die: not from a single bad call, but from a seller's optimism compounding quietly over three or four calls until the deal collapses in week 11 and nobody saw it coming, except it was visible the whole time to anyone looking for it.

Your only job: find what's being missed, before it costs the deal.

THE CENTRAL DISCIPLINE: YOU ARE NOT HERE TO BE NICE

Left unchecked, you will default to reading transcripts charitably, treating a friendly tone as commitment, a scheduled follow-up as momentum, politeness as buy-in. This is the single most common failure in deal analysis. Every seller can already tell when a call felt good. They cannot tell what it actually proved.

Your default posture is skeptical, not supportive. Assume nothing was confirmed unless the buyer said it. Silence is not agreement. A scheduled next meeting is not evidence the deal is healthy. Treat friendliness and enthusiasm as neutral signals unless anchored to something concrete: a stated timeline, a named decision process, a budget figure, an internal champion doing something specific for you.

If you find yourself about to write something reassuring, stop and ask: what, specifically, did the buyer say or do that earns this? If you can't point to it, downgrade the assessment.

THE DEAL QUALIFICATION MODEL YOU REASON AGAINST

Reason against these five load-bearing pillars on every call and every deal-level assessment. A deal is only as strong as its weakest pillar, and a weak pillar the seller doesn't know about is the single most dangerous state a deal can be in.

1. COMPELLING EVENT - Is there a real reason this needs to happen by a specific date, or is the timeline soft? A stated deadline tied to a business consequence is strong. A soft preference is weak.

2. ECONOMIC BUYER ENGAGEMENT - Has the person who actually controls budget been in the room, spoken, or been specifically named with a next step? Single-threaded deals are structurally fragile.

3. DECISION PROCESS CLARITY - Does the seller know how this actually gets decided: who's involved, what steps happen, roughly how long it takes? Or is the process still a black box being assumed rather than confirmed?

4. BUDGET REALITY - Has budget been discussed in concrete terms, or is it assumed because the buyer seems like they can afford it? Budget silence in a multi-call deal is a bigger red flag than on a first call.

5. CHAMPION STRENGTH - Is there someone on the buyer side who will advocate for this when the seller isn't in the room, meaning they've taken a specific action that costs them something? Or is the champion just the friendliest person who took the meeting?

When you assess call_status, deal.status, and health_score, you are implicitly scoring these five pillars. A call full of warm rapport and zero movement on any pillar is not On Track. It's a call that produced no new evidence, which is itself a finding worth surfacing.

PILLAR STATUS (deal.pillars): externalizing the five-pillar read

Alongside the deal-level narrative fields, you must also emit a structured pillars object scoring each of the five pillars above individually. This is not a new judgment, it is the same reasoning you already do above, written down explicitly instead of only being implied by health_score and what_youre_missing.

For EACH of the five pillars (compelling_event, economic_buyer, decision_process, budget, champion) assign exactly one status:

- confirmed: A specific, stated fact anchors this pillar. Not a vibe, not friendliness. An actual date, name, number, or process the buyer stated or clearly confirmed.
- partial: Some real signal exists but it's incomplete, indirect, or not yet anchored to a specific fact.
- unconfirmed: This pillar is relevant at this deal's current stage and has genuinely not been addressed, or was asked about and got no real answer. This is a real, current gap, not just an early deal.
- not_yet_relevant: This deal has not reached the point in its lifecycle where this pillar would normally be assessed. Use this ONLY when the deal's stage genuinely explains the absence, e.g. Budget Reality or Decision Process Clarity on a first Qualification-stage call, before discovery has happened. Do NOT use not_yet_relevant as a softer way of saying wasn't discussed once a deal is past early discovery; at that point an untouched pillar is unconfirmed, not not_yet_relevant. Compelling Event and Champion Strength are rarely not_yet_relevant even early, since both can surface in a first conversation.

Each pillar also gets an evidence string: one short, specific line citing what was said (for confirmed/partial), what's missing (for unconfirmed), or why the stage makes it not yet applicable (for not_yet_relevant). Empty string is acceptable only if there is truly nothing to cite.

Each pillar also gets a confidence integer from 0 to 100, a continuous read of how strongly evidenced this pillar is right now. The status and the confidence number must always agree:
- confirmed pairs with confidence 70-100. Stronger, more specific evidence sits higher in that range.
- partial pairs with confidence 35-69. More real signal sits higher in that range; a single indirect hint sits lower.
- unconfirmed pairs with confidence 0-34. Total silence on a pillar after multiple calls sits at the bottom of that range, not the top.
- not_yet_relevant always pairs with confidence 0, since the number is not meaningful or displayed for this status.
Do not default to round, noncommittal numbers like 50 or 70 out of hesitation. Commit to a specific number reflecting exactly what you observed, the same way you commit to the status itself.

Score pillars against the deal's FULL history when prior deal state is provided, not just this call, the same multi-call discipline that applies to deal.status and deal.highest_priority_risk applies here. A pillar unconfirmed for the third call running should still be scored unconfirmed, with evidence noting the persistence, and its confidence should sit lower than a pillar unconfirmed for the first time.

The pillars object must always contain exactly these five keys, every time, first call or not.

DEAL STAGE INFERENCE (deal.suggested_deal_stage)

Alongside status, health, and pillars, you must also infer what Deal Stage this deal now sits at, based on what has concretely happened across the deal's history (this call plus any prior calls), not what the seller hopes happens next.

The stages, in forward order, are: Qualification, Discovery, Demo, Evaluation, Alignment, Proposal, Negotiation, Procurement, Decision.

- Qualification: Early contact; still establishing whether this is a real fit worth pursuing.
- Discovery: Actively exploring the buyer's problem, needs, current state -- no demo or solution walkthrough has happened yet.
- Demo: A product/solution walkthrough has actually been given (not just scheduled).
- Evaluation: The buyer is actively assessing the solution post-demo -- trials, technical review, comparing options.
- Alignment: Working to get internal stakeholders (beyond the primary contact) aligned on moving forward.
- Proposal: A formal proposal, pricing, or scope has actually been sent or presented.
- Negotiation: Terms, pricing, or scope are being actively negotiated back and forth.
- Procurement: Commercial/legal process (contracts, security review, procurement) is underway.
- Decision: Final decision-maker review through waiting on a signature.

Rules for this inference:
- Base it on concrete events that happened (a demo was given, a proposal was sent, pricing was negotiated), never on what's scheduled, hoped for, or merely discussed as a future step. A demo being scheduled for next week does NOT move the deal to Demo stage; the deal reaches Demo stage only once that demo has actually happened.
- Stages only ever move forward or stay the same from this inference. If this call shows no clear evidence of forward progress past the deal's current stage, suggested_deal_stage should simply repeat the current stage -- do not infer a forward stage you can't support, and do not infer a backward one.
- The ONLY exception is stage_regression_override (see below): a rare, explicit case where the deal has genuinely reopened qualification.
- Do not skip stages you have no evidence for. If a proposal was just sent but there's no evidence Evaluation or Alignment ever concretely happened, it's still reasonable to move to Proposal directly -- infer the furthest concretely-evidenced stage, not a mechanical one-step-at-a-time crawl.
- If no prior deal state was provided (first call) and no deal_stage is given in context, infer the most concretely evidenced stage from this call alone, defaulting to Qualification if the call is too early to tell.

STAGE REGRESSION OVERRIDE (deal.stage_regression_override)

This is a boolean, defaulting to false. Set it to true ONLY when this call contains explicit, unambiguous evidence that the deal has genuinely regressed and needs to be requalified from an earlier stage than where it currently sits -- for example, the buyer explicitly says the project is being reopened from scratch, a key stated requirement changed such that prior discovery no longer holds, or the buyer explicitly says they need to restart evaluation. This must be a rare, high-confidence call. Do not set this to true merely because a call was quiet, unproductive, or failed to move any pillar forward -- that is simply "no forward progress," which is handled by suggested_deal_stage staying the same, not a regression. When true, suggested_deal_stage should reflect the stage the deal has genuinely fallen back to, and deal.status_reason or deal.manager_note should explain why.

TWO INDEPENDENT LEVELS OF JUDGMENT

You produce two assessments that must NOT mirror each other:

1. CALL-LEVEL (call): How did THIS conversation go, judged on its own terms against the five pillars above, what did it prove or fail to prove?
2. DEAL-LEVEL (deal): What is the deal's overall current condition, given this call plus everything before it?

These diverge constantly, and should. A call can go well while the deal stays At Risk, because the economic buyer still hasn't appeared after three calls and nothing in today's call changed that. Do not let today's tone drag the deal-level read.

deal.highest_priority_risk is the single most dangerous unresolved issue for the deal RIGHT NOW across its full history, it does not need to come from this call. call.highest_priority_risk is scoped to only what this specific call surfaced.

PROCESS: DO THIS BEFORE YOU WRITE A SINGLE OUTPUT FIELD

1. Read the whole transcript once for what actually happened, ignoring tone.
2. Score the five pillars above for this call: which were touched, which moved, which are still unconfirmed.
3. If prior deal state was provided, score the same five pillars against the deal's full history, not just today.
4. Separate what was STATED from what was IMPLIED from what is simply ABSENT.
5. Identify the single fact that, if the seller doesn't act on it, is most likely to quietly kill this deal. That is your highest_priority_risk, at both levels.
6. Determine suggested_deal_stage from concrete events only, per the rules above, and stage_regression_override only if the rare explicit-regression bar is met.
7. Only after 1-6 are done, decide call_status, deal.status, and deal.pillars.

DEAL HEALTH SCORE (deal.health_score): DERIVED, NOT INDEPENDENTLY CHOSEN

health_score is not a separate judgment call. It is the arithmetic consequence of the five pillar confidence numbers you just wrote into deal.pillars. Compute it LAST, after deal.pillars is finalized, as the average of the confidence values for every pillar whose status is NOT not_yet_relevant. Round to the nearest integer.

Do not pick a health_score first and then adjust pillar confidences to match it -- that is backwards and produces exactly the kind of contradiction (e.g. a 90 health score sitting on top of five unconfirmed pillars) that makes this system untrustworthy. The pillars are the evidence; health_score is only ever a summary of that evidence, never an independent vibe. If your instinct for health_score disagrees with what the pillar confidences average out to, the pillar confidences are correct and your instinct is wrong -- revisit the pillars, not the score. A server-side check recomputes this value from your own pillars object and will silently overwrite anything inconsistent, so there is no benefit to hand-picking a rounder or more flattering number.

Never decide deal.status or health_score before finishing deal.pillars. Never let today's tone push either upward without pillar evidence behind it.

CONFIDENCE (deal.confidence)

- High: explicit, direct buyer statements anchor the assessment.
- Medium: reasonable inference from behavior or indirect statements.
- Low: a single ambiguous signal, sparse transcript, or conflicting evidence.

SPEAKER IDENTIFICATION

Transcripts label speakers as [SELLER] and [BUYER] (or equivalent). If unlabeled, infer from context. Proceed without asking for clarification.

MULTI-CALL CONTEXT

If prior deal state is provided, compare this transcript against it using the five pillars as your comparison lens. Feed this into deal.status_reason, deal.highest_priority_risk, deal.what_youre_missing, deal.manager_note, deal.pillars, and deal.suggested_deal_stage.

A pillar that was unconfirmed last call and is STILL unconfirmed this call is a compounding risk, treated with more urgency the second and third time, not the same urgency.

If this is the FIRST call for the deal (no prior state provided), OMIT the what_changed_since_last_call key entirely, not null, not empty, absent.

MULTI-CALL OUTPUT: when not the first call, include what_changed_since_last_call as an object with three arrays: resolved, persists, new_risks. Leave any array empty if there's nothing real to report. Do not manufacture entries to fill a category.

STAKEHOLDER SIGNALS

Identify every named buyer-side person mentioned or speaking (seller-side people are never stakeholders). For each: role if stated or clearly inferable, and sentiment based on concrete behavior in this call: champion, supporter, neutral, skeptic, or blocker. Do not default people to champion or supporter just because they were friendly. Only include people with enough signal to assess. Empty array is valid and common.

READING BEHAVIORAL SIGNAL

Weigh hesitation, evasive answers, deflection, passive language around timelines, over-politeness masking non-commitment. Weigh these only when they meaningfully shift your read on the five pillars. Weigh positive signal with the same rigor. Never comment on the seller's communication style, tone, personality, or skill.

CALL STATUS (call.call_status): this call alone

- On Track: This call moved at least one pillar forward with real evidence, or confirmed something previously assumed.
- Needs Attention: The call was fine on the surface but didn't move any pillar, or surfaced a real but non-fatal gap.
- At Risk: The call surfaced a serious, specific concern.
- Stalled: No forward evidence at all.

DEAL STATUS (deal.status): the deal's overall current condition

- Unknown: Genuinely thin signal.
- Healthy: Multiple pillars confirmed with real evidence; no critical unknown threatens progression right now.
- Promising: Real forward motion and at least some confirmed pillars, but one or more remain genuinely open.
- At Risk: A specific, named pillar gap is blocking confident progression and hasn't moved across recent calls.
- Critical: A severe, deal-threatening fact is present and unresolved.
- Stalled: Engagement has visibly plateaued.
- Recovering: Was At Risk/Critical/Stalled, and this call shows real, evidenced re-engagement.
- Won / Lost: Only when explicitly and unambiguously stated as closed.

Most engaged, multi-call deals that still have one real open pillar are At Risk, not Healthy. Still talking is not health. deal.status must be consistent with deal.pillars: do not mark a deal Healthy while most pillars are unconfirmed, and do not mark a deal At Risk or Critical while most pillars are confirmed with no named blocker. If you notice that tension while writing status_reason, resolve it by fixing status (or the pillars, if they were the ones scored too hastily) before finalizing your answer -- do not submit an internally contradictory deal record.

FIELD-BY-FIELD RULES

VERDICT (call.verdict): one sentence, max ~15 words, specific to this call.

REASON (call.reason): 1-2 sentences, the evidence behind the verdict.

MISSING INFORMATION (call.what_youre_missing / deal.what_youre_missing): up to 3 each, keyed to the five pillars where possible. Empty array is valid.

RECOMMENDED NEXT ACTION (call.recommended_next_action / deal.recommended_next_action): one sentence each, concrete and specific, never generic.

KEY FOLLOW-UP MESSAGE (call.key_follow_up_message): short, natural, ready-to-send, only when it genuinely adds value. Return empty string if not.

MANAGER NOTE (call.manager_note / deal.manager_note): max 20 words each, blunt and judgment-oriented.

SUPPORTING EVIDENCE: 2-4 of the strongest observations from this transcript at the deal level, each tied to a pillar or a concrete signal.

PILLARS (deal.pillars): see the dedicated section above. Exactly five keys, every time: compelling_event, economic_buyer, decision_process, budget, champion.

DEAL STAGE (deal.suggested_deal_stage / deal.stage_regression_override): see the dedicated sections above.

STYLE

Sound like a revenue leader who has money riding on this deal. No coaching language, no hedging filler. State things plainly. Be ruthless about specificity. Be economical with words.

Return valid JSON only. No explanations. No markdown.

BASE SCHEMA (first call, no what_changed_since_last_call key):
{
  "call": {
    "call_status": "On Track | Needs Attention | At Risk | Stalled",
    "verdict": "",
    "reason": "",
    "highest_priority_risk": { "risk": "", "why_it_matters": "", "evidence": "" },
    "what_youre_missing": [ { "gap": "", "question_to_answer": "" } ],
    "recommended_next_action": "",
    "key_follow_up_message": "",
    "manager_note": ""
  },
  "deal": {
    "status": "Unknown | Healthy | Promising | At Risk | Critical | Stalled | Recovering | Won | Lost",
    "confidence": "High | Medium | Low",
    "status_reason": "",
    "health_score": 0,
    "highest_priority_risk": { "risk": "", "why_it_matters": "", "evidence": "" },
    "what_youre_missing": [ { "gap": "", "question_to_answer": "" } ],
    "recommended_next_action": "",
    "manager_note": "",
    "suggested_deal_stage": "Qualification | Discovery | Demo | Evaluation | Alignment | Proposal | Negotiation | Procurement | Decision",
    "stage_regression_override": false,
    "pillars": {
      "compelling_event": { "status": "confirmed | partial | unconfirmed | not_yet_relevant", "confidence": 0, "evidence": "" },
      "economic_buyer": { "status": "confirmed | partial | unconfirmed | not_yet_relevant", "confidence": 0, "evidence": "" },
      "decision_process": { "status": "confirmed | partial | unconfirmed | not_yet_relevant", "confidence": 0, "evidence": "" },
      "budget": { "status": "confirmed | partial | unconfirmed | not_yet_relevant", "confidence": 0, "evidence": "" },
      "champion": { "status": "confirmed | partial | unconfirmed | not_yet_relevant", "confidence": 0, "evidence": "" }
    }
  },
  "stakeholder_signals": [
    { "name": "", "role": "", "sentiment": "champion | supporter | neutral | skeptic | blocker", "evidence": "" }
  ],
  "supporting_evidence": [ "" ]
}

SUBSEQUENT-CALL SCHEMA (include what_changed_since_last_call at the top level, alongside call/deal):
{
  "call": { ...same shape as above... },
  "deal": { ...same shape as above, including pillars, suggested_deal_stage, and stage_regression_override... },
  "what_changed_since_last_call": {
    "resolved": [],
    "persists": [],
    "new_risks": []
  },
  "stakeholder_signals": [
    { "name": "", "role": "", "sentiment": "champion | supporter | neutral | skeptic | blocker", "evidence": "" }
  ],
  "supporting_evidence": [ "" ]
}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_DEAL_STATUSES = new Set([
  'Unknown', 'Healthy', 'Promising', 'At Risk', 'Critical', 'Stalled', 'Recovering', 'Won', 'Lost',
]);
const VALID_CALL_STATUSES = new Set(['On Track', 'Needs Attention', 'At Risk', 'Stalled']);
const VALID_CONFIDENCE = new Set(['High', 'Medium', 'Low']);
const VALID_SENTIMENTS = new Set(['champion', 'supporter', 'neutral', 'skeptic', 'blocker']);
const VALID_PILLAR_STATUSES = new Set(['confirmed', 'partial', 'unconfirmed', 'not_yet_relevant']);
const PILLAR_KEYS = ['compelling_event', 'economic_buyer', 'decision_process', 'budget', 'champion'] as const;
const VALID_DEAL_STAGES = new Set<string>(DEAL_STAGE_VALUES);

type Json = Record<string, unknown>;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function normalizeRisk(risk: unknown, label: string): Json {
  const r = risk as Json | undefined;
  if (!r || typeof r.risk !== 'string' || !r.risk.trim()) {
    throw new Error(`Missing ${label}.risk.`);
  }
  return {
    risk: r.risk,
    why_it_matters: typeof r.why_it_matters === 'string' ? r.why_it_matters : '',
    evidence: typeof r.evidence === 'string' ? r.evidence : '',
  };
}

function normalizeMissing(arr: unknown, label: string): Json[] {
  if (!Array.isArray(arr)) throw new Error(`${label} must be an array.`);
  return arr.slice(0, 3);
}

// Fallback confidence per status, used only when the model omits confidence
// entirely or returns something unusable (non-number, NaN, out of range for
// its own status band). Picked from the middle of each band's valid range
// so a fallback never looks more or less certain than the status it belongs
// to -- e.g. a fallback for "unconfirmed" should read as weak, not as a
// borderline "maybe partial" value.
const PILLAR_CONFIDENCE_FALLBACK: Record<string, number> = {
  confirmed: 85,
  partial: 50,
  unconfirmed: 15,
  not_yet_relevant: 0,
};

const PILLAR_CONFIDENCE_RANGE: Record<string, [number, number]> = {
  confirmed: [70, 100],
  partial: [35, 69],
  unconfirmed: [0, 34],
  not_yet_relevant: [0, 0],
};

function normalizePillars(raw: unknown): Json {
  const src = (raw && typeof raw === 'object') ? (raw as Json) : {};
  const result: Json = {};

  for (const key of PILLAR_KEYS) {
    const entry = src[key] as Json | undefined;
    const status = entry && typeof entry.status === 'string' && VALID_PILLAR_STATUSES.has(entry.status)
      ? entry.status
      : 'unconfirmed';
    const evidence = entry && typeof entry.evidence === 'string' ? entry.evidence : '';

    const [min, max] = PILLAR_CONFIDENCE_RANGE[status];
    const rawConfidence = entry?.confidence;
    let confidence: number;
    if (typeof rawConfidence === 'number' && !Number.isNaN(rawConfidence) && rawConfidence >= min && rawConfidence <= max) {
      confidence = Math.round(rawConfidence);
    } else {
      confidence = PILLAR_CONFIDENCE_FALLBACK[status];
    }

    result[key] = { status, confidence, evidence };
  }

  return result;
}

// ---- Health score / status <-> pillar reconciliation -------------------
//
// health_score and deal.status used to be independent judgment calls the
// model made alongside deal.pillars, with nothing enforcing agreement
// between them. In practice this let a deal render with health_score: 90
// and deal.status: "Healthy" while every one of its five pillars sat at
// "unconfirmed" -- internally contradictory, and confusing on Deal Review
// where the pillar bars and the health ring are shown side by side.
//
// health_score is now DERIVED, not trusted from the model: it is always
// recomputed here as the average confidence across every pillar whose
// status isn't not_yet_relevant, rounded to the nearest integer. This
// makes the number and the bars agree by construction, regardless of what
// the model returned -- the SYSTEM_PROMPT above tells the model to do the
// same arithmetic itself, but this is the actual enforcement, since a
// model instruction alone doesn't guarantee compliance on every call.
//
// deal.status has no single deterministic formula the way health_score
// does (it also depends on named blockers, momentum, and history, which
// aren't captured in the pillar object alone) so it isn't overwritten
// outright. Instead, an obviously contradictory combination -- a status
// implying broad pillar strength while pillar evidence says otherwise, or
// vice versa -- is corrected to the nearest status the health_score
// actually supports. This only fires on a clear mismatch; it never
// second-guesses a status that's plausibly consistent with the pillars.
function averagePillarConfidence(pillars: Json): number | null {
  const entries = PILLAR_KEYS
    .map((key) => pillars[key] as { status: string; confidence: number })
    .filter((p) => p.status !== 'not_yet_relevant');

  if (entries.length === 0) return null;

  const sum = entries.reduce((acc, p) => acc + p.confidence, 0);
  return Math.round(sum / entries.length);
}

// Status bands mirror the SYSTEM_PROMPT's own health_score rubric:
// 80-100 -> Healthy-caliber evidence, 60-79 -> Promising-caliber, etc.
// Used only to catch a clearly contradictory deal.status, not to replace
// deal.status's own richer judgment (named blockers, momentum, closed
// deals) with a pure function of the pillar average.
const STATUSES_IMPLYING_STRONG_PILLARS = new Set(['Healthy']);
const STATUSES_IMPLYING_WEAK_PILLARS = new Set(['Critical']);
// Won/Lost/Recovering/Unknown are exempt from this check entirely --
// they describe deal trajectory or closure, not a pillar-evidence level,
// so a mismatch against the raw pillar average is expected and correct.
const STATUS_EXEMPT_FROM_PILLAR_CHECK = new Set(['Won', 'Lost', 'Recovering', 'Unknown']);

function reconcileHealthAndStatusWithPillars(deal: Json): Json {
  const pillars = deal.pillars as Json;
  const derivedScore = averagePillarConfidence(pillars);

  // No non-"not_yet_relevant" pillars at all is degenerate (shouldn't
  // happen given PILLAR_KEYS always has 5 entries and not every deal can
  // be not_yet_relevant on all five) -- if it ever does, leave the
  // model's own health_score in place rather than inventing a number.
  if (derivedScore !== null) {
    deal.health_score = derivedScore;
  }

  const status = deal.status as string;
  const score = deal.health_score as number;

  if (!STATUS_EXEMPT_FROM_PILLAR_CHECK.has(status)) {
    // Status says the deal looks strong (Healthy) but the derived score
    // says otherwise (this is exactly the bug this whole function exists
    // to catch) -- downgrade to the status the evidence actually supports.
    if (STATUSES_IMPLYING_STRONG_PILLARS.has(status) && score < 60) {
      deal.status = score >= 40 ? 'Promising' : 'At Risk';
    }
    // Status says the deal is in serious trouble (Critical) but the
    // derived score says pillars are actually mostly confirmed -- an
    // equally real contradiction the other direction.
    if (STATUSES_IMPLYING_WEAK_PILLARS.has(status) && score >= 60) {
      deal.status = score >= 80 ? 'Healthy' : 'Promising';
    }
  }

  return deal;
}

function normalizeCall(raw: unknown): Json {
  const call = raw as Json | undefined;
  if (!call || typeof call !== 'object') throw new Error('Missing call object.');

  if (typeof call.call_status !== 'string' || !VALID_CALL_STATUSES.has(call.call_status)) {
    throw new Error('Invalid call.call_status.');
  }
  if (typeof call.verdict !== 'string' || !call.verdict.trim()) {
    throw new Error('Missing call.verdict.');
  }
  if (typeof call.reason !== 'string' || !call.reason.trim()) {
    throw new Error('Missing call.reason.');
  }

  call.highest_priority_risk = normalizeRisk(call.highest_priority_risk, 'call.highest_priority_risk');
  call.what_youre_missing = normalizeMissing(call.what_youre_missing, 'call.what_youre_missing');

  if (typeof call.recommended_next_action !== 'string') call.recommended_next_action = '';
  if (typeof call.key_follow_up_message !== 'string') call.key_follow_up_message = '';

  if (typeof call.manager_note !== 'string') throw new Error('Missing call.manager_note.');
  if (wordCount(call.manager_note) > 20) {
    call.manager_note = call.manager_note.trim().split(/\s+/).slice(0, 20).join(' ');
  }

  return call;
}

// Falls back to 'Qualification' whenever the model omits suggested_deal_stage
// or returns something outside the known set -- this keeps a malformed
// response from ever silently regressing a deal (Qualification is always
// treated as the "no confident stage" floor by the caller's own advance-only
// comparison, which resolveDealStage-equivalents apply downstream).
function normalizeSuggestedStage(raw: unknown): string {
  if (typeof raw === 'string' && VALID_DEAL_STAGES.has(raw)) return raw;
  return 'Qualification';
}

function normalizeDeal(raw: unknown): Json {
  const deal = raw as Json | undefined;
  if (!deal || typeof deal !== 'object') throw new Error('Missing deal object.');

  if (typeof deal.status !== 'string' || !VALID_DEAL_STATUSES.has(deal.status)) {
    throw new Error('Invalid deal.status.');
  }
  if (typeof deal.confidence !== 'string' || !VALID_CONFIDENCE.has(deal.confidence)) {
    throw new Error('Invalid deal.confidence.');
  }
  if (typeof deal.status_reason !== 'string' || !deal.status_reason.trim()) {
    throw new Error('Missing deal.status_reason.');
  }
  if (typeof deal.health_score !== 'number' || Number.isNaN(deal.health_score)) {
    throw new Error('Missing or invalid deal.health_score.');
  }
  deal.health_score = Math.max(0, Math.min(100, Math.round(deal.health_score as number)));

  deal.highest_priority_risk = normalizeRisk(deal.highest_priority_risk, 'deal.highest_priority_risk');
  deal.what_youre_missing = normalizeMissing(deal.what_youre_missing, 'deal.what_youre_missing');
  deal.pillars = normalizePillars(deal.pillars);

  // Recompute health_score from deal.pillars, and correct deal.status if
  // it flatly contradicts what the pillars show. Must run after
  // deal.pillars is normalized (needs the cleaned confidence numbers) and
  // after deal.status/deal.health_score's own basic type checks above.
  const reconciled = reconcileHealthAndStatusWithPillars(deal);
  deal.health_score = reconciled.health_score;
  deal.status = reconciled.status;

  deal.suggested_deal_stage = normalizeSuggestedStage(deal.suggested_deal_stage);
  deal.stage_regression_override = deal.stage_regression_override === true;

  if (typeof deal.recommended_next_action !== 'string') deal.recommended_next_action = '';

  if (typeof deal.manager_note !== 'string') throw new Error('Missing deal.manager_note.');
  if (wordCount(deal.manager_note) > 20) {
    deal.manager_note = deal.manager_note.trim().split(/\s+/).slice(0, 20).join(' ');
  }

  return deal;
}

function normalizeStakeholders(raw: unknown): Json[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s: any) => s && typeof s.name === 'string' && s.name.trim())
    .map((s: any) => ({
      name: s.name,
      role: typeof s.role === 'string' ? s.role : null,
      sentiment: VALID_SENTIMENTS.has(s.sentiment) ? s.sentiment : null,
      evidence: typeof s.evidence === 'string' ? s.evidence : '',
    }));
}

function normalizeExtraction(raw: Json, isFirstCall: boolean): Json {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid extraction format returned by model.');
  }

  const call = normalizeCall(raw.call);
  const deal = normalizeDeal(raw.deal);

  if (isFirstCall) {
    delete raw.what_changed_since_last_call;
  } else {
    const delta = raw.what_changed_since_last_call as Json | undefined;
    if (!delta || typeof delta !== 'object') {
      throw new Error('Subsequent call must include what_changed_since_last_call.');
    }
    for (const key of ['resolved', 'persists', 'new_risks'] as const) {
      if (!Array.isArray(delta[key])) delta[key] = [];
    }
    raw.what_changed_since_last_call = delta;
  }

  raw.call = call;
  raw.deal = deal;
  raw.stakeholder_signals = normalizeStakeholders(raw.stakeholder_signals);

  if (!Array.isArray(raw.supporting_evidence)) raw.supporting_evidence = [];
  if ((raw.supporting_evidence as unknown[]).length > 4) {
    raw.supporting_evidence = (raw.supporting_evidence as unknown[]).slice(0, 4);
  }

  return raw;
}

function parseModelJson(text: string): Json {
  const clean = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('Model did not return JSON.');
  }

  return JSON.parse(clean.slice(start, end + 1));
}

async function callGemini(prompt: string, model: string): Promise<string> {
  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (geminiResponse.ok) {
    const geminiData = await geminiResponse.json();
    const finishReason = geminiData.candidates?.[0]?.finishReason;
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (finishReason === 'MAX_TOKENS') {
      throw new Error('MAX_TOKENS_TRUNCATED');
    }
    return text;
  }

  const err = await geminiResponse.json();
  const message = err.error?.message || 'Gemini API error';
  const isRateLimit =
    geminiResponse.status === 429 ||
    message.toLowerCase().includes('demand') ||
    message.toLowerCase().includes('quota') ||
    message.toLowerCase().includes('rate') ||
    message.toLowerCase().includes('overloaded') ||
    message.toLowerCase().includes('unavailable');

  if (isRateLimit) {
    throw new Error('RATE_LIMITED');
  }

  throw new Error(message);
}

async function callGeminiWithFallback(prompt: string): Promise<{ parsed: Json; modelUsed: string }> {
  let lastError: Error | null = null;

  for (let modelIndex = 0; modelIndex < MODEL_CHAIN.length; modelIndex++) {
    const model = MODEL_CHAIN[modelIndex];
    const perModelAttempts = 2;

    for (let attempt = 1; attempt <= perModelAttempts; attempt++) {
      try {
        const text = await callGemini(prompt, model);
        const parsed = parseModelJson(text);
        return { parsed, modelUsed: model };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const isRateLimit = lastError.message === 'RATE_LIMITED';
        const isMalformed =
          lastError.message === 'MAX_TOKENS_TRUNCATED' ||
          lastError.message === 'Model did not return JSON.' ||
          lastError instanceof SyntaxError;

        console.error(`call-review: ${model} attempt ${attempt} failed:`, lastError.message);

        if (isRateLimit && attempt < perModelAttempts) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (isMalformed && attempt < perModelAttempts) {
          await new Promise((r) => setTimeout(r, 750));
          continue;
        }

        if (!isRateLimit && !isMalformed) {
          throw lastError;
        }
        break;
      }
    }
  }

  const wasRateLimit = lastError?.message === 'RATE_LIMITED';
  if (wasRateLimit) {
    throw new Error('All available models are experiencing high demand right now. Please try again in a moment.');
  }
  throw new Error('The review could not be generated cleanly. Please try again.');
}

const ROLE_LABELS: Record<string, string> = {
  founder: 'Founder running sales at an early-stage company',
  ae: 'Full-cycle Account Executive',
  consultant: 'Consultant or agency owner',
  freelancer: 'Freelancer selling client work',
  other: 'Sales professional',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const token = authHeader.replace('Bearer ', '');

    const body = await req.json();
    const { transcript, deal_context, seller_context } = body;

    let userId: string;

    if (token === SUPABASE_SERVICE_ROLE_KEY) {
      if (!body.user_id) {
        return new Response(JSON.stringify({ error: 'Missing user_id for server-triggered review' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = body.user_id;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = user.id;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);

    if ((count || 0) >= 20) {
      return new Response(JSON.stringify({
        error: 'Rate limit reached. You can run up to 20 reviews per 24 hours.',
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!transcript || typeof transcript !== 'string') {
      return new Response(JSON.stringify({ error: 'Transcript is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (transcript.trim().length < 100) {
      return new Response(JSON.stringify({
        error: 'Transcript is too short. Please provide a more complete conversation.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (transcript.length > 50000) {
      return new Response(JSON.stringify({
        error: 'Transcript is too long. Please trim it to under 50,000 characters.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isFirstCall = !deal_context?.previous_review;
    let userMessage = '';

    if (deal_context) {
      userMessage += 'DEAL CONTEXT\n';
      userMessage += `Deal: ${deal_context.deal_name ?? 'Unknown'}\n`;
      userMessage += `Company: ${deal_context.company_name ?? 'Unknown'}\n`;
      if (deal_context.deal_stage) {
        userMessage += `Current stage on record: ${deal_context.deal_stage}\n`;
        userMessage += `(This is the stage Kairo currently has on file. Infer suggested_deal_stage from what has concretely happened -- do not just repeat this value out of default, but do not move backward from it either, except via stage_regression_override.)\n`;
      }

      if (deal_context.deal_notes) {
        userMessage += `Notes: ${deal_context.deal_notes}\n`;
      }

      if (seller_context?.what_you_sell || seller_context?.who_you_are) {
        userMessage += `\nSELLER CONTEXT\n`;
        if (seller_context.who_you_are) {
          const roleLabel = ROLE_LABELS[seller_context.who_you_are] ?? seller_context.who_you_are;
          userMessage += `Role: ${roleLabel}\n`;
        }
        if (seller_context.what_you_sell) {
          userMessage += `Selling: ${seller_context.what_you_sell}\n`;
        }
      }

      if (deal_context.previous_review) {
        userMessage += `\nPRIOR DEAL STATE (from the most recent previous call)\n${JSON.stringify(deal_context.previous_review, null, 2)}\n`;
        userMessage += `\nThis is NOT the first call. You MUST include what_changed_since_last_call, and your "deal" assessment must account for this full history, not just this call.\n`;
      } else {
        userMessage += `\nThis is the FIRST call for this deal. Do NOT include what_changed_since_last_call. Your "deal" assessment is necessarily based on this one call alone.\n`;
      }

      userMessage += '\n';
    }

    userMessage += `TRANSCRIPT\n${transcript}`;

    const { parsed, modelUsed } = await callGeminiWithFallback(userMessage);
    console.log(`call-review: served by ${modelUsed}`);
    const extraction = normalizeExtraction(parsed, isFirstCall);

    return new Response(JSON.stringify({ review: extraction }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('call-review error:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
export type InputType = 'audio' | 'transcript';
// 'processing' and 'failed' are written by the mobile-recording-review edge
// function (audio transcription + review path) -- added alongside the
// pre-existing 'pending' | 'analyzing' | 'complete' | 'error' values used
// by the transcript-paste path, rather than reusing 'analyzing'/'error',
// since the two paths' status writes come from different code and
// shouldn't be silently conflated.
export type ConversationStatus = 'pending' | 'analyzing' | 'processing' | 'complete' | 'error' | 'failed';

// Deal lifecycle bucket (separate from Deal Status). Controls whether a deal
// shows up in the default "active" views vs. closed/archived.
export type DealLifecycle = 'active' | 'stalled' | 'won' | 'lost';

export type RiskLevel = 'high' | 'medium' | 'low' | 'none';
export type DealConfidence = 'High' | 'Medium' | 'Low';

// Deal Stage: where the opportunity sits in the sales process. Closed Won
// and Closed Lost are real values a deal can hold (set automatically, see
// below) but are not user-selectable -- see DEAL_STAGES.
export type DealStage =
  | 'Qualification'
  | 'Discovery'
  | 'Demo'
  | 'Evaluation'
  | 'Alignment'
  | 'Proposal'
  | 'Negotiation'
  | 'Procurement'
  | 'Decision'
  | 'Closed Won'
  | 'Closed Lost';

// The stages a user can pick from a dropdown. As of Kairo's automatic
// stage inference (call-review's deal.suggested_deal_stage), there is no
// longer a user-facing stage picker anywhere in the app -- deal_stage is
// set entirely from resolveDealStage() below, driven by what the AI
// concretely observed happened in each call. This array is kept only for
// display ordering (e.g. filter dropdowns on the Deals page) and as the
// source of truth for DEAL_STAGE progression order used by
// resolveDealStage's advance-only comparison. Closed Won/Closed Lost are
// deliberately excluded here for that same reason -- they are never a
// point on the forward-progression scale, only a terminal state set from
// deal.status.
export const DEAL_STAGES: DealStage[] = [
  'Qualification',
  'Discovery',
  'Demo',
  'Evaluation',
  'Alignment',
  'Proposal',
  'Negotiation',
  'Procurement',
  'Decision',
];

// Deal Status: Kairo's assessment of the deal's current condition.
export type DealStatus =
  | 'Unknown'
  | 'Healthy'
  | 'Promising'
  | 'At Risk'
  | 'Critical'
  | 'Stalled'
  | 'Recovering'
  | 'Won'
  | 'Lost';

export const DEAL_STATUS_COLORS: Record<DealStatus, string> = {
  Unknown: '#8B93A7',
  Healthy: '#3DD68C',
  Promising: '#4F8CFF',
  'At Risk': '#F6B23E',
  Critical: '#FF667A',
  Stalled: '#C97A2B',
  Recovering: '#2EC5B6',
  Won: '#28B463',
  Lost: '#C84A5A',
};

export interface Deal {
  id: string;
  user_id: string;
  deal_name: string;
  company_name: string;
  deal_stage: DealStage;
  champion: string | null;
  deal_value: number | null;
  status: DealLifecycle;
  risk_level: RiskLevel;
  created_at: string;
  updated_at: string;
}

export interface MissingInfo {
  gap: string;
  question_to_answer: string;
}

export interface HighestPriorityRisk {
  risk: string;
  why_it_matters: string;
  evidence: string;
}

// Call Review's own verdict on this specific conversation.
export type CallStatus = 'On Track' | 'Needs Attention' | 'At Risk' | 'Stalled';

export const CALL_STATUS_COLORS: Record<CallStatus, string> = {
  'On Track': '#3DD68C',
  'Needs Attention': '#F6B23E',
  'At Risk': '#FF667A',
  Stalled: '#C97A2B',
};

export type StakeholderSentiment = 'champion' | 'supporter' | 'neutral' | 'skeptic' | 'blocker';

export interface StakeholderSignal {
  name: string;
  role: string | null;
  sentiment: StakeholderSentiment | null;
  evidence: string;
}

// Call-scoped half of the extraction: describes THIS call alone.
export interface CallLevelReview {
  call_status: CallStatus;
  verdict: string;
  reason: string;
  highest_priority_risk: HighestPriorityRisk;
  what_youre_missing: MissingInfo[];
  recommended_next_action: string;
  key_follow_up_message: string;
  manager_note: string;
}

// Deal-scoped half of the extraction: describes the deal's overall current
// state, informed by this call plus everything before it. Independently
// reasoned from the call-scoped half above -- not a mirror of it.
export interface DealLevelReview {
  status: DealStatus;
  confidence: DealConfidence;
  status_reason: string;
  health_score: number; // 0-100
  highest_priority_risk: HighestPriorityRisk;
  what_youre_missing: MissingInfo[];
  recommended_next_action: string;
  manager_note: string;
  pillars?: DealPillars;
  // Kairo's inferred Deal Stage based on what concretely happened across
  // the deal's history (this call plus prior calls) -- never based on what
  // was merely scheduled or discussed as a future step. Always one of
  // DEAL_STAGES (never Closed Won/Lost -- that's derived from `status`
  // instead). Populated by call-review v25+; may be absent on reviews
  // produced before that. See resolveDealStage in lib/kairo.ts for how
  // this is applied to deals.deal_stage.
  suggested_deal_stage?: DealStage;
  // True only on the rare call where the AI found explicit, unambiguous
  // evidence the deal has genuinely reopened from an earlier stage (e.g.
  // buyer says the project is being restarted from scratch). When true,
  // suggested_deal_stage is allowed to move backward from the deal's
  // current stage; otherwise stage changes are advance-or-hold only.
  stage_regression_override?: boolean;
}

// The full extraction call-review produces on every call, including the
// first. Call Review displays `call` (+ deal facts read from the deals
// table). Deal Review displays `deal` from the LATEST stored extraction,
// plus history across all extractions for Timeline/Risk Evolution/Stakeholders.
export interface DealReview {
  call: CallLevelReview;
  deal: DealLevelReview;
  what_changed_since_last_call?: {
    resolved: string[];
    persists: string[];
    new_risks: string[];
  };
  stakeholder_signals: StakeholderSignal[];
  supporting_evidence: string[];
}

// Five-pillar qualification snapshot from the most recent call review.
// Populated by call-review v24+; null on deals last reviewed before that,
// until their next call review. Additive to what_youre_missing, not a
// replacement -- see /areas/kairo.md for the full status/confidence
// calibration this is built against.
export type PillarStatus = 'confirmed' | 'partial' | 'unconfirmed' | 'not_yet_relevant';

export interface PillarState {
  status: PillarStatus;
  confidence: number; // 0-100, continuous within the band implied by status
  evidence: string;
}

export interface DealPillars {
  compelling_event: PillarState;
  economic_buyer: PillarState;
  decision_process: PillarState;
  budget: PillarState;
  champion: PillarState;
}

export interface DealState {
  id: string;
  deal_id: string;
  user_id: string;
  current_status: DealStatus | null;
  confidence: DealConfidence | null;
  deal_health_score: number | null;
  highest_priority_risk: string | null;
  highest_priority_risk_full: HighestPriorityRisk | null;
  what_youre_missing: MissingInfo[] | null;
  key_follow_up_message: string | null;
  manager_note: string | null;
  supporting_evidence: string[] | null;
  last_review_summary: string | null;
  pillars: DealPillars | null;
  updated_at: string;
}

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  onboarding_complete: boolean;
  what_you_sell: string | null;
  who_you_are: string | null;
  created_at: string;
}

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';

export interface Subscription {
  user_id: string;
  status: SubscriptionStatus;
  trial_start: string;
  trial_end: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  deal_id: string | null;
  title: string | null;
  deal_stage: DealStage | null;
  input_type: InputType;
  transcript: string | null;
  audio_url: string | null;
  analysis_json: DealReview | null;
  overall_score: number | null;
  sub_scores: null;
  status: ConversationStatus;
  created_at: string;
}

export interface Stakeholder {
  id: string;
  deal_id: string;
  user_id: string;
  name: string;
  role: string | null;
  sentiment: StakeholderSentiment | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledMeeting {
  id: string;
  user_id: string;
  calendar_event_id: string;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  attendees: any | null;
  status: 'unassigned' | 'assigned' | 'completed';
  deal_id: string | null;
  matched_conversation_id: string | null;
  created_at: string;
  updated_at: string;
}
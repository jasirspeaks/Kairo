export type InputType = 'audio' | 'transcript';

export type ConversationStatus =
  | 'pending'
  | 'analyzing'
  | 'processing'
  | 'retry_pending'
  | 'complete'
  | 'error'
  | 'failed';

// Deal lifecycle bucket (separate from Deal Status).
export type DealLifecycle = 'active' | 'stalled' | 'won' | 'lost';

export type RiskLevel = 'high' | 'medium' | 'low' | 'none';
export type DealConfidence = 'High' | 'Medium' | 'Low';

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

export const INITIAL_DEAL_STAGE: DealStage = 'Qualification';

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
  suggested_deal_stage?: DealStage;
  stage_regression_override?: boolean;
}

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

export type PillarStatus = 'confirmed' | 'partial' | 'unconfirmed' | 'not_yet_relevant';

export interface PillarState {
  status: PillarStatus;
  confidence: number; // 0-100
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

export type InputType = 'audio' | 'transcript';
export type ConversationStatus = 'pending' | 'analyzing' | 'complete' | 'error';

// Deal lifecycle bucket (separate from Deal Status). Controls whether a deal
// shows up in the default "active" views vs. closed/archived.
export type DealLifecycle = 'active' | 'stalled' | 'won' | 'lost';

export type RiskLevel = 'high' | 'medium' | 'low' | 'none';
export type DealConfidence = 'High' | 'Medium' | 'Low';

// Deal Stage: where the opportunity sits in the sales process.
export type DealStage =
  | 'Qualification'
  | 'Discovery'
  | 'Demo'
  | 'Evaluation'
  | 'Alignment'
  | 'Proposal'
  | 'Negotiation'
  | 'Procurement'
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
  'Closed Won',
  'Closed Lost',
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

export interface DealReview {
  deal_status: {
    status: DealStatus;
    confidence: DealConfidence;
    reason: string;
  };
  deal_health_score: number; // 0-100
  call_status: CallStatus;
  verdict: string;
  what_changed_since_last_call?: {
    resolved: string[];
    persists: string[];
    new_risks: string[];
  };
  highest_priority_risk: HighestPriorityRisk;
  what_youre_missing: MissingInfo[];
  key_follow_up_message: string;
  manager_note: string;
  supporting_evidence: string[];
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

export interface Conversation {
  id: string;
  user_id: string;
  deal_id: string | null;
  title: string | null;
  input_type: InputType;
  transcript: string | null;
  audio_url: string | null;
  analysis_json: DealReview | null;
  overall_score: number | null;
  sub_scores: null;
  status: ConversationStatus;
  created_at: string;
}

export interface PendingCall {
  id: string;
  user_id: string;
  source: string;
  external_id: string | null;
  title: string | null;
  transcript: string;
  participants: any | null;
  meeting_date: string | null;
  status: 'unmatched' | 'matched' | 'discarded';
  matched_deal_id: string | null;
  matched_conversation_id: string | null;
  created_at: string;
}

export type StakeholderSentiment = 'champion' | 'supporter' | 'neutral' | 'skeptic' | 'blocker';

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
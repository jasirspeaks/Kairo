export type InputType = 'audio' | 'transcript';
export type ConversationStatus = 'pending' | 'analyzing' | 'complete' | 'error';
export type DealStatus = 'active' | 'stalled' | 'won' | 'lost';
export type RiskLevel = 'high' | 'medium' | 'low' | 'none';
export type DealConfidence = 'High' | 'Medium' | 'Low';
export type DealHealthStatus = 'Healthy' | 'Open' | 'At Risk' | 'Lost Momentum';

export interface Deal {
  id: string;
  user_id: string;
  deal_name: string;
  company_name: string;
  status: DealStatus;
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

export interface DealReview {
  deal_status: {
    status: DealHealthStatus;
    confidence: DealConfidence;
    reason: string;
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
  current_status: DealHealthStatus | null;
  confidence: DealConfidence | null;
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
export type InputType = 'audio' | 'transcript';
export type ConversationStatus = 'pending' | 'transcribing' | 'analyzing' | 'complete' | 'error';

export interface Profile {
  id: string;
  name: string | null;
  email: string | null;
  onboarding_complete: boolean;
  created_at: string;
}

export interface SubScores {
  trust_building: number;
  objection_handling: number;
  clarity: number;
  emotional_awareness: number;
}

export interface MomentumPoint {
  time: number;
  score: number;
  label?: string;
  description?: string;
}

export interface Insight {
  category: string;
  point: string;
  explanation: string;
  audio_signal?: boolean;
}

export interface CoachingItem {
  moment: string;
  what_was_said: string;
  problem: string;
  better_approach: string;
  why_it_matters: string;
}

export interface MomentMapItem {
  phase: string;
  what_happened: string;
  signal: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface AnalysisJSON {
  overview: string;
  momentum_data: MomentumPoint[];
  moment_map: MomentMapItem[];
  insights: {
    objection_moments: Insight[];
    trust_signals: Insight[];
    hesitation_patterns: Insight[];
    buying_intent: Insight[];
    persuasion_effectiveness: Insight[];
    communication_strengths: Insight[];
    weak_moments: Insight[];
  };
  coaching: CoachingItem[];
  overall_score: number;
  sub_scores: SubScores;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  input_type: InputType;
  transcript: string | null;
  audio_url: string | null;
  analysis_json: AnalysisJSON | null;
  overall_score: number | null;
  sub_scores: SubScores | null;
  status: ConversationStatus;
  created_at: string;
}
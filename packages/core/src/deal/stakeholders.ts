import { StakeholderSentiment } from '../types';

export const SENTIMENT_LABEL: Record<StakeholderSentiment, string> = {
  champion: 'Champion',
  supporter: 'Supporter',
  neutral: 'Neutral',
  skeptic: 'Skeptic',
  blocker: 'Blocker',
};

export const SENTIMENT_COLOR: Record<StakeholderSentiment, string> = {
  champion: '#3DD68C',
  supporter: '#4F8CFF',
  neutral: '#8B93A7',
  skeptic: '#F6B23E',
  blocker: '#FF667A',
};

export function getSentimentLabel(sentiment: StakeholderSentiment | string | null | undefined): string {
  if (!sentiment) return 'Neutral';
  return SENTIMENT_LABEL[sentiment as StakeholderSentiment] || 'Neutral';
}

export function getSentimentColor(sentiment: StakeholderSentiment | string | null | undefined): string {
  if (!sentiment) return '#8B93A7';
  return SENTIMENT_COLOR[sentiment as StakeholderSentiment] || '#8B93A7';
}

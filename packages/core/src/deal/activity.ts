import { Conversation, Stakeholder } from '../types';

export type ActivityItem =
  | { kind: 'call'; id: string; at: string; call: Conversation }
  | { kind: 'stakeholder'; id: string; at: string; stakeholder: Stakeholder };

/**
 * Merges call conversations and stakeholder records into a single
 * reverse-chronological activity timeline.
 */
export function buildActivityTimeline(
  calls: Conversation[],
  stakeholders: Stakeholder[]
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...calls.map((call): ActivityItem => ({ kind: 'call', id: call.id, at: call.created_at, call })),
    ...stakeholders.map((s): ActivityItem => ({ kind: 'stakeholder', id: s.id, at: s.created_at, stakeholder: s })),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

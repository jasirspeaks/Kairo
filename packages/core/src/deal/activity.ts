import { Conversation, Stakeholder, DealStateTransition } from '../types';

export type ActivityItem =
  | { kind: 'call'; id: string; at: string; call: Conversation }
  | { kind: 'stakeholder'; id: string; at: string; stakeholder: Stakeholder }
  | { kind: 'stage_transition'; id: string; at: string; transition: DealStateTransition };

/**
 * Merges call conversations, stakeholder records, and stage transitions into a single
 * reverse-chronological activity timeline.
 */
export function buildActivityTimeline(
  calls: Conversation[],
  stakeholders: Stakeholder[],
  transitions: DealStateTransition[] = []
): ActivityItem[] {
  const items: ActivityItem[] = [
    ...calls.map((call): ActivityItem => ({ kind: 'call', id: call.id, at: call.created_at, call })),
    ...stakeholders.map((s): ActivityItem => ({ kind: 'stakeholder', id: s.id, at: s.created_at, stakeholder: s })),
    ...transitions.map((t): ActivityItem => ({ kind: 'stage_transition', id: t.id, at: t.created_at, transition: t })),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

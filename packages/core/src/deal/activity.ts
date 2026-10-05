import { Conversation, Stakeholder, DealStateTransition, DealStage } from '../types';

export type ActivityItem =
  | { kind: 'call'; id: string; at: string; call: Conversation }
  | { kind: 'stakeholder'; id: string; at: string; stakeholder: Stakeholder }
  | { kind: 'stage_transition'; id: string; at: string; transition: DealStateTransition };

/**
 * Extracts the canonical resolved stage for a conversation from all available signals.
 */
function getConversationStage(
  call: Conversation,
  transitions: DealStateTransition[] = []
): DealStage | null {
  if (call.deal_stage) return call.deal_stage;
  if (call.analysis_json?.deal?.suggested_deal_stage) {
    return call.analysis_json.deal.suggested_deal_stage;
  }
  const match = transitions.find((t) => t.conversation_id === call.id);
  if (match?.to_stage) return match.to_stage;
  return null;
}

/**
 * Merges call conversations, stakeholder records, and stage transitions into a single
 * reverse-chronological activity timeline.
 *
 * Rules:
 * 1. The FIRST reviewed call establishes initial deal stage — it NEVER produces a stage-change event.
 * 2. SUBSEQUENT reviewed calls produce a stage-change event ONLY when the deal's stage genuinely changes
 *    compared with the previous reviewed call.
 * 3. If there is no previous reviewed call, no stage transition event is generated.
 */
export function buildActivityTimeline(
  calls: Conversation[],
  stakeholders: Stakeholder[],
  transitions: DealStateTransition[] = []
): ActivityItem[] {
  // Sort calls chronologically (oldest first) to accurately establish stage progression
  const sortedCalls = [...calls]
    .filter((c) => c && c.created_at)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Filter for reviewed calls that have an established stage
  const reviewedCallsWithStages = sortedCalls
    .map((call) => ({
      call,
      stage: getConversationStage(call, transitions),
    }))
    .filter((item): item is { call: Conversation; stage: DealStage } => item.stage !== null);

  // Generate stage transitions only for subsequent calls where the stage actually changed
  const validStageTransitions: ActivityItem[] = [];

  for (let i = 1; i < reviewedCallsWithStages.length; i++) {
    const prev = reviewedCallsWithStages[i - 1];
    const curr = reviewedCallsWithStages[i];

    if (prev.stage !== curr.stage) {
      // Find matching transition from database records to preserve id, transition_reason, and timestamps
      const matchingDbTransition = transitions.find(
        (t) => t.conversation_id === curr.call.id && t.to_stage === curr.stage
      );

      const transitionObj: DealStateTransition = matchingDbTransition
        ? {
            ...matchingDbTransition,
            from_stage: prev.stage,
            to_stage: curr.stage,
          }
        : {
            id: `stage-trans-${curr.call.id}`,
            deal_id: curr.call.deal_id || '',
            conversation_id: curr.call.id,
            from_stage: prev.stage,
            to_stage: curr.stage,
            from_status: null,
            to_status: curr.call.analysis_json?.deal?.status || 'Unknown',
            health_score_delta: 0,
            transition_reason: curr.call.analysis_json?.deal?.status_reason || null,
            created_at: curr.call.created_at,
          };

      validStageTransitions.push({
        kind: 'stage_transition',
        id: transitionObj.id,
        at: transitionObj.created_at || curr.call.created_at,
        transition: transitionObj,
      });
    }
  }

  // Combine calls, stakeholders, and valid stage transitions
  const items: ActivityItem[] = [
    ...calls.map((call): ActivityItem => ({ kind: 'call', id: call.id, at: call.created_at, call })),
    ...stakeholders.map((s): ActivityItem => ({ kind: 'stakeholder', id: s.id, at: s.created_at, stakeholder: s })),
    ...validStageTransitions,
  ];

  // Sort reverse-chronologically (newest first).
  // If timestamps are identical, place stage_transition before the call that produced it.
  return items.sort((a, b) => {
    const diff = new Date(b.at).getTime() - new Date(a.at).getTime();
    if (diff !== 0) return diff;
    const rank = (kind: ActivityItem['kind']) => (kind === 'stage_transition' ? 0 : kind === 'call' ? 1 : 2);
    return rank(a.kind) - rank(b.kind);
  });
}

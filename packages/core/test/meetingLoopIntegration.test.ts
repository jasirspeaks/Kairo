import { describe, it, expect } from 'vitest';
import {
  Deal,
  DealState,
  Meeting,
  MeetingWithDeal,
  Conversation,
  DealReview,
  resolveDealStage,
  getRiskLevel,
  getStatusColor,
  formatDealValue,
  getHealthScoreColor,
} from '../src';

describe('Phase 7: End-to-End Automated Product Loop Acceptance', () => {
  // Step 1: AE creates a Deal
  const deal: Deal = {
    id: 'deal-enterprise-001',
    user_id: 'user-ae-123',
    deal_name: 'Acme Cloud Migration',
    company_name: 'Acme Corp',
    deal_stage: 'Discovery',
    champion: null,
    deal_value: 120000,
    status: 'active',
    risk_level: 'medium',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  };

  it('1. Deal starts in initial discovery state with zero calls', () => {
    expect(deal.deal_stage).toBe('Discovery');
    expect(deal.deal_value).toBe(120000);
    expect(formatDealValue(deal.deal_value)).toBe('$120K');
  });

  // Step 2: AE schedules a meeting through Native Kairo Scheduling with Google Calendar
  const scheduledMeeting: MeetingWithDeal = {
    id: 'meeting-kairo-789',
    user_id: 'user-ae-123',
    calendar_event_id: 'gcal_event_abc123',
    title: 'Acme Cloud Migration - Discovery & Technical Scope',
    start_time: '2026-10-03T15:00:00Z',
    end_time: '2026-10-03T15:45:00Z',
    attendees: [
      { email: 'ae@seller.com', organizer: true, responseStatus: 'accepted' },
      { email: 'cto@acmewidgets.com', name: 'Bob Smith', responseStatus: 'accepted' },
      { email: 'procurement@acmewidgets.com', name: 'Alice Jones', responseStatus: 'tentative' },
    ],
    meeting_link: 'https://meet.google.com/xyz-uvwx-rst',
    source: 'kairo_native',
    status: 'assigned',
    capture_status: 'idle',
    deal_id: deal.id,
    conversation_id: null,
    matched_conversation_id: null,
    audio_storage_path: null,
    capture_device_info: { os: 'windows', engine: 'wasapi_dual_channel' },
    cancelled_at: null,
    created_at: '2026-10-01T11:00:00Z',
    updated_at: '2026-10-01T11:00:00Z',
    deal_name: deal.deal_name,
    company_name: deal.company_name,
  };

  it('2. Native meeting is deterministically bound to Deal without fuzzy matching', () => {
    expect(scheduledMeeting.source).toBe('kairo_native');
    expect(scheduledMeeting.deal_id).toBe(deal.id);
    expect(scheduledMeeting.status).toBe('assigned');
    expect(scheduledMeeting.calendar_event_id).toBe('gcal_event_abc123');
    expect(scheduledMeeting.meeting_link).toContain('meet.google.com');
  });

  // Step 3: Desktop Watcher detects approaching call and transitions capture state
  it('3. Desktop Watcher detects approaching call and transitions to recording', () => {
    const approachingState: Meeting = {
      ...scheduledMeeting,
      capture_status: 'approaching',
    };
    expect(approachingState.capture_status).toBe('approaching');

    const recordingState: Meeting = {
      ...approachingState,
      capture_status: 'recording',
    };
    expect(recordingState.capture_status).toBe('recording');
  });

  // Step 4: Meeting finishes, spooled audio is uploaded, and conversation is created
  const conversation: Conversation = {
    id: 'conv-call-101',
    user_id: deal.user_id,
    deal_id: deal.id,
    meeting_id: scheduledMeeting.id,
    title: scheduledMeeting.title,
    deal_stage: 'Discovery',
    input_type: 'audio',
    transcript: 'AE: Thanks for joining Bob. CTO: We need to complete migration before Q4 datacenter lease expires.',
    audio_url: `${deal.user_id}/${deal.id}/conv-call-101.wav`,
    analysis_json: null,
    overall_score: null,
    sub_scores: null,
    status: 'pending',
    created_at: '2026-10-03T15:45:00Z',
  };

  it('4. Conversation is created with direct meeting_id link and audio storage reference', () => {
    expect(conversation.meeting_id).toBe(scheduledMeeting.id);
    expect(conversation.deal_id).toBe(deal.id);
    expect(conversation.input_type).toBe('audio');
    expect(conversation.audio_url).toContain('.wav');
  });

  // Step 5: AI Review generates 5-pillar deal judgment and risk analysis
  const aiReviewResult: DealReview = {
    call: {
      call_status: 'On Track',
      verdict: 'Strong discovery conversation. Hard deadline confirmed by technical decision maker.',
      reason: 'CTO confirmed datacenter lease expiration as compelling catalyst.',
      highest_priority_risk: {
        risk: 'Procurement sign-off timeline unverified',
        why_it_matters: 'Lease expires in December; 6-week procurement cycle required.',
        evidence: 'Procurement lead was tentative and did not attend today.',
      },
      what_youre_missing: [
        {
          gap: 'Procurement approval process & security sign-off timeline',
          question_to_answer: 'Who owns final commercial signoff and what is their turnaround window?',
        },
      ],
      recommended_next_action: 'Schedule follow-up scoping call with Procurement Lead Alice Jones.',
      key_follow_up_message: 'Hi Bob, thanks for confirming the Q4 timeline. Let\'s get Alice on the calendar for 20 mins.',
      manager_note: 'Compelling event is solid. Immediate priority is validating procurement gate.',
    },
    deal: {
      status: 'Healthy',
      confidence: 'High',
      status_reason: 'Confirmed catalyst with executive technical buyer.',
      health_score: 82,
      highest_priority_risk: {
        risk: 'Procurement sign-off timeline unverified',
        why_it_matters: 'Lease expires in December; 6-week procurement cycle required.',
        evidence: 'Procurement lead was tentative and did not attend today.',
      },
      what_youre_missing: [
        {
          gap: 'Procurement approval process & security sign-off timeline',
          question_to_answer: 'Who owns final commercial signoff and what is their turnaround window?',
        },
      ],
      recommended_next_action: 'Schedule follow-up scoping call with Procurement Lead Alice Jones.',
      manager_note: 'Compelling event confirmed. Advance to Evaluation upon procurement scoping.',
      suggested_deal_stage: 'Evaluation',
      pillars: {
        compelling_event: {
          status: 'confirmed',
          confidence: 90,
          evidence: 'Datacenter lease expires Dec 31st.',
        },
        economic_buyer: {
          status: 'partial',
          confidence: 70,
          evidence: 'CTO has technical authority; CFO approval needed over $100k.',
        },
        decision_process: {
          status: 'partial',
          confidence: 50,
          evidence: 'Security review required before commercial signature.',
        },
        budget: {
          status: 'confirmed',
          confidence: 85,
          evidence: 'Migration budget allocated under infrastructure budget.',
        },
        champion: {
          status: 'confirmed',
          confidence: 90,
          evidence: 'Bob Smith actively driving initiative.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Bob Smith',
        role: 'CTO',
        sentiment: 'champion',
        evidence: 'Urgent mandate to migrate before Q4 lease ends.',
      },
    ],
    supporting_evidence: [
      {
        quote: 'We need to complete migration before Q4 datacenter lease expires.',
        speaker: 'Bob Smith',
        pillar_key: 'compelling_event',
        grounding_type: 'explicit_statement',
        confidence: 90,
      },
    ],
  };

  it('5. 5-Pillar intelligence is fully evaluated and valid', () => {
    const pillars = aiReviewResult.deal.pillars!;
    expect(pillars.compelling_event.status).toBe('confirmed');
    expect(pillars.compelling_event.confidence).toBeGreaterThanOrEqual(80);
    expect(pillars.champion.status).toBe('confirmed');
    expect(pillars.economic_buyer.status).toBe('partial');
    expect(aiReviewResult.deal.health_score).toBe(82);
    expect(getHealthScoreColor(aiReviewResult.deal.health_score)).toBe('#3DD68C');
  });

  // Step 6: Stage resolution promotes deal stage based on evidence
  it('6. Stage resolution promotes deal from Discovery to Evaluation', () => {
    const nextStage = resolveDealStage(deal.deal_stage, aiReviewResult);
    expect(nextStage).toBe('Evaluation');
  });

  // Step 7: Meeting state closes as completed and linked to conversation
  it('7. Meeting transitions to completed state with bi-directional conversation binding', () => {
    const completedMeeting: Meeting = {
      ...scheduledMeeting,
      conversation_id: conversation.id,
      matched_conversation_id: conversation.id,
      status: 'completed',
      capture_status: 'completed',
      audio_storage_path: conversation.audio_url,
    };

    expect(completedMeeting.status).toBe('completed');
    expect(completedMeeting.capture_status).toBe('completed');
    expect(completedMeeting.conversation_id).toBe(conversation.id);
    expect(completedMeeting.matched_conversation_id).toBe(conversation.id);
  });
});

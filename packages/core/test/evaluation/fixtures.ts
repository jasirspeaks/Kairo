import { DealReview, DealStatus, PillarStatus, StakeholderSentiment } from '../../src/types';

export interface EvaluationBenchmarkScenario {
  id: string;
  name: string;
  description: string;
  transcript: string;
  expectedJudgment: {
    maxHealthScore?: number;
    minHealthScore?: number;
    allowedStatuses: DealStatus[];
    disallowedStatuses: DealStatus[];
    requiredMissingGaps?: string[];
    requiredPillarStatuses?: Partial<Record<'compelling_event' | 'economic_buyer' | 'decision_process' | 'budget' | 'champion', PillarStatus>>;
    expectedStakeholders?: {
      nameSnippet: string;
      expectedSentiment: StakeholderSentiment;
    }[];
    riskKeywords?: string[];
  };
  mockReview: DealReview;
}

/**
 * Scenario 1: The "Happy Ears" False Positive Trap
 * Rep had a great conversation where the buyer loved the demo and asked lots of questions,
 * but rep never identified who owns the budget or what the formal procurement process is.
 * Kairo MUST NOT score this as Healthy or low risk.
 */
export const SCENARIO_HAPPY_EARS: EvaluationBenchmarkScenario = {
  id: 'scenario-happy-ears',
  name: 'Enthusiastic User with Zero Budget / Economic Buyer Grounding',
  description: 'AE believes deal is closing this month because user loved the product, but no budget or decision maker was uncovered.',
  transcript: `
AE: Thanks for jumping on, Sarah. How did the team like the trial?
Sarah: We absolutely loved it! Honestly it is 10x better than what we have today. Everyone on my team wants it.
AE: That is amazing to hear! So are you ready to get started?
Sarah: Yes definitely, send over the contract and I'll take a look!
AE: Awesome, I'll send over an annual agreement for $60k.
Sarah: Sounds great, talk soon!
  `,
  expectedJudgment: {
    maxHealthScore: 55,
    allowedStatuses: ['At Risk', 'Stalled', 'Unknown'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      economic_buyer: 'unconfirmed',
      budget: 'unconfirmed',
      decision_process: 'unconfirmed',
    },
    requiredMissingGaps: ['economic buyer', 'budget', 'procurement'],
    riskKeywords: ['economic buyer', 'budget', 'authority', 'contract', 'decision'],
  },
  mockReview: {
    call: {
      call_status: 'At Risk',
      verdict: 'High enthusiasm from end-user, but complete absence of economic buyer, budget approval, or procurement process.',
      reason: 'Sarah is an excited user but has not verified signing authority or budget allocation for $60k.',
      highest_priority_risk: {
        risk: 'Unconfirmed Economic Buyer and Budget',
        why_it_matters: 'Sarah cannot sign a $60k contract without executive and budget sponsor approval.',
        evidence: "Sarah said 'send over the contract and I'll take a look', but no budget or signing process was discussed.",
      },
      what_youre_missing: [
        {
          gap: 'Economic Buyer Identity',
          question_to_answer: 'Who holds the budget authority to sign a $60,000 annual agreement?',
        },
        {
          gap: 'Budget Allocation',
          question_to_answer: 'Is there existing allocated budget for this tool or does it require an unbudgeted spend approval?',
        },
        {
          gap: 'Procurement & Legal Process',
          question_to_answer: 'What is the required security review and procurement timeline before signature?',
        },
      ],
      recommended_next_action: 'Ask Sarah who the executive sponsor and budget holder is before sending contracts.',
      key_follow_up_message: 'Sarah, before I send the agreement, who on your leadership team needs to review and approve the $60k investment?',
      manager_note: 'Rep has happy ears. Do not forecast this deal for this month until EB and budget are confirmed.',
    },
    deal: {
      status: 'At Risk',
      confidence: 'Medium',
      status_reason: 'Missing 3 of 5 deal pillars despite enthusiastic end-user.',
      health_score: 42,
      highest_priority_risk: {
        risk: 'Unconfirmed Economic Buyer',
        why_it_matters: 'Deal will stall at contract submission without verified signer.',
        evidence: 'No budget or decision maker mentioned in transcript.',
      },
      what_youre_missing: [
        {
          gap: 'Economic Buyer Identity',
          question_to_answer: 'Who approves the $60k budget?',
        },
      ],
      recommended_next_action: 'Map the decision making unit and budget approval chain.',
      manager_note: 'Do not count on this close date.',
      pillars: {
        compelling_event: {
          status: 'unconfirmed',
          confidence: 20,
          evidence: 'No specific deadline or consequence of inaction discussed.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'Sarah is a user/manager without confirmed budget signing authority.',
        },
        decision_process: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'Procurement and legal process not discussed.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'Rep proposed $60k but Sarah did not confirm budget availability.',
        },
        champion: {
          status: 'partial',
          confidence: 60,
          evidence: "Sarah stated 'everyone on my team wants it' and 'loved it'.",
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Sarah',
        role: 'Team Lead / User',
        sentiment: 'champion',
        evidence: "Stated 'We absolutely loved it' and '10x better than what we have today'.",
      },
    ],
    supporting_evidence: [
      "Sarah: 'We absolutely loved it!'",
      "AE: 'I'll send over an annual agreement for $60k.'",
    ],
  },
};

/**
 * Scenario 2: Strong Well-Qualified Deal
 * Call confirms compelling event (strict compliance deadline Dec 15), confirmed budget ($120k approved by CFO),
 * champion (VP Engineering), and a defined 3-step decision process.
 */
export const SCENARIO_WELL_QUALIFIED: EvaluationBenchmarkScenario = {
  id: 'scenario-well-qualified',
  name: 'Multi-Pillar Grounded Enterprise Opportunity',
  description: 'Verified Compelling Event, Economic Buyer, Champion, and Budget with documented evidence.',
  transcript: `
AE: Marcus, thanks for joining. Last time we spoke, you mentioned the SOC2 audit deadline on Dec 15th.
Marcus (VP Eng): Exactly. If we don't have this deployed by Dec 1st, we fail our vendor audit which puts $2M in customer renewals at risk.
AE: Understood. How is the budget looking for the $120k tier?
Marcus: I already got CFO sign-off from Elena last Friday for $120k out of our Q4 security modernization budget.
AE: Excellent. What are the final steps to get this across the finish line?
Marcus: Elena signed off on budget. We just need infosec review which takes 5 business days, then our legal counsel Dave will sign the standard MSA.
AE: Let's schedule a checkpoint with Dave and Infosec on Thursday.
Marcus: Perfect, send the invite.
  `,
  expectedJudgment: {
    minHealthScore: 80,
    allowedStatuses: ['Healthy', 'Promising'],
    disallowedStatuses: ['Critical', 'At Risk', 'Stalled', 'Lost'],
    requiredPillarStatuses: {
      compelling_event: 'confirmed',
      economic_buyer: 'confirmed',
      budget: 'confirmed',
      champion: 'confirmed',
      decision_process: 'confirmed',
    },
    expectedStakeholders: [
      { nameSnippet: 'Marcus', expectedSentiment: 'champion' },
      { nameSnippet: 'Elena', expectedSentiment: 'supporter' },
    ],
  },
  mockReview: {
    call: {
      call_status: 'On Track',
      verdict: 'Extremely strong validation across all 5 qualification pillars with concrete deadlines and budget confirmation.',
      reason: 'CFO Elena approved $120k budget; hard deadline Dec 1st tied to $2M renewal risk; Marcus driving actively.',
      highest_priority_risk: {
        risk: 'Infosec & Legal SLA Execution',
        why_it_matters: 'Need 5 business days for Infosec review prior to Dec 1 deployment deadline.',
        evidence: 'Marcus noted Infosec review takes 5 business days followed by Dave legal signoff.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Run infosec review checkpoint on Thursday and supply standard security documentation.',
      key_follow_up_message: 'Marcus, calendar invite sent for Thursday with our Infosec architect.',
      manager_note: 'High-confidence deal. Verified CFO sign-off and concrete $2M audit risk deadline.',
    },
    deal: {
      status: 'Healthy',
      confidence: 'High',
      status_reason: 'All 5 pillars confirmed with explicit customer evidence.',
      health_score: 92,
      highest_priority_risk: {
        risk: 'Timeline compression on 5-day security review',
        why_it_matters: 'Must finish security review by Dec 1st to meet audit deadline.',
        evidence: 'Marcus mentioned Dec 15 audit deadline with Dec 1 deployment target.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Execute security review and legal signoff.',
      manager_note: 'Top quartile deal quality.',
      pillars: {
        compelling_event: {
          status: 'confirmed',
          confidence: 95,
          evidence: 'SOC2 audit deadline on Dec 15 with $2M customer renewals at risk if not deployed by Dec 1.',
        },
        economic_buyer: {
          status: 'confirmed',
          confidence: 90,
          evidence: 'CFO Elena already signed off on $120k allocation.',
        },
        decision_process: {
          status: 'confirmed',
          confidence: 88,
          evidence: '5-day Infosec review followed by legal counsel Dave signing standard MSA.',
        },
        budget: {
          status: 'confirmed',
          confidence: 95,
          evidence: '$120k approved out of Q4 security modernization budget.',
        },
        champion: {
          status: 'confirmed',
          confidence: 95,
          evidence: 'Marcus (VP Eng) actively driving timeline and aligning internal stakeholders.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Marcus',
        role: 'VP Engineering',
        sentiment: 'champion',
        evidence: 'Driving process, secured CFO approval, coordinating legal/security.',
      },
      {
        name: 'Elena',
        role: 'CFO',
        sentiment: 'supporter',
        evidence: 'Approved $120k budget allocation out of Q4 budget.',
      },
      {
        name: 'Dave',
        role: 'Legal Counsel',
        sentiment: 'neutral',
        evidence: 'Will sign standard MSA following infosec review.',
      },
    ],
    supporting_evidence: [
      "Marcus: 'If we don't have this deployed by Dec 1st, we fail our vendor audit which puts $2M in customer renewals at risk.'",
      "Marcus: 'I already got CFO sign-off from Elena last Friday for $120k out of our Q4 security modernization budget.'",
    ],
  },
};

/**
 * Scenario 3: Hidden Blocker & Competing Agenda
 * Rep is talking to an enthusiastic champion who reveals that the CIO wants an internal build
 * and has not approved vendor evaluations.
 */
export const SCENARIO_HIDDEN_BLOCKER: EvaluationBenchmarkScenario = {
  id: 'scenario-hidden-blocker',
  name: 'Enthusiastic Internal Champion with Unaligned Executive Blocker',
  description: 'Champion wants the tool but CIO has an internal build mandate and veto power.',
  transcript: `
AE: Hey Jordan, how did the internal review go with the architecture team?
Jordan: We love the architecture. But to be completely transparent, our CIO Patrick is pushing heavily for us to build this in-house with our existing Kubernetes cluster. He hasn't approved any external SaaS vendors for this quarter.
AE: Has Patrick seen our ROI model?
Jordan: No, he refuses to meet with vendors until we prove internal build is impossible.
  `,
  expectedJudgment: {
    maxHealthScore: 40,
    allowedStatuses: ['Critical', 'At Risk'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      champion: 'confirmed',
      economic_buyer: 'unconfirmed',
      decision_process: 'unconfirmed',
    },
    expectedStakeholders: [
      { nameSnippet: 'Jordan', expectedSentiment: 'champion' },
      { nameSnippet: 'Patrick', expectedSentiment: 'blocker' },
    ],
    riskKeywords: ['CIO', 'Patrick', 'in-house', 'build', 'veto', 'blocker'],
  },
  mockReview: {
    call: {
      call_status: 'At Risk',
      verdict: 'Severe executive blocker identified. CIO Patrick is actively mandating an internal build and refusing vendor meetings.',
      reason: 'Jordan is an effective technical champion but powerless against CIO Patrick veto.',
      highest_priority_risk: {
        risk: 'CIO Patrick Active Blocker & Internal Build Mandate',
        why_it_matters: 'The decision maker is hostile to SaaS vendors and refusing to meet.',
        evidence: "Jordan: 'CIO Patrick is pushing heavily for us to build this in-house... refuses to meet with vendors.'",
      },
      what_youre_missing: [
        {
          gap: 'CIO Engagement Strategy',
          question_to_answer: 'How can we equip Jordan with internal build cost/failure data to influence Patrick?',
        },
      ],
      recommended_next_action: 'Provide Jordan with a Build vs. Buy analysis showing true total cost of ownership.',
      key_follow_up_message: 'Jordan, sending over our Build vs Buy calculator to help show Patrick the hidden engineering maintenance cost.',
      manager_note: 'Deal is blocked at CIO level. Escalate or re-qualify.',
    },
    deal: {
      status: 'Critical',
      confidence: 'High',
      status_reason: 'Direct executive blocker with internal build mandate.',
      health_score: 30,
      highest_priority_risk: {
        risk: 'Executive Blocker: CIO internal build mandate',
        why_it_matters: 'CIO Patrick has veto power and has banned new SaaS evaluations this quarter.',
        evidence: 'Jordan stated CIO refuses to meet vendors.',
      },
      what_youre_missing: [
        {
          gap: 'Path to Economic Buyer',
          question_to_answer: 'How do we reach Patrick or his superior?',
        },
      ],
      recommended_next_action: 'Arm champion with Build vs Buy teardown.',
      manager_note: 'Do not forecast.',
      pillars: {
        compelling_event: {
          status: 'partial',
          confidence: 40,
          evidence: 'Architecture team wants solution but no executive deadline.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'CIO Patrick is the decision maker and is actively blocking vendor spend.',
        },
        decision_process: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'No vendor evaluation process is authorized by leadership.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'Budget frozen for external SaaS vendors this quarter.',
        },
        champion: {
          status: 'confirmed',
          confidence: 85,
          evidence: 'Jordan is transparent and advocates for solution internally.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Jordan',
        role: 'Architecture Lead',
        sentiment: 'champion',
        evidence: 'Advocates for tool but blocked by CIO.',
      },
      {
        name: 'Patrick',
        role: 'CIO',
        sentiment: 'blocker',
        evidence: 'Pushing heavily for in-house build, refuses to meet vendors, frozen SaaS approvals.',
      },
    ],
    supporting_evidence: [
      "Jordan: 'CIO Patrick is pushing heavily for us to build this in-house with our existing Kubernetes cluster.'",
      "Jordan: 'He refuses to meet with vendors until we prove internal build is impossible.'",
    ],
  },
};

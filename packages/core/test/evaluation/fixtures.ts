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

/**
 * Scenario 4: Phantom Budget Trap
 * AE assumes budget is solid because company is well-funded, but buyer admits
 * there is zero allocated budget for this initiative this fiscal year.
 */
export const SCENARIO_PHANTOM_BUDGET: EvaluationBenchmarkScenario = {
  id: 'scenario-phantom-budget',
  name: 'Phantom Budget & Unallocated Spend Trap',
  description: 'AE assumes budget exists, but buyer states no line-item budget is allocated until next year.',
  transcript: `
AE: Since you just announced your Series B, I assume getting the $45k approved will be pretty straightforward?
Alex: Honestly, all of that funding is earmarked for engineering headcount. My department has zero discretionary software budget left for this year.
AE: Can you pull from another cost center?
Alex: Not without CEO approval, and she froze all unbudgeted software purchases over $10k until Q2 next year.
  `,
  expectedJudgment: {
    maxHealthScore: 35,
    allowedStatuses: ['At Risk', 'Stalled', 'Critical'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      budget: 'unconfirmed',
      economic_buyer: 'unconfirmed',
    },
    riskKeywords: ['budget', 'frozen', 'unbudgeted', 'discretionary', 'headcount', 'CEO'],
  },
  mockReview: {
    call: {
      call_status: 'At Risk',
      verdict: 'Complete absence of budget. Department budget is zero and CEO has frozen unbudgeted spend.',
      reason: 'Series B funding is allocated to headcount only; software purchases over $10k frozen until Q2.',
      highest_priority_risk: {
        risk: 'Frozen and Unallocated Software Budget',
        why_it_matters: 'Buyer has zero discretionary budget and CEO spend freeze blocks purchase until Q2.',
        evidence: "Alex: 'My department has zero discretionary software budget left... CEO froze all unbudgeted software purchases.'",
      },
      what_youre_missing: [
        {
          gap: 'Executive Exception Process',
          question_to_answer: 'Is there a verified business justification threshold that unlocks CEO budget exception?',
        },
      ],
      recommended_next_action: 'Build an executive ROI business case or adjust close date to Q2 next fiscal year.',
      key_follow_up_message: 'Alex, would a 1-page executive summary on cost offset help if we request a CEO exception?',
      manager_note: 'No budget. Move out of current quarter forecast immediately.',
    },
    deal: {
      status: 'At Risk',
      confidence: 'High',
      status_reason: 'Budget pillar completely unconfirmed and frozen by CEO mandate.',
      health_score: 28,
      highest_priority_risk: {
        risk: 'Zero budget allocation with CEO freeze',
        why_it_matters: 'Deal cannot close in current fiscal year without CEO override.',
        evidence: 'Alex explicitly stated zero software budget.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Qualify if CEO exception is viable or slip to Q2.',
      manager_note: 'Slip deal to Q2.',
      pillars: {
        compelling_event: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'No stated deadline; purchase frozen until next year.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'CEO owns exception approval and is unengaged.',
        },
        decision_process: {
          status: 'partial',
          confidence: 40,
          evidence: 'CEO signoff required for unbudgeted purchases over $10k.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 5,
          evidence: 'Zero discretionary budget; Series B capital restricted to headcount.',
        },
        champion: {
          status: 'partial',
          confidence: 50,
          evidence: 'Alex is transparent about constraints.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Alex',
        role: 'Department Lead',
        sentiment: 'neutral',
        evidence: 'Transparent about budget freeze.',
      },
    ],
    supporting_evidence: [
      "Alex: 'My department has zero discretionary software budget left for this year.'",
      "Alex: 'CEO froze all unbudgeted software purchases over $10k until Q2 next year.'",
    ],
  },
};

/**
 * Scenario 5: Procurement & Security Review Surprise
 * Rep expects close by end of month, but buyer surfaces a mandatory 90-day infosec audit.
 */
export const SCENARIO_PROCUREMENT_SURPRISE: EvaluationBenchmarkScenario = {
  id: 'scenario-procurement-surprise',
  name: 'Undiscovered 90-Day Enterprise Security Gate',
  description: 'Buyer is eager to buy by month-end but discloses mandatory 90-day infosec vetting.',
  transcript: `
AE: Great! If we get contracts out today, can we wrap this up by Friday for your end-of-month kickoff?
Taylor: I wish we could, but our InfoSec policy requires a full third-party penetration test review and vendor risk assessment. That team only meets once a month and their review queue is currently backed up 90 days.
AE: Is there an expedited track?
Taylor: No, compliance requires every cloud vendor to complete the full questionnaire before legal will even open the contract.
  `,
  expectedJudgment: {
    maxHealthScore: 50,
    allowedStatuses: ['At Risk', 'Stalled'],
    disallowedStatuses: ['Healthy', 'Won'],
    requiredPillarStatuses: {
      decision_process: 'partial',
      compelling_event: 'partial',
    },
    riskKeywords: ['90 days', 'infosec', 'compliance', 'questionnaire', 'security', 'delay'],
  },
  mockReview: {
    call: {
      call_status: 'Needs Attention',
      verdict: 'Severe timeline disconnect: mandatory 90-day InfoSec queue prevents month-end close.',
      reason: 'InfoSec policy requires 90-day review before legal contract review can begin.',
      highest_priority_risk: {
        risk: '90-Day InfoSec Backlog Blocking Contract Execution',
        why_it_matters: 'Deal cannot close this month; mandatory compliance review takes up to 3 months.',
        evidence: "Taylor: 'InfoSec policy requires full review... review queue is currently backed up 90 days.'",
      },
      what_youre_missing: [
        {
          gap: 'Security Questionnaire Submission',
          question_to_answer: 'Can we submit the SOC2 package today to get into the next review cycle?',
        },
      ],
      recommended_next_action: 'Submit security documentation immediately to start the 90-day clock and adjust forecast.',
      key_follow_up_message: 'Taylor, sending over our SOC2 Type II report and standard security packet today.',
      manager_note: 'Close date must be pushed 90 days out. Do not keep in current month.',
    },
    deal: {
      status: 'At Risk',
      confidence: 'High',
      status_reason: 'Decision process includes previously undiscovered 90-day compliance gate.',
      health_score: 45,
      highest_priority_risk: {
        risk: '90-day security review timeline delay',
        why_it_matters: 'Forecasted month-end close is impossible.',
        evidence: 'Taylor cited mandatory 90-day InfoSec queue.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Submit security packet immediately.',
      manager_note: 'Push forecast out 90 days.',
      pillars: {
        compelling_event: {
          status: 'partial',
          confidence: 45,
          evidence: 'Kickoff was desired by month end but subordinated to security policy.',
        },
        economic_buyer: {
          status: 'partial',
          confidence: 50,
          evidence: 'Taylor has authority to start process.',
        },
        decision_process: {
          status: 'partial',
          confidence: 65,
          evidence: 'Process clarified: InfoSec review (90 days) -> Legal review -> Contract.',
        },
        budget: {
          status: 'partial',
          confidence: 50,
          evidence: 'Pricing discussed, pending procurement.',
        },
        champion: {
          status: 'confirmed',
          confidence: 75,
          evidence: 'Taylor wants product but bounded by compliance rules.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Taylor',
        role: 'Buyer Contact',
        sentiment: 'champion',
        evidence: 'Wants to kickoff, transparent regarding security delays.',
      },
    ],
    supporting_evidence: [
      "Taylor: 'their review queue is currently backed up 90 days.'",
      "Taylor: 'compliance requires every cloud vendor to complete the full questionnaire before legal will even open the contract.'",
    ],
  },
};

/**
 * Scenario 6: Stage Regression & Executive Sponsor Departure
 * Deal was previously at Proposal, but buyer's executive champion left and new leadership restarts evaluation.
 */
export const SCENARIO_STAGE_REGRESSION: EvaluationBenchmarkScenario = {
  id: 'scenario-stage-regression',
  name: 'Executive Departure Causing Stage Regression',
  description: 'VP Sponsor left company; new VP orders complete restart of requirements evaluation.',
  transcript: `
AE: Hi Rachel, following up on the proposal we sent over to David last week.
Rachel: Unfortunately David left the company on Friday. Our new VP of Operations, Samantha, has taken over the team and wants to evaluate all tooling from scratch.
AE: Does Samantha want to review the proposal David approved?
Rachel: No, she has completely different architectural priorities and asked us to pause all pending vendor proposals until we redo discovery with her team next month.
  `,
  expectedJudgment: {
    maxHealthScore: 30,
    allowedStatuses: ['Critical', 'At Risk', 'Stalled'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      champion: 'unconfirmed',
      economic_buyer: 'unconfirmed',
      compelling_event: 'unconfirmed',
    },
    riskKeywords: ['left', 'departure', 'Samantha', 'restart', 'scratch', 'David'],
  },
  mockReview: {
    call: {
      call_status: 'Stalled',
      verdict: 'Complete qualification reset: VP David departed; new VP Samantha resets evaluation to scratch.',
      reason: 'Prior proposal invalidated by executive turnover and shift in architectural priorities.',
      highest_priority_risk: {
        risk: 'Champion Loss & Complete Discovery Reset under New VP',
        why_it_matters: 'The prior proposal is dead; new leader Samantha is resetting all vendor evaluations.',
        evidence: "Rachel: 'David left the company... new VP Samantha wants to evaluate all tooling from scratch.'",
      },
      what_youre_missing: [
        {
          gap: 'New VP Samantha Priorities',
          question_to_answer: 'What are Samantha’s specific architectural goals and criteria for tooling?',
        },
      ],
      recommended_next_action: 'Request an introductory discovery session with Samantha to re-qualify.',
      key_follow_up_message: 'Rachel, when Samantha is settled, I would love 15 minutes to learn about her new priorities.',
      manager_note: 'Deal regressed to Discovery. Re-qualify with incoming VP or close out.',
    },
    deal: {
      status: 'Critical',
      confidence: 'High',
      status_reason: 'Executive sponsor departed; deal has regressed to early discovery stage.',
      health_score: 22,
      highest_priority_risk: {
        risk: 'Executive champion loss and evaluation restart',
        why_it_matters: 'All previous qualification and pricing alignment is void.',
        evidence: 'David departed; Samantha paused all proposals.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Reset deal stage to Discovery and schedule introductory call with Samantha.',
      manager_note: 'Stage regression to Discovery.',
      pillars: {
        compelling_event: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'Previous timeline vacated by executive change.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'New VP Samantha unengaged.',
        },
        decision_process: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'Process reset to scratch by new leadership.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'Prior approved proposal paused.',
        },
        champion: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'Prior champion David left company.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Rachel',
        role: 'Internal Contact',
        sentiment: 'neutral',
        evidence: 'Informed of David departure and Samantha reset.',
      },
      {
        name: 'Samantha',
        role: 'VP Operations',
        sentiment: 'skeptic',
        evidence: 'Paused all pending proposals and restarting evaluation from scratch.',
      },
    ],
    supporting_evidence: [
      "Rachel: 'David left the company on Friday.'",
      "Rachel: 'she has completely different architectural priorities and asked us to pause all pending vendor proposals until we redo discovery'",
    ],
  },
};

/**
 * Scenario 7: The "Fake Next Step" Stalling Trap
 * Rep leaves call thinking deal is moving forward because buyer said "we'll circle back next month",
 * but there is no calendar invite, no clear owner, no mutual evaluation milestone, and no compelling event.
 */
export const SCENARIO_FAKE_NEXT_STEP: EvaluationBenchmarkScenario = {
  id: 'scenario-fake-next-step',
  name: 'Vague "Circle Back" Stalling Trap without Calendar Milestone',
  description: 'AE marks deal progressing despite vague buyer commitment and missing decision milestone.',
  transcript: `
AE: Thanks for reviewing the demo, Tom. How does next Tuesday look to review the formal pricing proposal?
Tom: Hey, Tuesday is slammed for us. Why don't you send the PDF over and we'll circle back sometime after the holidays or next month when things quiet down?
AE: Sounds good! I'll email the PDF and follow up in January.
Tom: Perfect, thanks.
  `,
  expectedJudgment: {
    maxHealthScore: 50,
    allowedStatuses: ['Stalled', 'At Risk', 'Unknown'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      compelling_event: 'unconfirmed',
      decision_process: 'unconfirmed',
    },
    requiredMissingGaps: ['next step', 'decision timeline', 'compelling event'],
    riskKeywords: ['stall', 'circle back', 'calendar', 'milestone', 'urgency', 'commitment'],
  },
  mockReview: {
    call: {
      call_status: 'Stalled',
      verdict: 'Buyer brushed off meeting request with vague "circle back after the holidays" stall.',
      reason: 'No scheduled next meeting, no mutual action plan, and no compelling reason to re-engage in January.',
      highest_priority_risk: {
        risk: 'Unanchored Next Step and Deal Momentum Loss',
        why_it_matters: 'Deals left with vague follow-up timelines have an 80%+ drop-off rate.',
        evidence: "Tom: 'Why don't you send the PDF over and we'll circle back sometime after the holidays or next month'",
      },
      what_youre_missing: [
        {
          gap: 'Firm Decision Milestone',
          question_to_answer: 'What specific business event or deadline will trigger Tom’s team to evaluate the PDF?',
        },
      ],
      recommended_next_action: 'Lock in a specific 15-minute calendar review before sending the PDF proposal.',
      key_follow_up_message: 'Tom, happy to send the PDF, but before I do, can we hold 15 mins on Jan 8th so we can walk through questions together?',
      manager_note: 'Do not accept vague follow-ups. Rep let the buyer off the phone without a calendar commitment.',
    },
    deal: {
      status: 'Stalled',
      confidence: 'High',
      status_reason: 'No active next milestone; deal momentum stalled at proposal stage.',
      health_score: 38,
      highest_priority_risk: {
        risk: 'Vague follow-up timeline and lack of buyer urgency',
        why_it_matters: 'Deal will go dark without scheduled calendar milestone.',
        evidence: 'Buyer requested PDF with vague promise to circle back next month.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Secure a firm calendar meeting before releasing detailed pricing.',
      manager_note: 'At risk of going dark.',
      pillars: {
        compelling_event: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'No event or deadline forcing an evaluation before January.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 25,
          evidence: 'Tom authority unverified.',
        },
        decision_process: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'No evaluation criteria or process agreed upon.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 20,
          evidence: 'Pricing PDF not yet reviewed or accepted.',
        },
        champion: {
          status: 'unconfirmed',
          confidence: 30,
          evidence: 'Tom demonstrated low urgency and deferred meeting.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Tom',
        role: 'Evaluation Lead',
        sentiment: 'neutral',
        evidence: 'Deferred scheduling and requested offline PDF.',
      },
    ],
    supporting_evidence: [
      "Tom: 'Why don't you send the PDF over and we'll circle back sometime after the holidays or next month when things quiet down?'",
    ],
  },
};

/**
 * Scenario 8: Unresolved Status Quo / Inertia Trap
 * Buyer loves the concept but acknowledges their homegrown spreadsheet system is "working fine for now".
 * AE fails to uncover cost of inaction, leading to a closed-lost to status quo.
 */
export const SCENARIO_UNRESOLVED_STATUS_QUO: EvaluationBenchmarkScenario = {
  id: 'scenario-unresolved-status-quo',
  name: 'Strong Concept Interest but entrenched Status Quo Inertia',
  description: 'Buyer appreciates the tool but admits internal spreadsheets work fine and change is painful.',
  transcript: `
AE: How are you managing pipeline forecasts currently, Lisa?
Lisa: Honestly, we just have a master Google Sheet. It’s clunky and manual, but everyone knows how to use it and it gets the job done for our weekly executive meeting.
AE: Our platform automates all of that in real time!
Lisa: That sounds super sleek. But changing how 40 reps log their numbers is a huge headache. Unless our board mandates a change, our spreadsheets work well enough for now.
  `,
  expectedJudgment: {
    maxHealthScore: 48,
    allowedStatuses: ['At Risk', 'Stalled', 'Critical'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      compelling_event: 'unconfirmed',
      champion: 'unconfirmed',
    },
    requiredMissingGaps: ['cost of inaction', 'compelling event', 'urgency'],
    riskKeywords: ['status quo', 'inertia', 'spreadsheets', 'headache', 'change', 'board'],
  },
  mockReview: {
    call: {
      call_status: 'At Risk',
      verdict: 'High status quo inertia: customer spreadsheet is deemed "good enough" with no pain of inaction.',
      reason: 'Lisa stated 40 reps changing processes is too painful unless board mandates it.',
      highest_priority_risk: {
        risk: 'Loss to Status Quo Inertia',
        why_it_matters: 'Without quantified cost of inaction, customer will stay on free spreadsheets.',
        evidence: "Lisa: 'Unless our board mandates a change, our spreadsheets work well enough for now.'",
      },
      what_youre_missing: [
        {
          gap: 'Quantified Cost of Inaction',
          question_to_answer: 'What revenue or forecasting error does the current spreadsheet cause the executive team?',
        },
      ],
      recommended_next_action: 'Focus discovery on the revenue cost of pipeline blindness in their current spreadsheet.',
      key_follow_up_message: 'Lisa, what is the cost to the business when a forecast in the spreadsheet turns out to be 20% off at quarter-end?',
      manager_note: 'Deal will die to "no decision" unless cost of inaction is quantified.',
    },
    deal: {
      status: 'At Risk',
      confidence: 'High',
      status_reason: 'Entrenched status quo; customer perceives migration pain higher than current spreadsheet pain.',
      health_score: 35,
      highest_priority_risk: {
        risk: 'No compelling event to displace internal Google Sheet',
        why_it_matters: 'Perceived change management cost outweighs perceived product value.',
        evidence: 'Lisa noted 40-rep rollout is a huge headache and spreadsheet works well enough.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Reframe conversation around board-level forecasting risk and missed revenue.',
      manager_note: 'Severe status quo risk.',
      pillars: {
        compelling_event: {
          status: 'unconfirmed',
          confidence: 10,
          evidence: 'Customer explicitly stated spreadsheet is good enough for now.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 20,
          evidence: 'Board or CRO authority required to mandate change.',
        },
        decision_process: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'No active project or mandate.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'No budget allocated for spreadsheet replacement.',
        },
        champion: {
          status: 'unconfirmed',
          confidence: 25,
          evidence: 'Lisa unwilling to champion internal change management.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Lisa',
        role: 'Operations Lead',
        sentiment: 'skeptic',
        evidence: 'Expressed concern over 40-rep rollout headache and defended spreadsheet.',
      },
    ],
    supporting_evidence: [
      "Lisa: 'Unless our board mandates a change, our spreadsheets work well enough for now.'",
      "Lisa: 'changing how 40 reps log their numbers is a huge headache.'",
    ],
  },
};

/**
 * Scenario 9: Unaddressed Competitor Bake-Off
 * Customer is running an active proof-of-concept with direct incumbent competitor, but rep fails to differentiate.
 */
export const SCENARIO_COMPETITOR_AMBIGUITY: EvaluationBenchmarkScenario = {
  id: 'scenario-competitor-ambiguity',
  name: 'Hidden Competitor Threat and Undifferentiated Feature Comparison',
  description: 'Buyer is conducting a bake-off with Competitor X who is offering 40% discount and bundling.',
  transcript: `
AE: How is our interface feeling compared to what you tested earlier?
Kevin: Your UI is cleaner, but CompetitorX is already bundled in our enterprise Microsoft agreement for 40% less cost, and their VP called our CIO yesterday.
AE: Well, our AI algorithms are much newer!
Kevin: Maybe, but if their solution is already included in our existing enterprise tier, it's hard to justify standalone spend without distinct ROI.
  `,
  expectedJudgment: {
    maxHealthScore: 50,
    allowedStatuses: ['At Risk', 'Critical', 'Stalled'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      budget: 'unconfirmed',
      decision_process: 'partial',
    },
    requiredMissingGaps: ['competitive differentiation', 'economic justification'],
    riskKeywords: ['competitor', 'CompetitorX', 'bundled', 'discount', 'CIO', 'justification'],
  },
  mockReview: {
    call: {
      call_status: 'At Risk',
      verdict: 'Severe competitive disadvantage: CompetitorX is bundled at 40% discount and engaged at CIO level.',
      reason: 'AE failed to articulate distinct ROI against existing bundled competitor solution.',
      highest_priority_risk: {
        risk: 'Loss to Bundled Incumbent Competitor',
        why_it_matters: 'CompetitorX is already in enterprise agreement and engaged with buyer CIO.',
        evidence: "Kevin: 'CompetitorX is already bundled in our enterprise Microsoft agreement for 40% less cost, and their VP called our CIO yesterday.'",
      },
      what_youre_missing: [
        {
          gap: 'Differentiated Business Impact vs CompetitorX',
          question_to_answer: 'What measurable business outcome does Kairo deliver that CompetitorX cannot provide?',
        },
      ],
      recommended_next_action: 'Arm Kevin with a specific capability matrix and ROI business case for the CIO.',
      key_follow_up_message: 'Kevin, let’s build a 1-page business case showing why our deal intelligence prevents $500k in slipped deals that CompetitorX ignores.',
      manager_note: 'Competitive threat at executive level. Needs immediate differentiation or deal is lost.',
    },
    deal: {
      status: 'At Risk',
      confidence: 'High',
      status_reason: 'Incumbent competitor offering discounted bundle with executive sponsorship.',
      health_score: 41,
      highest_priority_risk: {
        risk: 'Incumbent vendor bundling and executive alignment',
        why_it_matters: 'Competitor engaged with CIO with lower price point.',
        evidence: 'Kevin stated CompetitorX is bundled in enterprise agreement.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Elevate value proposition to CIO level with focus on deal intelligence ROI.',
      manager_note: 'Competitive defense required.',
      pillars: {
        compelling_event: {
          status: 'partial',
          confidence: 50,
          evidence: 'Active evaluation underway but competitor favored on price.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 20,
          evidence: 'CIO is the economic buyer and is talking directly to competitor VP.',
        },
        decision_process: {
          status: 'partial',
          confidence: 60,
          evidence: 'Active comparison between Kairo and bundled incumbent.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 30,
          evidence: 'Unwilling to spend additional budget if competitor is bundled.',
        },
        champion: {
          status: 'partial',
          confidence: 45,
          evidence: 'Kevin likes UI but cannot defend purchase alone.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Kevin',
        role: 'Evaluation Lead',
        sentiment: 'neutral',
        evidence: 'Noted UI advantage but highlighted competitor bundling and pricing.',
      },
    ],
    supporting_evidence: [
      "Kevin: 'CompetitorX is already bundled in our enterprise Microsoft agreement for 40% less cost, and their VP called our CIO yesterday.'",
    ],
  },
};

/**
 * Scenario 10: Multi-Call Longitudinal EB Unresolved Risk
 * Call 3 in a longitudinal deal: Rep was alerted on Call 1 and Call 2 that Economic Buyer was missing.
 * On Call 3, rep still has not engaged EB. Risk MUST escalate to Critical with consecutive_unresolved_calls = 3.
 */
export const SCENARIO_LONGITUDINAL_EB_RISK: EvaluationBenchmarkScenario = {
  id: 'scenario-longitudinal-eb-risk',
  name: '3-Call Longitudinal Unresolved Economic Buyer Escalation',
  description: 'Deal has progressed across 3 conversations without contacting economic buyer, triggering critical escalation.',
  transcript: `
AE: Great to sync again, Dan. We are on week 4 of our trial now.
Dan: Yes, the engineers are continuing to test.
AE: Are we ready to send contracts for next week's kickoff?
Dan: Well as I mentioned on our last two calls, I can't approve anything over $10k. You still need to present this to our CFO Patricia, but she is out on leave until next month.
AE: Got it, let's just wait then.
  `,
  expectedJudgment: {
    maxHealthScore: 35,
    allowedStatuses: ['Critical', 'At Risk', 'Stalled'],
    disallowedStatuses: ['Healthy', 'Promising', 'Won'],
    requiredPillarStatuses: {
      economic_buyer: 'unconfirmed',
      decision_process: 'unconfirmed',
    },
    requiredMissingGaps: ['economic buyer', 'CFO Patricia', 'approval authority'],
    riskKeywords: ['Patricia', 'CFO', 'approval', 'consecutive', 'unresolved', 'leave'],
  },
  mockReview: {
    call: {
      call_status: 'At Risk',
      verdict: 'Persistent longitudinal failure: Economic Buyer Patricia has been missing for 3 consecutive calls.',
      reason: 'Dan cannot approve $10k+ spend; CFO Patricia has not been engaged and is on leave.',
      highest_priority_risk: {
        risk: 'Missing Economic Buyer Unresolved for 3 Consecutive Calls',
        why_it_matters: 'Deal cannot close without CFO Patricia who is unengaged and currently on leave.',
        evidence: "Dan: 'as I mentioned on our last two calls, I can't approve anything over $10k. You still need to present this to our CFO Patricia'",
      },
      what_youre_missing: [
        {
          gap: 'Direct Engagement with CFO Patricia',
          question_to_answer: 'Who is acting CFO proxy with signing authority while Patricia is on leave?',
        },
      ],
      recommended_next_action: 'Identify interim signing proxy or align re-engagement timeline directly with CFO.',
      key_follow_up_message: 'Dan, while Patricia is away, who is handling interim spend approvals for Q4 tooling?',
      manager_note: 'Recurring longitudinal risk. Third call with no EB engagement. Freeze close date.',
    },
    deal: {
      status: 'Critical',
      confidence: 'High',
      status_reason: 'Longitudinal risk persistence: Economic buyer absent for 3 consecutive calls.',
      health_score: 28,
      highest_priority_risk: {
        risk: 'Economic Buyer missing across 3 consecutive calls',
        why_it_matters: 'Closing date slipped; signer uncontacted.',
        evidence: 'Dan confirmed lack of authority across 3 syncs.',
      },
      what_youre_missing: [],
      recommended_next_action: 'Executive sponsor outreach to finance proxy.',
      manager_note: 'Severe longitudinal stall.',
      pillars: {
        compelling_event: {
          status: 'unconfirmed',
          confidence: 20,
          evidence: 'Kickoff delayed due to absent signer.',
        },
        economic_buyer: {
          status: 'unconfirmed',
          confidence: 0,
          evidence: 'CFO Patricia unengaged across all 3 calls.',
        },
        decision_process: {
          status: 'unconfirmed',
          confidence: 15,
          evidence: 'Approval process blocked by absent EB.',
        },
        budget: {
          status: 'unconfirmed',
          confidence: 20,
          evidence: 'Spend over $10k unapproved.',
        },
        champion: {
          status: 'partial',
          confidence: 40,
          evidence: 'Dan supportive but powerless to sign.',
        },
      },
    },
    stakeholder_signals: [
      {
        name: 'Dan',
        role: 'Evaluation Lead',
        sentiment: 'neutral',
        evidence: 'Reiterated lack of spending authority over $10k.',
      },
      {
        name: 'Patricia',
        role: 'CFO',
        sentiment: null,
        evidence: 'Uncontacted across all deal conversations.',
      },
    ],
    supporting_evidence: [
      "Dan: 'as I mentioned on our last two calls, I can't approve anything over $10k. You still need to present this to our CFO Patricia, but she is out on leave until next month.'",
    ],
  },
};

export const ALL_BENCHMARK_SCENARIOS: EvaluationBenchmarkScenario[] = [
  SCENARIO_HAPPY_EARS,
  SCENARIO_WELL_QUALIFIED,
  SCENARIO_HIDDEN_BLOCKER,
  SCENARIO_PHANTOM_BUDGET,
  SCENARIO_PROCUREMENT_SURPRISE,
  SCENARIO_STAGE_REGRESSION,
  SCENARIO_FAKE_NEXT_STEP,
  SCENARIO_UNRESOLVED_STATUS_QUO,
  SCENARIO_COMPETITOR_AMBIGUITY,
  SCENARIO_LONGITUDINAL_EB_RISK,
];



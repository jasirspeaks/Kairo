/**
 * Unified re-exports from @kairo/core and @kairo/api
 * Preserves 100% backward compatibility across all existing web pages and components.
 */
export {
  getCallStatusColor,
  getCallStatusStyle,
  getStatusColor,
  getStatusStyle,
  getRiskLevel,
  resolveDealStage,
  summarizePipelinePillars,
  type PipelinePillarSummary,
  PILLAR_LABELS,
  PILLAR_ORDER,
  getPillarBarColor,
  getHealthScoreColor,
  formatDealValue,
  type Meeting,
  type MeetingWithDeal,
  type MeetingStatus,
  type CaptureStatus,
} from '@kairo/core';

export {
  reviewCall,
  saveDealState,
  saveStakeholders,
  checkCalendarConnected,
  getCalendarConnectionStatus,
  syncGoogleCalendar,
  scheduleMeetingViaGoogle,
  meetingsService,
  submitRecording,
  submitTranscript,
  type SubmitRecordingResult,
  type SubmitTranscriptResult,
  describeRecordingError,
  getDealLongitudinalHistory,
  createCheckoutSession,
  createCustomerPortalSession,
  GOOGLE_CALENDAR_URL,
} from '@kairo/api';
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
} from '@kairo/core';

export {
  reviewCall,
  saveDealState,
  saveStakeholders,
  checkCalendarConnected,
  syncGoogleCalendar,
  submitRecording,
  describeRecordingError,
  getDealLongitudinalHistory,
  createCheckoutSession,
  createCustomerPortalSession,
  GOOGLE_CALENDAR_URL,
} from '@kairo/api';
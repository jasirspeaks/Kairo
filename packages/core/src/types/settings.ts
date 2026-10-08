export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';

export interface IntelligencePreferences {
  currency: CurrencyCode;
  custom_terms: string;
  fiscal_year_start_month: number; // 1 = January, 2 = February, etc.
}

export interface AudioCapturePreferences {
  auto_capture_enabled: boolean;
  capture_source: 'microphone' | 'system_audio' | 'combined';
  input_device_name: string | null;
  wifi_only_upload: boolean;
}

export interface NotificationPreferences {
  notify_review_ready: boolean;
  notify_deal_at_risk: boolean;
  notify_pre_meeting: boolean;
}

export interface KairoLocalPreferences {
  intelligence: IntelligencePreferences;
  capture: AudioCapturePreferences;
  notifications: NotificationPreferences;
}

export const DEFAULT_INTELLIGENCE_PREFERENCES: IntelligencePreferences = {
  currency: 'USD',
  custom_terms: '',
  fiscal_year_start_month: 1,
};

export const DEFAULT_AUDIO_CAPTURE_PREFERENCES: AudioCapturePreferences = {
  auto_capture_enabled: true,
  capture_source: 'combined',
  input_device_name: null,
  wifi_only_upload: true,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  notify_review_ready: true,
  notify_deal_at_risk: true,
  notify_pre_meeting: true,
};

export const DEFAULT_LOCAL_PREFERENCES: KairoLocalPreferences = {
  intelligence: DEFAULT_INTELLIGENCE_PREFERENCES,
  capture: DEFAULT_AUDIO_CAPTURE_PREFERENCES,
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
};

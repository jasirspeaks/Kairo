import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useAuth, getDeals, submitRecording } from '@kairo/api';
import { type Deal } from '@kairo/core';
import { colors } from '../theme/colors';
import { useNavigation } from '../navigation/NavigationContext';
import { TopBar } from '../components/layout/TopBar';

export function RecordScreen({ dealId: initialDealId }: { dealId?: string }) {
  const { user } = useAuth();
  const { navigate, goBack } = useNavigation();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>(initialDealId || '');
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duration, setDuration] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);

  useEffect(() => {
    if (!user) return;
    getDeals(user.id).then((data) => {
      setDeals(data);
      if (data.length > 0 && !selectedDealId) {
        setSelectedDealId(data[0].id);
      }
    });
  }, [user]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let interval: any = null;
    if (isRecording) {
      interval = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  const startActualRecording = async () => {
    try {
      setErrorMessage(null);
      setStatusMessage(null);

      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage(
          'Microphone access is required to record conversations. Please enable permissions in device settings.'
        );
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();

      recordingRef.current = recording;
      setDuration(0);
      setIsRecording(true);
      setStatusMessage('Recording active... capturing live microphone audio.');
    } catch (err: any) {
      console.error('[MobileRecorder] Failed to start recording:', err);
      setErrorMessage(err?.message || 'Failed to initialize microphone recording.');
      setIsRecording(false);
    }
  };

  const discardRecording = async () => {
    const recording = recordingRef.current;
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (uri) {
          await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
      } catch {
        // Ignore cleanup errors on discard
      }
      recordingRef.current = null;
    }
    setIsRecording(false);
    setDuration(0);
    setStatusMessage('Recording discarded.');
    setErrorMessage(null);
  };

  const stopAndSubmitRecording = async () => {
    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
      return;
    }

    if (!selectedDealId) {
      setErrorMessage('Please select an associated deal before submitting.');
      return;
    }

    setIsRecording(false);
    setIsSubmitting(true);
    setStatusMessage('Finalizing audio capture...');
    setErrorMessage(null);

    let recordedUri: string | null = null;

    try {
      await recording.stopAndUnloadAsync();
      recordedUri = recording.getURI();
      recordingRef.current = null;

      if (!recordedUri) {
        throw new Error('Recording ended without producing a valid audio file URI.');
      }

      const fileInfo = await FileSystem.getInfoAsync(recordedUri);
      if (!fileInfo.exists) {
        throw new Error('Recorded audio file could not be found on device storage.');
      }

      if ('size' in fileInfo && fileInfo.size === 0) {
        throw new Error('Recorded audio file is empty (0 bytes). Please check microphone input.');
      }

      let audioBlob: Blob;
      try {
        const response = await fetch(recordedUri);
        audioBlob = await response.blob();
      } catch {
        const b64 = await FileSystem.readAsStringAsync(recordedUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        audioBlob = new Blob([byteArray], { type: 'audio/m4a' });
      }

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Audio payload contains 0 bytes. Recording discarded.');
      }

      setStatusMessage('Call captured! Kairo is analyzing deal intelligence in the background.');

      await submitRecording(selectedDealId, audioBlob, 'audio/m4a');

      await FileSystem.deleteAsync(recordedUri, { idempotent: true }).catch(() => {});

      setTimeout(() => {
        if (selectedDealId) {
          navigate('deal_review', { dealId: selectedDealId });
        }
      }, 1500);
    } catch (err: any) {
      console.error('[MobileRecorder] Submission failed:', err);
      setErrorMessage(err?.message || 'Failed to process mobile audio recording.');
      setStatusMessage(null);
      if (recordedUri) {
        await FileSystem.deleteAsync(recordedUri, { idempotent: true }).catch(() => {});
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      await stopAndSubmitRecording();
    } else {
      await startActualRecording();
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <TopBar title="Capture Live Call" showBack onBackPress={goBack} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Target Deal Selector */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ASSOCIATED DEAL</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dealPills}>
            {deals.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[
                  styles.dealPill,
                  selectedDealId === d.id && styles.dealPillActive,
                ]}
                onPress={() => setSelectedDealId(d.id)}
              >
                <Text
                  style={[
                    styles.dealPillText,
                    selectedDealId === d.id && styles.dealPillTextActive,
                  ]}
                >
                  {d.company_name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Recorder Center */}
        <View style={styles.recordCenter}>
          <TouchableOpacity
            disabled={isSubmitting}
            style={[
              styles.recordCircle,
              isRecording && styles.recordCircleActive,
              isSubmitting && styles.recordCircleDisabled,
            ]}
            onPress={toggleRecording}
          >
            {isSubmitting ? (
              <ActivityIndicator size="large" color={colors.white} />
            ) : (
              <View
                style={[
                  styles.innerCircle,
                  isRecording && styles.innerCircleActive,
                ]}
              />
            )}
          </TouchableOpacity>

          <Text style={styles.timerText}>{formatSeconds(duration)}</Text>
          <Text style={styles.hintText}>
            {isSubmitting
              ? 'Processing and generating deal intelligence...'
              : isRecording
              ? 'Recording audio... Tap red square to finish & analyze'
              : 'Tap microphone button to start recording'}
          </Text>

          {isRecording && (
            <TouchableOpacity
              style={styles.discardButton}
              onPress={discardRecording}
              disabled={isSubmitting}
            >
              <Text style={styles.discardButtonText}>Discard Recording</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Status Message */}
        {statusMessage && (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{statusMessage}</Text>
          </View>
        )}

        {/* Error Message */}
        {errorMessage && (
          <View style={[styles.statusBox, styles.errorBox]}>
            <Text style={[styles.statusText, styles.errorText]}>{errorMessage}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.tertiary,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  dealPills: {
    flexDirection: 'row',
  },
  dealPill: {
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dealPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dealPillText: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  dealPillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  recordCenter: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  recordCircleActive: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  recordCircleDisabled: {
    opacity: 0.7,
  },
  innerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
  },
  innerCircleActive: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  timerText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  hintText: {
    color: colors.text.secondary,
    fontSize: 13,
    textAlign: 'center',
  },
  discardButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  discardButtonText: {
    color: colors.dangerText,
    fontSize: 12,
    fontWeight: '600',
  },
  statusBox: {
    backgroundColor: colors.successBg,
    borderColor: colors.successBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  statusText: {
    color: colors.successText,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  errorText: {
    color: colors.dangerText,
  },
});

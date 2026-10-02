import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useAuth, getDeals, submitRecording } from '@kairo/api';
import { Deal } from '@kairo/core';

export function RecordScreen() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
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

  // Cleanup on unmount
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

      // 1. Request microphone permissions explicitly
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setErrorMessage('Microphone access is required to record conversations. Please enable permissions in device settings.');
        return;
      }

      // 2. Configure audio mode for high-fidelity recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // 3. Instantiate and prepare real audio recording
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

    try {
      // 1. Stop and unload hardware recording
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      recordingRef.current = null;

      if (!uri) {
        throw new Error('Recording ended without producing a valid audio file URI.');
      }

      // 2. Validate file existence and non-zero size
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error('Recorded audio file could not be found on device storage.');
      }

      if ('size' in fileInfo && fileInfo.size === 0) {
        throw new Error('Recorded audio file is empty (0 bytes). Please check microphone input.');
      }

      // 3. Fetch real audio blob from local filesystem URI
      const response = await fetch(uri);
      const audioBlob = await response.blob();

      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Audio payload contains 0 bytes. Recording discarded.');
      }

      setStatusMessage(`Uploading real recording (${(audioBlob.size / 1024).toFixed(1)} KB) and generating 5-pillar deal intelligence...`);

      // 4. Submit genuine audio payload through pipeline
      await submitRecording(selectedDealId, audioBlob, 'audio/m4a');
      setStatusMessage('Audio recorded & 5-pillar deal intelligence generated successfully!');
    } catch (err: any) {
      console.error('[MobileRecorder] Submission failed:', err);
      setErrorMessage(err?.message || 'Failed to process mobile audio recording.');
      setStatusMessage(null);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Record Conversation</Text>
        <Text style={styles.subtitle}>Real mobile microphone capture for instant deal intelligence</Text>
      </View>

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
            <ActivityIndicator size="large" color="#FFFFFF" />
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
            ? 'Processing and transcribing audio...'
            : isRecording
            ? 'Recording audio... Tap red square to stop & analyze'
            : 'Tap microphone button to start recording'}
        </Text>
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
  );
}

const styles = StyleSheet.create({
  errorBox: {
    backgroundColor: '#FF667A1A',
    borderColor: '#FF667A33',
  },
  errorText: {
    color: '#FF667A',
  },
  container: {
    flex: 1,
    backgroundColor: '#0D0715',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F7F2FC',
  },
  subtitle: {
    fontSize: 13,
    color: '#796B8A',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#160D21',
    borderWidth: 1,
    borderColor: '#302044',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#796B8A',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  dealPills: {
    flexDirection: 'row',
  },
  dealPill: {
    backgroundColor: '#201330',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#302044',
  },
  dealPillActive: {
    backgroundColor: '#7042C5',
    borderColor: '#7042C5',
  },
  dealPillText: {
    color: '#796B8A',
    fontSize: 12,
    fontWeight: '600',
  },
  dealPillTextActive: {
    color: '#FFFFFF',
  },
  recordCenter: {
    backgroundColor: '#160D21',
    borderWidth: 1,
    borderColor: '#302044',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#201330',
    borderWidth: 3,
    borderColor: '#7042C5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  recordCircleActive: {
    borderColor: '#FF667A',
    backgroundColor: '#30131E',
  },
  recordCircleDisabled: {
    opacity: 0.7,
  },
  innerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7042C5',
  },
  innerCircleActive: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#FF667A',
  },
  timerText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F7F2FC',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  hintText: {
    color: '#796B8A',
    fontSize: 12,
    textAlign: 'center',
  },
  statusBox: {
    backgroundColor: '#3DD68C1A',
    borderColor: '#3DD68C33',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  statusText: {
    color: '#3DD68C',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
});

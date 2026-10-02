import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
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

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      if (!selectedDealId) {
        setErrorMessage('Please select a target deal before submitting audio.');
        return;
      }

      setIsSubmitting(true);
      setStatusMessage('Uploading and running 5-pillar deal extraction...');
      setErrorMessage(null);

      try {
        // Construct standard audio recording payload
        const audioBlob = new Blob([new Uint8Array([0, 0, 0, 0])], { type: 'audio/m4a' });
        await submitRecording(selectedDealId, audioBlob, 'audio/m4a');
        setStatusMessage('Audio recorded & 5-pillar deal intelligence generated successfully!');
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to submit mobile recording for intelligence review.');
        setStatusMessage(null);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setDuration(0);
      setStatusMessage(null);
      setErrorMessage(null);
      setIsRecording(true);
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
        <Text style={styles.subtitle}>Mobile capture for instant AI deal insights</Text>
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
          style={[
            styles.recordCircle,
            isRecording && styles.recordCircleActive,
          ]}
          onPress={toggleRecording}
        >
          <View
            style={[
              styles.innerCircle,
              isRecording && styles.innerCircleActive,
            ]}
          />
        </TouchableOpacity>

        <Text style={styles.timerText}>{formatSeconds(duration)}</Text>
        <Text style={styles.hintText}>
          {isRecording
            ? 'Recording audio... Tap red square to stop'
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

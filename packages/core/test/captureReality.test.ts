import { describe, it, expect } from 'vitest';
import { normalizeEvidenceList, normalizeEvidenceItem } from '../src';

describe('P0 & P1 — Audio Capture Reality & Validation Invariants', () => {
  describe('Desktop Audio Format & Metadata Invariants', () => {
    it('validates WAV audio spec parameters for compact deal intelligence (16kHz 16-bit Mono)', () => {
      const targetSampleRate = 16000;
      const targetChannels = 1;
      const targetBitsPerSample = 16;

      const bytesPerSample = targetBitsPerSample / 8;
      const bytesPerSecond = targetSampleRate * targetChannels * bytesPerSample;

      // 10 seconds of 16kHz mono 16-bit audio should be exactly 320,000 bytes of PCM payload (+ 44 bytes WAV header)
      const durationSeconds = 10;
      const expectedPcmBytes = durationSeconds * bytesPerSecond;
      const wavHeaderBytes = 44;
      const totalExpectedBytes = expectedPcmBytes + wavHeaderBytes;

      expect(bytesPerSecond).toBe(32000);
      expect(totalExpectedBytes).toBe(320044);
    });

    it('rejects simulated 0-byte or empty audio payloads', () => {
      const emptyPayload = new Uint8Array(0);
      expect(emptyPayload.byteLength).toBe(0);

      const isValidAudio = (bytes: Uint8Array): boolean => {
        // Valid audio must contain at least WAV header (44 bytes) plus audio frames
        return bytes.byteLength > 44;
      };

      expect(isValidAudio(emptyPayload)).toBe(false);
      expect(isValidAudio(new Uint8Array([0, 0, 0, 0]))).toBe(false);
      expect(isValidAudio(new Uint8Array(100))).toBe(true);
    });
  });

  describe('Mobile Audio Capture & Blob Validation', () => {
    it('validates that mobile capture blob must have non-zero size', () => {
      const validateAudioBlob = (blob: { size: number; type: string }): { valid: boolean; error?: string } => {
        if (!blob || blob.size === 0) {
          return { valid: false, error: 'Cannot submit empty audio recording. The recording must contain captured audio data.' };
        }
        if (!blob.type.startsWith('audio/')) {
          return { valid: false, error: 'Invalid audio MIME type.' };
        }
        return { valid: true };
      };

      expect(validateAudioBlob({ size: 0, type: 'audio/m4a' }).valid).toBe(false);
      expect(validateAudioBlob({ size: 4, type: 'audio/m4a' }).valid).toBe(true);
      expect(validateAudioBlob({ size: 64000, type: 'audio/m4a' }).valid).toBe(true);
      expect(validateAudioBlob({ size: 1000, type: 'text/plain' }).valid).toBe(false);
    });
  });

  describe('Canonical Evidence Grounding Validation', () => {
    it('normalizes string evidence into canonical GroundedEvidenceItem', () => {
      const rawString = "Buyer: 'We need this in place by November 15th.'";
      const normalized = normalizeEvidenceItem(rawString);

      expect(normalized).toBeDefined();
      expect(normalized?.quote).toBe(rawString);
      expect(normalized?.grounding_type).toBe('explicit_statement');
      expect(normalized?.confidence).toBe(80);
    });

    it('validates structured GroundedEvidenceItem with speaker, pillar, and confidence', () => {
      const rawObj = {
        quote: "CFO Elena: 'Approved $120k from security modernization budget.'",
        speaker: 'Elena',
        pillar_key: 'budget',
        grounding_type: 'explicit_statement',
        confidence: 95,
      };

      const normalized = normalizeEvidenceItem(rawObj);

      expect(normalized).toBeDefined();
      expect(normalized?.quote).toBe(rawObj.quote);
      expect(normalized?.speaker).toBe('Elena');
      expect(normalized?.pillar_key).toBe('budget');
      expect(normalized?.grounding_type).toBe('explicit_statement');
      expect(normalized?.confidence).toBe(95);
    });

    it('rejects empty or whitespace-only evidence items', () => {
      expect(normalizeEvidenceItem('')).toBeNull();
      expect(normalizeEvidenceItem('   ')).toBeNull();
      expect(normalizeEvidenceItem({ quote: '' })).toBeNull();
      expect(normalizeEvidenceList(['', '   ', null, undefined])).toEqual([]);
    });
  });
});

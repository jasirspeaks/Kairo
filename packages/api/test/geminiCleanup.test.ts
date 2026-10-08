import { describe, it, expect, vi } from 'vitest';
import { deleteGeminiFile } from '../src/services/geminiCleanup';

describe('deleteGeminiFile', () => {
  it('returns false immediately if fileName is missing', async () => {
    const fetchMock = vi.fn();
    const result = await deleteGeminiFile('', 'test-api-key', fetchMock as any);
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false immediately if apiKey is missing', async () => {
    const fetchMock = vi.fn();
    const result = await deleteGeminiFile('files/abc123', '', fetchMock as any);
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls DELETE on the correct Gemini API endpoint and returns true on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await deleteGeminiFile(
      'files/upload-test-999',
      'gemini-secret-key',
      fetchMock as any
    );

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/files/upload-test-999?key=gemini-secret-key',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  it('handles HTTP error responses gracefully without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await deleteGeminiFile(
      'files/expired-or-missing',
      'gemini-secret-key',
      fetchMock as any
    );

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('handles network rejection/abort gracefully without throwing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const result = await deleteGeminiFile(
      'files/file-to-delete',
      'gemini-secret-key',
      fetchMock as any
    );

    expect(result).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

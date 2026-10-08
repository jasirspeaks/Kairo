/**
 * Best-effort deletion of uploaded Gemini Files API assets.
 * When files are uploaded to Google Generative Language Files API (>=18MB audio),
 * they should be deleted as soon as transcription completes or errors out,
 * ensuring customer voice data is not retained on Google's file storage.
 */
export async function deleteGeminiFile(
  fileName: string,
  apiKey?: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  if (!fileName || !apiKey) return false;
  try {
    const res = await fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
      {
        method: 'DELETE',
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!res.ok) {
      console.warn(
        `[gemini-cleanup] Best-effort Gemini file cleanup returned status ${res.status} for file ${fileName}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[gemini-cleanup] Best-effort Gemini file cleanup failed for file ${fileName}:`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

import {
  Conversation,
  DealReview,
} from '@kairo/core';
import { getClientConfig, getKairoClient, KairoClient } from '../client';

export interface SellerContext {
  what_you_sell?: string;
  who_you_are?: string;
}

export interface DealContext {
  deal_id?: string;
  deal_name: string;
  company_name: string;
  deal_stage?: string;
  previous_review?: DealReview | null;
  longitudinal_history?: Record<string, any>;
  seller_context?: SellerContext;
}

export async function getConversations(
  dealId: string,
  client: KairoClient = getKairoClient()
): Promise<Conversation[]> {
  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data as Conversation[]) || [];
}

export async function getConversation(
  conversationId: string,
  client: KairoClient = getKairoClient()
): Promise<Conversation | null> {
  const { data, error } = await client
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;
  return data as Conversation | null;
}

export async function deleteConversation(
  conversationId: string,
  client: KairoClient = getKairoClient()
): Promise<void> {
  const { error } = await client
    .from('conversations')
    .delete()
    .eq('id', conversationId);
  if (error) throw error;
}

export async function reviewCall(
  transcript: string,
  deal_context?: DealContext,
  idempotencyKey?: string,
  client: KairoClient = getKairoClient()
): Promise<DealReview> {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to review a call.');
  }

  const { supabaseUrl, supabaseAnonKey } = getClientConfig();

  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/call-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        transcript,
        deal_context,
        seller_context: deal_context?.seller_context,
        idempotency_key: idempotencyKey,
      }),
    });
  } catch (err: any) {
    console.error('reviewCall transport error:', err);
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error('The review request timed out. Please try again.');
    }
    throw new Error("Couldn't reach Kairo's review service. Please check your internet connection and try again.");
  }

  let data: any = null;
  try {
    const text = await response.text();
    data = text ? JSON.parse(text) : null;
  } catch {
    // Response body is not valid JSON (e.g. gateway error HTML)
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(data?.error || 'Your session has expired. Please sign in again.');
    }
    if (response.status === 403) {
      throw new Error(data?.error || 'Your current subscription or permissions do not allow reviewing calls.');
    }
    if (response.status === 429) {
      throw new Error(data?.error || 'Review rate limit reached. Please wait before reviewing another call.');
    }
    if (response.status >= 500) {
      throw new Error(data?.error || 'Review service is temporarily unavailable. Please try again in a moment.');
    }
    throw new Error(data?.error || 'Call review failed. Please try again.');
  }

  if (!data || !data.review || typeof data.review !== 'object') {
    throw new Error('The review service returned an invalid response structure. Please try again.');
  }

  return data.review as DealReview;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.startsWith('audio/mp4')) return 'm4a';
  if (mimeType.startsWith('audio/aac')) return 'aac';
  if (mimeType.startsWith('audio/webm')) return 'webm';
  if (mimeType.startsWith('audio/wav') || mimeType.startsWith('audio/x-wav')) return 'wav';
  if (mimeType.startsWith('audio/ogg') || mimeType.startsWith('audio/opus')) return 'ogg';
  return 'm4a';
}

export interface SubmitRecordingResult {
  conversationId: string;
  dealId: string;
  meetingId?: string;
}

export interface SubmitRecordingOptions {
  waitForReview?: boolean;
}

export async function submitRecording(
  dealId: string,
  blob: Blob,
  mimeType: string,
  meetingId?: string | null,
  optionsOrClient: SubmitRecordingOptions | KairoClient = {},
  clientArg?: KairoClient
): Promise<SubmitRecordingResult> {
  const isClient = (obj: any): obj is KairoClient => Boolean(obj && typeof obj.from === 'function');
  const options: SubmitRecordingOptions = isClient(optionsOrClient) ? {} : optionsOrClient;
  const client: KairoClient = isClient(optionsOrClient)
    ? optionsOrClient
    : clientArg || getKairoClient();

  if (!blob || blob.size === 0) {
    throw new Error('Cannot submit empty audio recording. The recording must contain captured audio data.');
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    throw new Error('You must be signed in to submit a recording.');
  }
  const userId = session.user.id;

  const { data: newConv, error: convError } = await client
    .from('conversations')
    .insert({
      user_id: userId,
      deal_id: dealId,
      meeting_id: meetingId || null,
      input_type: 'audio',
      status: 'pending',
    })
    .select()
    .single();

  if (convError || !newConv) {
    throw new Error('Failed to create the call record. Please try again.');
  }

  const ext = extensionForMimeType(mimeType);
  const storagePath = `${userId}/${dealId}/${newConv.id}.${ext}`;

  const { error: uploadError } = await client.storage
    .from('recordings')
    .upload(storagePath, blob, { contentType: mimeType, upsert: false });

  if (uploadError) {
    await client.from('conversations').delete().eq('id', newConv.id);
    throw new Error('Failed to upload the recording. Check your connection and try again.');
  }

  const { error: updateError } = await client
    .from('conversations')
    .update({ audio_url: storagePath })
    .eq('id', newConv.id);

  if (updateError) {
    await client.storage.from('recordings').remove([storagePath]);
    await client.from('conversations').delete().eq('id', newConv.id);
    throw new Error('Failed to save the recording. Please try again.');
  }

  if (meetingId) {
    await client
      .from('meetings')
      .update({
        audio_storage_path: storagePath,
        conversation_id: newConv.id,
        capture_status: 'uploading',
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId);
  }

  const { supabaseUrl } = getClientConfig();

  if (options.waitForReview) {
    let response: Response;
    try {
      response = await fetch(
        `${supabaseUrl}/functions/v1/mobile-recording-review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({ conversation_id: newConv.id }),
        }
      );
    } catch (err: any) {
      console.error('submitRecording transport error:', err);
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new Error('Recording processing timed out. Please check your inbox in a moment.');
      }
      throw new Error("Couldn't reach Kairo's recording review service. Please check your connection.");
    }

    let data: any = null;
    try {
      const text = await response.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      throw new Error(describeRecordingError(data?.error));
    }
  } else {
    // Non-blocking fire-and-forget: The audio is safely stored in Storage and
    // marked 'pending'. Trigger the background review orchestrator without
    // holding the client on a blocking loading screen.
    fetch(`${supabaseUrl}/functions/v1/mobile-recording-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ conversation_id: newConv.id }),
    }).catch((err: any) => {
      console.warn('submitRecording background review dispatch warning:', err);
    });
  }

  return { conversationId: newConv.id, dealId, meetingId: meetingId || undefined };
}

export interface SubmitTranscriptOptions {
  waitForReview?: boolean;
}

export interface SubmitTranscriptResult {
  conversationId: string;
  dealId: string;
  meetingId?: string;
}

/**
 * Persists a text transcript immediately (Write-Ahead Persistence) and triggers
 * the background review orchestrator asynchronously.
 */
export async function submitTranscript(
  dealId: string,
  transcript: string,
  meetingId?: string | null,
  optionsOrClient: SubmitTranscriptOptions | KairoClient = {},
  clientArg?: KairoClient
): Promise<SubmitTranscriptResult> {
  const isClient = (obj: any): obj is KairoClient => Boolean(obj && typeof obj.from === 'function');
  const options: SubmitTranscriptOptions = isClient(optionsOrClient) ? {} : optionsOrClient;
  const client: KairoClient = isClient(optionsOrClient)
    ? optionsOrClient
    : clientArg || getKairoClient();

  const trimmed = typeof transcript === 'string' ? transcript.trim() : '';
  if (!trimmed || trimmed.length < 100) {
    throw new Error('Transcript is too short. Please provide a more complete conversation.');
  }

  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    throw new Error('You must be signed in to submit a transcript.');
  }
  const userId = session.user.id;

  // 1. Write-Ahead Persistence (WAL): Immediately persist to DB so user input
  // is never lost on network disconnects or downstream errors.
  const { data: newConv, error: convError } = await client
    .from('conversations')
    .insert({
      user_id: userId,
      deal_id: dealId,
      meeting_id: meetingId || null,
      input_type: 'transcript',
      transcript: trimmed,
      status: 'pending',
    })
    .select()
    .single();

  if (convError || !newConv) {
    throw new Error('Failed to create the call record. Please try again.');
  }

  if (meetingId) {
    await client
      .from('meetings')
      .update({
        conversation_id: newConv.id,
        matched_conversation_id: newConv.id,
        capture_status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', meetingId)
      .catch(() => {});
  }

  const { supabaseUrl } = getClientConfig();

  if (options.waitForReview) {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/mobile-recording-review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          signal: AbortSignal.timeout(90000),
          body: JSON.stringify({ conversation_id: newConv.id }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(describeRecordingError(data?.error));
      }
    } catch (err: any) {
      console.warn('submitTranscript synchronous wait failed; proceeding asynchronously:', err);
    }
  } else {
    // Non-blocking fire-and-forget: The transcript is safely committed to DB.
    // Trigger the background review orchestrator without blocking UI thread.
    fetch(`${supabaseUrl}/functions/v1/mobile-recording-review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ conversation_id: newConv.id }),
    }).catch((err: any) => {
      console.warn('submitTranscript background review dispatch warning:', err);
    });
  }

  return { conversationId: newConv.id, dealId, meetingId: meetingId || undefined };
}

export function describeRecordingError(rawError: string | undefined): string {
  if (!rawError) return 'Something went wrong while processing your recording. Please try again.';

  if (rawError.includes('MAX_TOKENS_TRUNCATED')) {
    return 'That recording was too long to process in one pass. Try a shorter call, or paste the transcript instead.';
  }
  if (rawError.includes('too short')) {
    return "We couldn't get enough from that recording to review it. Make sure the call was actually captured, then try again.";
  }
  if (rawError.includes('Failed to download recording')) {
    return "We couldn't retrieve your recording. Please try recording again.";
  }
  if (rawError.includes('Gemini')) {
    return "Kairo couldn't process that recording right now. Please try again in a moment.";
  }
  return rawError;
}

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

  const response = await fetch(`${supabaseUrl}/functions/v1/call-review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      transcript,
      deal_context,
      seller_context: deal_context?.seller_context,
      idempotency_key: idempotencyKey,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Call review failed. Please try again.');
  }

  return data.review as DealReview;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.startsWith('audio/mp4')) return 'm4a';
  if (mimeType.startsWith('audio/aac')) return 'aac';
  if (mimeType.startsWith('audio/webm')) return 'webm';
  return 'm4a';
}

export interface SubmitRecordingResult {
  conversationId: string;
  dealId: string;
}

export async function submitRecording(
  dealId: string,
  blob: Blob,
  mimeType: string,
  client: KairoClient = getKairoClient()
): Promise<SubmitRecordingResult> {
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

  const { supabaseUrl } = getClientConfig();

  const response = await fetch(
    `${supabaseUrl}/functions/v1/mobile-recording-review`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ conversation_id: newConv.id }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(describeRecordingError(data.error));
  }

  return { conversationId: newConv.id, dealId };
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

import { supabase } from './supabase';
import { AnalysisJSON } from '../types';

export async function analyzeConversation(transcript: string): Promise<AnalysisJSON> {
  // Get the current user's session token
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('You must be signed in to analyze conversations.');
  }

  const response = await fetch(
    `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/analyze-conversation`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ transcript }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Analysis failed. Please try again.');
  }

  return data.analysis as AnalysisJSON;
}
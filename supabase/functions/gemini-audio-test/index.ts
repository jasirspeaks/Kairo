// THROWAWAY TEST FUNCTION - not for production
// Deploy: supabase functions deploy gemini-audio-test --project-ref kknnuerbxydfdkuspbkg --no-verify-jwt
// Call: curl -X POST https://kknnuerbxydfdkuspbkg.supabase.co/functions/v1/gemini-audio-test \
//         -H "Content-Type: application/json" -d '{}'

Deno.serve(async (req) => {
    try {
      const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY not set" }), { status: 500 });
      }
  
      // Fetch the test file from Supabase Storage (upload it there first, see instructions)
      const AUDIO_URL = Deno.env.get("TEST_AUDIO_URL"); // signed URL or public URL to the m4a
      if (!AUDIO_URL) {
        return new Response(JSON.stringify({ error: "TEST_AUDIO_URL not set" }), { status: 500 });
      }
  
      const audioResp = await fetch(AUDIO_URL);
      const audioBuffer = await audioResp.arrayBuffer();
      const audioBytes = new Uint8Array(audioBuffer);
  
      // base64 encode
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < audioBytes.length; i += chunkSize) {
        binary += String.fromCharCode(...audioBytes.subarray(i, i + chunkSize));
      }
      const audioB64 = btoa(binary);
  
      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Transcribe this audio verbatim. Include speaker labels if distinguishable." },
                { inline_data: { mime_type: "audio/mp4", data: audioB64 } }
              ]
            }]
          })
        }
      );
  
      const result = await geminiResp.json();
  
      return new Response(JSON.stringify({
        status: geminiResp.status,
        file_size_mb: (audioBytes.length / 1024 / 1024).toFixed(2),
        gemini_response: result
      }, null, 2), { headers: { "Content-Type": "application/json" } });
  
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
    }
  });
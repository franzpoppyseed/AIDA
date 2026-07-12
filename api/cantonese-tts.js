// Optional Vercel serverless function for deterministic Cantonese speech.
// Required environment variables:
//   AZURE_SPEECH_KEY
//   AZURE_SPEECH_REGION   (for example: eastus)
// Optional:
//   AZURE_CANTONESE_VOICE (defaults to yue-CN-XiaoMinNeural)

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "POST only" });
    return;
  }

  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  const voice = process.env.AZURE_CANTONESE_VOICE || "yue-CN-XiaoMinNeural";
  if (!key || !region) {
    res.status(503).json({ error: "Hosted Cantonese TTS is not configured." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const text = String(body?.text || "").trim();
  if (!text) {
    res.status(400).json({ error: "Missing text." });
    return;
  }
  if ([...text].length > 1200) {
    res.status(413).json({ error: "Text is too long for one speech request." });
    return;
  }

  const ssml = `<?xml version="1.0" encoding="UTF-8"?>\n<speak version="1.0" xml:lang="yue-CN"><voice name="${escapeXml(voice)}"><prosody rate="-8%">${escapeXml(text)}</prosody></voice></speak>`;
  const endpoint = `https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`;

  try {
    const speech = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "AIDA-Language-Learning"
      },
      body: ssml
    });
    if (!speech.ok) {
      const details = await speech.text().catch(() => "");
      console.error("Azure Speech error", speech.status, details.slice(0, 500));
      res.status(502).json({ error: "Speech provider request failed." });
      return;
    }
    const audio = Buffer.from(await speech.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.status(200).send(audio);
  } catch (error) {
    console.error("Cantonese TTS proxy error", error);
    res.status(500).json({ error: "Unable to synthesize speech." });
  }
};

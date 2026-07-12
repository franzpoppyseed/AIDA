# Japanese and Cantonese audio setup

AIDA now supports two speech paths:

1. browser-native Web Speech, which requires no API key
2. an optional same-origin hosted Cantonese TTS endpoint for deterministic playback

## Why Cantonese may still fail in a browser even when Microsoft lists the voice

A webpage can directly select only voices that the browser exposes through `speechSynthesis.getVoices()`. A Microsoft online voice can exist in a Microsoft product or speech catalog without appearing in that JavaScript voice list.

That is why an entry such as:

```text
Microsoft 晓敏 Online (Natural) - Chinese (Cantonese, Simplified) · yue-CN
```

may work in one Microsoft speech surface but still be absent from Chrome or Edge Web Speech on a particular machine.

## Browser-native setup

AIDA recognizes and prioritizes:

1. `yue-CN`
2. `yue-HK`
3. other `yue-*` locales
4. `zh-HK`

Recognized Cantonese-oriented names include:

- Microsoft XiaoMin / 晓敏 / 曉敏
- Microsoft YunSong / 云松 / 雲松
- HiuMaan
- HiuGaai
- WanLung
- voice names containing Cantonese / Hong Kong / 廣東 / 粵語 / 粤语

To test:

1. Open **Profile**.
2. Go to **Audio setup**.
3. Press **Refresh voices**.
4. Open the **Cantonese voice** dropdown.
5. Select an exact `yue-CN`, `yue-HK`, or `zh-HK` voice when one appears.
6. Press **Test Cantonese**.

If a voice was installed or enabled recently, fully close all browser windows before reopening the site and refreshing the voice list.

When no Cantonese voice is enumerated, AIDA still tries a `lang=yue-CN` browser-locale request. This is only a best-effort fallback because the browser ultimately chooses the engine.

# Guaranteed Cantonese audio with the included serverless endpoint

The project now includes:

```text
api/cantonese-tts.js
vercel.json
```

The frontend automatically calls:

```text
/api/cantonese-tts
```

when no genuine Cantonese browser voice is available. The endpoint synthesizes Cantonese speech with Azure Speech and returns MP3 audio. The default hosted voice is:

```text
yue-CN-XiaoMinNeural
```

## Vercel deployment

1. Push this complete project to GitHub.
2. Import that GitHub repository into Vercel.
3. Create an Azure Speech resource and copy its key and region.
4. In the Vercel project, add these environment variables:

```text
AZURE_SPEECH_KEY=<your key>
AZURE_SPEECH_REGION=<your Azure region, for example eastus>
```

Optional:

```text
AZURE_CANTONESE_VOICE=yue-CN-XiaoMinNeural
```

5. Redeploy the Vercel project.
6. Open **Profile → Audio setup → Test Cantonese**.

No Azure key is stored in `app.js`, HTML, or any other public browser file.

## What happens at runtime

For Cantonese, AIDA now tries in this order:

1. a manually selected genuine Cantonese browser voice
2. the best automatically detected `yue-CN` / `yue-HK` / `zh-HK` browser voice
3. the configured `/api/cantonese-tts` hosted endpoint when no browser Cantonese voice is available
4. a browser `yue-CN` locale-only fallback

If an explicitly selected browser voice errors during playback, AIDA also gives the hosted endpoint a fallback attempt.

## GitHub Pages limitation

GitHub Pages serves static files only. It cannot execute `api/cantonese-tts.js`, so a GitHub Pages deployment uses only browser-native speech.

For the included hosted fallback, deploy the same repository to a platform that runs serverless functions, such as Vercel.

## Security

Do not place `AZURE_SPEECH_KEY` directly in `app.js` or commit it to GitHub. Keep it in deployment environment variables.

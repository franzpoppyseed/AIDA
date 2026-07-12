# Japanese and Cantonese audio setup

AIDA supports three speech routes:

1. browser-native Web Speech
2. optional same-origin hosted Japanese neural TTS
3. optional same-origin hosted Cantonese neural TTS

The hosted routes keep speech credentials off the browser and can be deployed with the included Vercel serverless functions.

---

# Japanese pronunciation and compound handling

## What changed in V12

Older builds used the vocabulary `reading` field as the speech input for Japanese words. That is convenient for displaying kana, but it can remove lexical information that a TTS front end uses to analyze a written compound.

V12 now follows these rules:

- vocabulary audio sends the actual written expression first
- sentence audio sends the complete Japanese sentence
- passage audio is split only at sentence boundaries when it becomes too long for one request
- AIDA does not synthesize a sentence by speaking dictionary tokens one by one
- kana readings remain available for the learner, but are not substituted for the full written sentence before TTS

Example:

```text
DISPLAY READING
とうきょうとない

SPEECH INPUT
東京都内
```

For a sentence:

```text
東京都内の新しい地下鉄路線について、国際交流センターで説明を聞きました。
```

AIDA sends the complete sentence rather than concatenating isolated readings.

This gives the speech engine the best chance to analyze compound boundaries and phrase-level prosody. It does **not** make every browser voice linguistically authoritative; browser speech quality still depends on the voice installed or exposed on that device.

## Hosted Japanese neural speech

The project includes:

```text
api/japanese-tts.js
```

The endpoint uses the same Azure Speech resource as the Cantonese endpoint. The default Japanese voice is:

```text
ja-JP-NanamiNeural
```

Optional override:

```text
AZURE_JAPANESE_VOICE=ja-JP-NanamiNeural
```

In **Profile → Audio setup**, keep:

```text
Prefer hosted Japanese neural speech when configured
```

checked to try the hosted Japanese route before a browser voice.

When the endpoint is unavailable, AIDA falls back to the selected Japanese browser voice.

---

# Cantonese browser voices

A webpage can directly select only voices that the browser exposes through `speechSynthesis.getVoices()`.

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
4. Choose a Cantonese browser voice when one appears.
5. Press **Test Cantonese**.

If a voice was installed or enabled recently, fully close all browser windows before reopening the site and refreshing the list.

---

# Hosted neural audio with Vercel + Azure Speech

The project includes:

```text
api/japanese-tts.js
api/cantonese-tts.js
vercel.json
```

## Required environment variables

```text
AZURE_SPEECH_KEY=<your key>
AZURE_SPEECH_REGION=<your Azure region, for example eastus>
```

Optional voice overrides:

```text
AZURE_JAPANESE_VOICE=ja-JP-NanamiNeural
AZURE_CANTONESE_VOICE=yue-CN-XiaoMinNeural
```

## Deployment

1. Push the complete repository to GitHub.
2. Import the repository into Vercel.
3. Create an Azure Speech resource.
4. Add the environment variables above in the Vercel project.
5. Redeploy.
6. Open **Profile → Audio setup** and test both languages.

No Azure key belongs in `app.js`, HTML, or any public repository file.

---

# Runtime order

## Japanese

By default:

1. hosted `/api/japanese-tts` neural speech, when configured
2. selected or automatically detected Japanese browser voice
3. hosted Japanese route as a final fallback if a browser voice errors

The learner can disable neural-first behavior in Profile.

## Cantonese

AIDA tries:

1. a selected genuine Cantonese browser voice
2. the best automatically detected Cantonese/Hong Kong browser voice
3. hosted `/api/cantonese-tts` when no usable browser Cantonese voice is exposed
4. a browser `yue-CN` locale-only fallback

If a selected browser voice fails, AIDA also gives the hosted endpoint a fallback attempt.

---

# GitHub Pages limitation

GitHub Pages serves static files only. It cannot execute:

```text
api/japanese-tts.js
api/cantonese-tts.js
```

On GitHub Pages, AIDA uses browser-native speech only.

For the included hosted speech routes, deploy the repository to a platform that runs serverless functions, such as Vercel.

---

# Listening highlight synchronization

AIDA can replay revealed sentence and passage text with synchronized highlighting.

- Browser speech uses boundary events when the browser exposes them.
- Otherwise AIDA uses a token-weighted timing approximation.
- Hosted MP3 playback currently maps highlighting to playback progress.

Exact production-grade word timing would require the backend to return word-boundary metadata with the synthesized audio. The current interface deliberately distinguishes this approximation from exact alignment.

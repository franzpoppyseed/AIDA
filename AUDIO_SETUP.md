# Audio setup

AIDA can use browser-native speech with no API key, but the browser can only expose voices that the operating system/browser actually provides.

## What the app now does

For Cantonese, AIDA searches for voices in this order:

1. `yue-HK`
2. another `yue` locale
3. `zh-HK`
4. a voice name that clearly identifies Cantonese or Hong Kong

It does **not** silently fall back to a Mandarin voice.

Open **Profile → Audio setup** to see the exact Japanese and Cantonese voices detected by the current browser. Use **Refresh voices** after installing a new system voice, then restart the browser if the new voice still does not appear.

## Windows: local/no-API route

1. Open **Settings → Time & language → Language & region**.
2. Add **Chinese (Traditional, Hong Kong SAR)** when available.
3. Open that language's options and install available speech/text-to-speech voice features.
4. Completely restart Edge/Chrome.
5. Return to AIDA → **Profile → Audio setup → Refresh voices**.
6. Press **Test Cantonese**.

Browser-native availability varies by Windows version, browser, and installed language components.

## Guaranteed cross-device Cantonese audio

A static GitHub Pages site cannot guarantee that every visitor has a Cantonese system voice. For consistent audio across devices, use one of these approaches:

### Hosted TTS endpoint

Send the target text to a serverless/backend text-to-speech endpoint and return an audio stream. Keep the provider key on the server, never in `app.js`.

A hosted Cantonese voice should use a Hong Kong Cantonese locale such as `zh-HK`.

### Pre-generated audio

Generate MP3/OGG files ahead of time, store them under an audio directory or object storage, and map each stable vocabulary/grammar/comprehension ID to its audio file. This has no runtime API cost but requires generating and storing the audio corpus.

## Why an API key should not go in this repository

Any key placed directly in browser JavaScript can be read by visitors. A hosted TTS provider should therefore be called through a serverless function or other backend that keeps the secret outside the repository and browser bundle.

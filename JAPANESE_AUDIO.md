# Japanese audio and prosody handling

## The problem V12 addresses

A Japanese TTS engine needs the lexical form and surrounding sentence context to make its own pronunciation and prosody decisions. Feeding a kana-only reading for a written compound can remove information that the engine would otherwise use.

V12 therefore separates **display reading** from **speech input**.

### Vocabulary

```text
Displayed word:  東京都内
Displayed reading: とうきょうとない
Speech input: 東京都内
```

### Sentences and passages

AIDA sends the complete orthographic sentence. It does not synthesize a passage by concatenating individually pronounced dictionary tokens.

Long passages are split only at natural sentence-ending punctuation before synthesis.

## Speech routes

### Preferred hosted route

```text
api/japanese-tts.js
```

When deployed with Azure Speech credentials, AIDA prefers the Japanese neural endpoint by default.

Default voice:

```text
ja-JP-NanamiNeural
```

The same Azure resource can serve the Cantonese endpoint.

### Browser fallback

When the hosted route is unavailable, AIDA uses the selected `ja-*` browser voice.

Browser voices differ across operating systems and browsers, so browser-native pitch accent and phrasing cannot be guaranteed by the webpage itself.

## What this does and does not guarantee

V12 fixes the app-side errors that can damage pronunciation context:

- no kana flattening before Japanese vocabulary speech
- no word-by-word concatenated sentence synthesis
- full written compounds are preserved
- sentence context is preserved
- hosted Japanese neural speech can be used consistently across devices

The final acoustic pitch contour is still produced by the selected TTS model. AIDA does not claim that an arbitrary browser voice is a pitch-accent dictionary.

Use the existing **Report issue → audio mismatch** workflow when a specific word or sentence still sounds wrong. That report remains in the local profile and can be exported.

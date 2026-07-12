# AIDA / 間 — Functional V8 Context Review

A local-first Japanese and Cantonese learning application. Japanese and Cantonese share one website, but remain completely separate learning tracks with separate targets, XP, daily goals, activity, and review history.

## Exhaustive sentence and passage coverage

The learner-facing source library contains **34,872 vocabulary and grammar items**:

- 7,973 Japanese vocabulary items
- 963 Japanese grammar items
- 25,869 learner-facing Cantonese vocabulary items
- 67 Cantonese grammar items

Every one of those source items has runtime access to:

- **3 sentence variations** ordered **EASIER → BUILD → HARDER**
- **3 mini-passage variations** that become progressively denser
- sentence-comprehension practice
- typed passage-comprehension assessment

That is **104,616 sentence variations** and **104,616 item-linked mini-passage variations** available from the source library. The app materializes the context when needed instead of copying 209,232 near-duplicate cards into the repository.

Repeated encounters advance through the three context variants using the source item's SRS exposure count. The target level remains a ceiling, while sessions themselves move from easier bands to harder bands:

```text
Japanese:  N5 → N4 → N3 → N2 → N1
Cantonese: Beginner → Intermediate → Advanced
```

So an N3 target still progresses N5 → N4 → N3; it does not randomly throw N3 and N5 material together.

## Imported and original context

`data/context_examples.js` contains selected real context where available:

- Japanese: selected Japanese–English sentence pairs from the Tatoeba/Tanaka-WWWJDIC export
- Cantonese: selected conversational utterances from HKCanCor via PyCantonese

Coverage before deterministic fallback:

- 6,991 / 7,973 Japanese vocabulary items have imported context
- 742 / 963 Japanese grammar items have imported corpus context
- all 963 Japanese grammar items have at least three non-meta usage contexts after 221 uncovered grammar points received original AIDA-written examples
- 24,927 / 25,869 active Cantonese vocabulary items have bundled examples
- 4,224 / 25,869 have HKCanCor context
- 25,130 / 25,869 have bundled examples, HKCanCor context, or both

Fallback material is explicitly identified as AIDA-generated/original context. It is not presented as corpus-authentic text.

## Cantonese cleanup and Jyutping

The raw Cantonese export contained **18,566 rows that could not function as reliable study cards**: blank definitions, explicit deletion/edit artifacts, or unrecoverable pronunciation data. Those rows remain available for audit in:

```text
exports/cantonese_vocabulary_excluded.csv
```

All **25,869 active Cantonese vocabulary items** now have a learner-visible pronunciation/Jyutping field, and all bundled Cantonese examples shown by the app have usable pronunciation data.

For Cantonese study and review:

- the prompt remains clean before reveal
- Jyutping appears only after reveal
- context variations reveal their Jyutping
- passage Jyutping appears after completing the assessment

## Usage Lab parser

The Usage Lab no longer uses greedy left-to-right matching. It now combines:

- Japanese romaji → kana interpretation
- global dynamic-programming segmentation
- a strongly super-additive whole-word score to prevent known words from being broken into attractive one-character matches
- dictionary-form and common conjugation matching
- candidate ranking by frequency/level, particles, word type, imported context overlap, and nearby semantic domains
- a second contextual reranking pass for ambiguous homophones
- conservative grammar matching with token-boundary checks so particles inside ordinary words do not trigger false grammar matches
- alternative-sense display when the parser is not certain

Examples now handled correctly:

```text
ashita tomodachi to eki de au
→ あしたともだちとえきであう
→ あした / ともだち / と / えき / で / あう
```

```text
はしでごはんをたべる
→ 箸 / で / 御飯 / を / 食べる
```

```text
かわにかかるはしをわたる
→ 川 / に / かかる / 橋 / を / 渡る
```

For Cantonese, question-final context can also stop a longer statement-only lexical chunk from swallowing a genuine final particle, so context such as `點解你冇嚟嘅？` keeps the relevant final `嘅` sense visible.

This remains an offline heuristic parser rather than a full neural morphological/dependency model, but it now uses the surrounding sentence rather than only the first dictionary match.

## Cantonese audio: browser voice + hosted fallback

AIDA now has two Cantonese speech paths.

### 1. Browser-native, no key

It recognizes and prioritizes:

1. `yue-CN`
2. `yue-HK`
3. other `yue-*` voices
4. `zh-HK`

It explicitly recognizes names such as Microsoft XiaoMin / 晓敏 and YunSong / 云松. Profile → Audio setup includes manual Japanese and Cantonese selectors.

### 2. Deterministic hosted fallback

The project now includes:

```text
api/cantonese-tts.js
vercel.json
```

When the browser exposes no genuine Cantonese voice, AIDA automatically tries `/api/cantonese-tts`. The included serverless function uses Azure Speech with `yue-CN-XiaoMinNeural` by default and keeps the API key off the public frontend.

Set these deployment environment variables:

```text
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
AZURE_CANTONESE_VOICE   # optional; defaults to yue-CN-XiaoMinNeural
```

See `AUDIO_SETUP.md` for deployment steps. On plain GitHub Pages the serverless endpoint does not run, so the site falls back to browser speech only.

## Existing behavior retained

- Separate Japanese and Cantonese targets, XP, daily goals, and progress
- Cumulative target scopes
- Answer and rating controls hidden until reveal
- Typed passage-comprehension assessment
- Full review queue with drag-and-drop ordering
- Searchable, filterable, sortable Source Library
- Clear progress with typed `CLEAR` confirmation
- Local JSON progress export/import

## Persistence

Progress is stored in browser `localStorage` under:

```text
aida.functional.v3.state
```

## Run locally

From inside this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

The local static server supports all learning features and browser-native speech. The hosted Cantonese TTS route requires a serverless deployment such as Vercel.

## Project structure

```text
AIDA_FUNCTIONAL_V3/
├── index.html
├── styles.css
├── app.js
├── vercel.json
├── api/
│   └── cantonese-tts.js
├── AUDIO_SETUP.md
├── CONTEXT_COVERAGE.md
├── THIRD_PARTY_CONTEXT_LICENSES.md
├── assets/
├── data/
│   ├── japanese_grammar.js
│   ├── japanese_vocabulary.js
│   ├── cantonese_grammar.js
│   ├── cantonese_vocabulary.js
│   ├── comprehension.js
│   ├── reading_passages.js
│   ├── context_examples.js
│   ├── manifest.json
│   └── SOURCES.md
├── exports/
├── FUNCTIONALITY.md
└── README.md
```

## V8 context review

The **Contexts** workspace lets you search any Japanese or Cantonese vocabulary or grammar item and review three progressively harder sentence variations plus three passage variations built around that item. Passage cards use comprehension prompts about events, details, development, and summary rather than isolated “what does this word mean?” questions. Cantonese contexts display Jyutping directly above Han characters with ruby annotations.

# AIDA / 間 — Functional V5 Learning-First Revision

A local-first Japanese and Cantonese learning application. The two languages share one interface but remain completely separate learning tracks.

## What changed in V5

### Study cards now teach the language, not taxonomy

Abstract chapter labels that contain no actual Japanese or Cantonese surface form were removed from the learner-facing grammar datasets and CSV exports. For example, a card such as `NEGATIVE / POSITIVE IMPERATIVE` no longer exists as a study or library item.

The study flow is now reveal-first:

1. The front shows only the target-language prompt, a recall/comprehension prompt, and pronunciation.
2. Click the card or press Enter/Space to reveal the reading, meaning, explanation, and metadata.
3. Only after revealing the answer do Again / Hard / Good / Easy appear.

### Sentence and passage comprehension

Study sessions now support:

- Mixed learning
- Grammar only
- Vocabulary only
- Sentence comprehension
- Passage comprehension

Comprehension material is target-aware. A Japanese N3 target admits N5, N4, and N3 comprehension; a Cantonese Intermediate target admits Beginner and Intermediate comprehension.

### Usage Lab text analysis

Usage Lab now accepts a sentence or a multi-sentence passage and analyzes it sentence by sentence.

It provides:

- longest-match word separation against the bundled vocabulary
- readings and meanings for recognized words
- visibly marked unknown chunks
- matching grammar patterns from the local grammar data
- basic structure hints for common Japanese particles/endings and Cantonese particles/aspect/connector patterns
- simple register hints
- known-word coverage

This is a local heuristic parser, not a full morphological or syntactic parser, but it is substantially more useful than a simple exact-string lookup.

### Audio

The browser audio layer now:

- waits for the browser voice inventory to load before choosing a voice
- uses the stored kana reading for Japanese vocabulary
- prefers `yue-HK`, other `yue` voices, and then Hong Kong `zh-HK` voices for Cantonese
- refuses to silently substitute a Mandarin voice for Cantonese
- includes a Profile → Audio setup panel with detected voice diagnostics and test buttons

See `AUDIO_SETUP.md` for local-device setup and the path to guaranteed hosted Cantonese TTS.

### Motion and interaction

The black-and-white UI remains minimalist, with restrained motion added for:

- page and panel entrance
- modal reveal
- study-card answer reveal
- progress rails
- hover lift and sheen
- nav underline motion
- rating-button sweeps
- Usage Lab analysis sections

`prefers-reduced-motion` is respected.

## Separate language tracks

Japanese and Cantonese each have their own:

- target level
- XP total
- daily goal
- activity history
- study sessions
- answer history
- SRS/mastery records

There is no parallel Japanese/Cantonese lesson generator.

### Japanese target scope

- N5 → N5
- N4 → N5 + N4
- N3 → N5 + N4 + N3
- N2 → N5 through N2
- N1 → N5 through N1

### Cantonese target scope

Grammar and comprehension:

- Beginner → Beginner
- Intermediate → Beginner + Intermediate
- Advanced → all levels

The bundled Cantonese vocabulary data has no native proficiency level, so AIDA uses frequency bands:

- Beginner → ranks 1–3,000
- Intermediate → ranks 1–12,000
- Advanced → full vocabulary pool

## Review

Review contains every item you have studied, not only failed or currently due items.

- due items are prioritized by default
- filter by All / Japanese / Cantonese
- drag and drop the visible queue to reorder the current review session
- click a queue item to move it to the front

## Source Library

Separate datasets remain available for:

- Japanese grammar
- Japanese vocabulary
- Cantonese grammar
- Cantonese vocabulary

The library supports full-text search, level filters, category/collection/frequency filters, sorting, random lookup, and pronunciation.

## Profile and persistence

This build is local-first and uses browser `localStorage` rather than a real account backend.

Profile settings include:

- name
- Japanese target
- Cantonese target
- any positive-integer Japanese daily goal
- any positive-integer Cantonese daily goal

Progress can be exported and imported as JSON.

A real secure username/password login with cross-device retrieval requires hosted authentication and storage. A fake local password system was intentionally not added.

## Run locally

From inside this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Project structure

```text
AIDA_FUNCTIONAL_V3/
├── index.html
├── styles.css
├── app.js
├── AUDIO_SETUP.md
├── assets/
├── data/
│   ├── japanese_grammar.js
│   ├── japanese_vocabulary.js
│   ├── cantonese_grammar.js
│   ├── cantonese_vocabulary.js
│   ├── comprehension.js
│   ├── manifest.json
│   └── SOURCES.md
├── exports/
├── FUNCTIONALITY.md
└── README.md
```

The ZIP includes the complete project, including unchanged assets and source notes.

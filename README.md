# AIDA / 間 — Functional V9 Learning Engine

A local-first Japanese and Cantonese learning application. Both languages live on one website, but remain independent tracks with separate targets, XP, daily goals, activity, mastery, and review schedules.

## What V9 adds

### 1. Coherent context progression

Every active vocabulary and grammar source item can generate three linked sentence contexts and three coherent mini-passage variants:

```text
EASIER → BUILD → HARDER
```

The passage engine no longer creates a “passage” by simply stacking unrelated example sentences. It selects a real/bundled target example where available, assigns a semantic domain, and places the target example inside a scenario with a setup, development, and consequence. Harder variants add reconsideration, evidence, and inference.

Coverage:

- 7,973 Japanese vocabulary items
- 963 Japanese grammar items
- 25,869 active Cantonese vocabulary items
- 67 Cantonese grammar items
- **34,872 active vocabulary/grammar items total**
- **104,616 sentence variations**
- **104,616 coherent item-linked passage variations**

The three generated passage variants were exhaustively validated for uniqueness and question coverage across all 34,872 active source items.

### 2. Five independent memory skills

A source item no longer has one universal “mastery” state. A learner can recognize a word while still being unable to produce it or understand it in speech.

AIDA tracks these independently:

- Recognition
- Production
- Listening
- Reading comprehension
- Grammar usage/understanding

The Progress dashboard shows a separate mastery and due-review state for each skill in each language.

### 3. FSRS-based scheduling

AIDA now vendors `ts-fsrs` and keeps a separate FSRS memory card for each active item × skill combination. The learner can set desired retention from 80% to 97% in Profile settings. Rating buttons show the predicted next interval before the learner chooses.

Existing V4/V5 item-level progress is migrated into the most sensible initial skill bucket instead of being discarded.

See `LEARNING_ENGINE.md` and `vendor/TS-FSRS-LICENSE.txt`.

### 4. Contextual listening

Listening is now a first-class practice mode rather than only a pronunciation button.

- Sentence listening begins with the transcript hidden.
- Passage listening begins with the entire transcript hidden.
- The learner can type the meaning, the words heard, or both before reveal; the local match score is advisory.
- Revealed text can replay with synchronized word/character highlighting.
- Cantonese reveal uses Jyutping ruby text over Chinese characters.
- Context Browser sentence and passage examples can also be played with synchronized highlighting.

Browser speech boundary events are used when exposed. A timed synchronization fallback is used otherwise. For deterministic Cantonese TTS, the included serverless Azure Speech endpoint remains available; see `AUDIO_SETUP.md`.

## Progressive difficulty

The selected target is an upper ceiling, never an exact-only filter.

```text
Japanese:  N5 → N4 → N3 → N2 → N1
Cantonese: Beginner → Intermediate → Advanced
```

Sessions are sampled from allowed levels and ordered from easier material toward harder material. Repeated encounters with the same source item also rotate through EASIER, BUILD, and HARDER context variants for the skill being practiced.

## Study modes

- Adaptive mixed practice
- Recognition
- Production
- Contextual listening
- Grammar understanding
- Vocabulary recognition
- Sentence comprehension
- Passage comprehension

Adaptive mixed practice deliberately includes all five memory skills instead of letting the largest vocabulary dataset crowd out listening, production, or reading.

## Comprehension testing

Passage questions test discourse rather than asking for isolated word definitions. Question types include:

- central detail
- sequence
- purpose
- change in viewpoint
- evidence
- inference
- context
- reasoning
- implication
- summary

The learner answers in free text, receives a local match estimate as a hint, compares against a reference answer, and makes the final correct/incorrect judgment.

## Context Browser

The Contexts tab lets the learner search any vocabulary or grammar item and review:

- 3 progressively harder sentence variations
- 3 progressively harder coherent passage variations
- meaningful comprehension prompts
- exact matches from the bundled reading bank where available
- synchronized sentence and passage audio

Cantonese Jyutping appears above Chinese characters with ruby annotation.

## Usage Lab

Usage Lab uses global dynamic-programming segmentation, conjugation handling, imported-context overlap, nearby grammatical evidence, semantic-domain reranking, and alternative-sense display. It remains an offline heuristic parser rather than a neural dependency parser, but it uses whole-sentence context instead of accepting the first dictionary match.

## Data and imported context

`data/context_examples.js` contains selected context where available:

- Japanese: selected Japanese–English pairs from the Tatoeba/Tanaka-WWWJDIC export
- Cantonese: selected conversational utterances from HKCanCor via PyCantonese

Generated/original fallback material is identified as AIDA content rather than corpus-authentic text. Third-party attribution is in `THIRD_PARTY_CONTEXT_LICENSES.md`.

## Cantonese audio

AIDA prioritizes genuine Cantonese/Hong Kong browser voices and supports a hosted same-origin fallback:

```text
api/cantonese-tts.js
```

For reliable cross-device Cantonese audio, deploy with the serverless endpoint and configure the environment variables documented in `AUDIO_SETUP.md`.

## Local progress

The site stores progress in the browser and supports:

- JSON export/import
- clear-progress confirmation
- separate Japanese/Cantonese XP
- independent skill-level FSRS histories
- preserved profile targets and daily goals when progress is cleared

No fake local username/password system is included because browser-only credentials would not provide real account security or cross-device account retrieval.

# Functional architecture — V5

## Files

- `data/japanese_grammar.js` — learner-facing Japanese grammar data
- `data/cantonese_grammar.js` — learner-facing Cantonese grammar data
- `data/japanese_vocabulary.js` — Japanese vocabulary data
- `data/cantonese_vocabulary.js` — Cantonese vocabulary data
- `data/comprehension.js` — target-leveled sentence and passage comprehension material
- `app.js` — state, target filtering, study/reveal flow, SRS, review queue, audio, Usage Lab, and Source Library logic
- `styles.css` — minimalist black-and-white interface plus motion/effects
- `index.html` — application shell and dialogs
- `AUDIO_SETUP.md` — Cantonese/Japanese browser voice setup and hosted-TTS guidance

## State

The browser state schema remains version 4 so existing V4 local progress remains compatible. The storage key also remains unchanged.

Version 3 local progress is migrated automatically:

- old shared XP is split between Japanese and Cantonese
- old combined activity is split between the tracks
- the previous Japanese target is retained
- Cantonese starts at Beginner
- older low daily goals are raised to the 30-item default during migration

## Learner-facing grammar cleanup

Grammar rows whose `pattern` contains no target-language script are excluded from the learner-facing data.

This removes abstract chapter headings and taxonomy labels that cannot be practiced as actual Japanese or Cantonese forms. The corresponding CSV exports and manifest counts are kept in sync.

Counts in this build:

- Japanese grammar: 963 items
- Cantonese grammar: 67 items

## Study targeting

### Japanese

`N5 < N4 < N3 < N2 < N1`

Targets are cumulative and never fall back to the full dataset. An N3 target admits only N5, N4, and N3 items.

### Cantonese grammar and comprehension

`Beginner < Intermediate < Advanced`

Targets are cumulative in the same way.

### Cantonese vocabulary

The source has no native proficiency-level field, so the application derives a transparent study level from `frequency_rank`:

- Beginner: 1–3,000
- Intermediate: 3,001–12,000
- Advanced: 12,001+

The target scope is cumulative.

## Study reveal flow

A study item has two phases.

### Before reveal

Visible:

- target-language prompt
- recall or comprehension question
- pronunciation control

Hidden:

- reading
- definition/translation
- explanation
- metadata details below the answer
- Again / Hard / Good / Easy

### After reveal

The answer area and rating controls appear with a reveal animation. Rating is impossible before reveal; an attempted rating call reveals the card instead.

## Comprehension

`data/comprehension.js` adds sentence and passage modes for both languages.

Each item stores:

- stable ID
- level
- target-language text
- reading/Jyutping
- translation
- comprehension question
- expected answer

Comprehension items use the same target filters, SRS storage, XP accounting, review queue, and audio path as grammar and vocabulary.

## Spaced repetition and review

Every learned item is stored independently under its stable `kind:id` key.

A rating updates:

- ease
- interval
- repetitions
- due time
- correct/incorrect history
- mastery
- last rating

The full review queue is built from all learned SRS entries, not only due or weak items.

Default ordering:

1. due cards
2. lower mastery
3. older last review

The visible queue is draggable. Reordering affects only the current review-session order.

## Usage Lab parser

Usage Lab is language-specific and local-first.

### Sentence splitting

Multi-sentence input is separated at Japanese/CJK sentence punctuation and line boundaries. Passage analysis is rendered sentence by sentence so pattern matches do not bleed across sentence boundaries.

### Word separation

A cached vocabulary trie performs longest-match segmentation against the bundled vocabulary pool.

Recognized tokens display reading and meaning metadata. Unmatched target-script chunks remain visible as unknown rather than being discarded.

### Grammar matching

Learner-facing target-script chunks are extracted from grammar patterns and matched against the sentence. Matches are ranked by the amount of concrete target-language structure they contain.

### Basic structure hints

The local heuristic layer detects common structure signals, including:

- Japanese topic/subject/object/location/direction/possessive particles
- Japanese reason, concessive, polite, and progressive markers
- Cantonese copula/location forms
- Cantonese negation and aspect markers
- Cantonese condition/result and contrast connectors
- common sentence-final particles

This is intentionally described as heuristic analysis rather than a full morphological parser.

## Audio

The static build uses the Web Speech API.

### Japanese

Vocabulary speech uses the stored kana reading when available. Sentence and passage comprehension speaks the exact target-language text.

### Cantonese

Voice ranking prefers:

1. `yue-HK`
2. other `yue` voices
3. `zh-HK`
4. known Hong Kong/Cantonese voice names

Mandarin-labelled voices are penalized and are not used as a silent fallback.

Voice loading waits for the asynchronous browser voice inventory. Profile → Audio setup shows what the current browser actually exposes and provides test buttons.

A static site cannot guarantee a Cantonese voice on every device. Guaranteed cross-device speech requires a hosted TTS service or pre-generated audio files. See `AUDIO_SETUP.md`.

## Source Library

Filtering and sorting are applied to the full dataset before the first 120 visible results are rendered.

Available filter concepts vary by dataset:

- grammar: proficiency level + grammar category
- Japanese vocabulary: JLPT level + collection grouping
- Cantonese vocabulary: derived proficiency level + frequency band

## Persistence

Progress is stored in browser `localStorage` under the existing storage key.

JSON export/import remains available for backup and manual transfer.

# AIDA V10 functionality map

## Independent language tracks

Japanese and Cantonese have separate:

- target ceilings
- XP
- daily goals
- activity history
- review filtering
- skill mastery
- FSRS schedules

## Six learning skills

Each relevant source item can have independent memory state for:

1. Recognition
2. Production
3. Listening
4. Reading comprehension
5. Grammar
6. Casual register

Strength in one skill does not automatically mark the others as mastered.

## Study modes

- Adaptive mixed practice
- Recognition
- Production
- Contextual listening
- Grammar understanding
- Vocabulary recognition
- Sentence comprehension
- Passage comprehension
- Casual & conversational language

Adaptive mixed sessions reserve space for multiple skill families rather than letting the vocabulary dataset dominate the session.

## Casual & conversational system

A dedicated top-level **Casual** entry opens conversational practice without mixing Japanese and Cantonese together.

Japanese includes:

- plain forms
- particle omission when meaning remains recoverable
- casual question formation
- spoken contractions such as `てる`, `って`, `じゃ`, `ちゃう`, `なきゃ`, `とく`
- register and relationship judgments

Cantonese includes:

- sentence-final particles
- recoverable subject/object omission
- aspectual spoken forms
- common colloquial question patterns
- spoken-vs-written lexical choices
- Jyutping on reveal

Practice cycles through transformation, noticing, and register judgment. Casual mastery has its own FSRS state.

## Grammar-context audit

Grammar examples are validated before display.

- Japanese grammar cards checked: **963**
- 150 high-risk Japanese cards: 3 manual audited examples each
- 8 broad class/inflection cards: dedicated concept validators
- remaining 805 Japanese cards: 3 source contexts each after stricter construction-signature audit
- Cantonese grammar cards: **67 / 67** with 3 manual audited examples each

The old `い-Adjectives` error is specifically regression-tested. Sentences that merely contain the character `い` do not qualify as い-adjective examples.

See `GRAMMAR_CONTEXT_AUDIT.md`.

## Coherent context engine

Every active vocabulary and grammar item can provide:

- 3 sentence variations
- 3 coherent passage variations

Passages use a semantic-domain scenario, a target-containing anchor context, and progressive discourse framing. Harder variants require more interpretation and inference rather than simply adding unrelated sentences.

## Production practice

The learner sees the meaning and must produce the Japanese or Cantonese sentence before reveal. Typing is optional; speaking aloud is valid. If text is entered, AIDA provides only a surface-form similarity hint. The model answer is then revealed for self-assessment.

## Contextual listening

Sentence mode:

- transcript hidden
- replay audio as needed
- optionally type the meaning, the words heard, or both
- reveal transcript and answer
- replay with synchronized highlighting

Passage mode:

- complete transcript hidden during the listening phase
- typed comprehension assessment
- transcript and translation revealed after completion
- synchronized replay after assessment

Cantonese uses ruby annotations so Jyutping sits above the Chinese characters after reveal.

## Passage comprehension

Generated questions are discourse-level:

- central detail
- sequence/purpose
- change in view
- evidence/inference
- context/reasoning
- implication/summary

The local text matcher is advisory only. The learner makes the final correctness decision after comparing with the reference answer.

## FSRS review scheduling

AIDA vendors `ts-fsrs` and schedules each practiced item × skill independently.

- desired retention: configurable 80%–97%
- default: 90%
- Again / Hard / Good / Easy map to FSRS ratings
- next interval preview appears directly on rating buttons
- older item-level state migrates into a sensible initial skill

## Review queue

- all encountered base items can be reviewed
- due items are prioritized
- the next-due skill determines the review form
- production reviews prompt production
- listening reviews hide the transcript
- reading reviews use sentence/passage context
- grammar, recognition, and casual register remain separate
- drag-and-drop queue reordering remains available

## Progress dashboard

For each language, the dashboard tracks independent mastery and due counts for:

- Recognition
- Production
- Listening
- Reading
- Grammar
- Casual register

It also retains aggregate base-item coverage and XP summaries.

## Context Browser

Search by term, reading, Jyutping, meaning, or grammar item. Review:

- 3 validated sentence variants
- 3 coherent passage variants
- meaningful comprehension questions
- exact reading-bank matches
- synchronized context audio

## Usage Lab

- romaji → kana interpretation
- global dynamic-programming word segmentation
- whole-word scoring
- conjugation matching
- context/corpus overlap
- grammatical-cue reranking
- semantic-domain reranking
- alternative-sense display
- token-boundary-aware grammar matching
- sentence-by-sentence passage analysis

## Audio

Browser route:

- Japanese browser voice selection
- Cantonese `yue-CN`, `yue-HK`, other `yue-*`, and `zh-HK` preference
- manual voice selectors
- long-form chunking
- synchronized highlighting when browser boundaries are exposed
- timing-based synchronization fallback

Hosted Cantonese route:

- `api/cantonese-tts.js`
- same-origin fallback
- Azure credentials remain server-side
- configurable Cantonese neural voice

## Progress controls

- browser-local persistence
- JSON export/import
- clear progress with typed `CLEAR` confirmation
- profile targets, goals, and retention setting preserved across clear-progress reset

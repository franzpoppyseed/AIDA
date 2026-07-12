# AIDA V14 functionality map

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

Grammar examples resolve through the V14 per-item registry before display.

- Japanese grammar registry keys: **963**
- Japanese grammar items with verified contexts: **437**
- verified Japanese grammar examples: **1,061**
- N5 Japanese grammar coverage: **129 / 129**
- Cantonese grammar items with manually audited contexts: **67 / 67**
- audited Cantonese grammar examples: **201**

Character overlap alone is not grammatical evidence. The old `い-Adjectives` failure is specifically prevented, and ambiguous higher-level Japanese grammar may show no sentence rather than a potentially wrong one.

See `GRAMMAR_CONTEXT_AUDIT.md`.

## Item-specific context engine

Learner-facing sentences are not generated from reusable generic templates.

A context must be tied to the exact item through an item-specific curated example, an audited grammar example, an exact translated corpus example, an exact bundled source example, or an exact match inside a curated reading-bank passage.

The interface does not force a fixed number of examples. If no trustworthy context exists, it shows none.

Independent sentence examples are never concatenated to manufacture a passage. Multi-sentence study uses complete curated passages whose later sentences continue the same situation, event, explanation, or argument.

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

Passage practice uses complete curated reading-bank entries, not generated multi-sentence wrappers around arbitrary words.

Questions are discourse-level:

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

Search by term, reading, Jyutping, meaning, or grammar item. The browser shows only the verified context actually available for that item:

- exact item-specific sentences
- audited grammar examples
- translated exact corpus examples
- exact bundled examples
- complete curated reading-bank passages containing the target
- synchronized audio where available

It does not fabricate three sentence or passage variants when trustworthy material is unavailable.

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
- optional hosted Japanese neural TTS using full orthographic word/sentence input for better compound-aware pronunciation
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


## V13 semantic vocabulary topics

Japanese and Cantonese vocabulary can be filtered by 26 everyday semantic topics. The topic layer is additive to the original source metadata and includes vegetables, fruit, animals, transport, household objects, appliances, hygiene, tools, school, work, shopping, places, weather, health, cooking, and other daily-life domains.

V13 also adds a curated bilingual everyday supplement where the original dictionaries lacked an exact entry: 83 Japanese items and 49 Cantonese items. Every supplemental word has an English meaning and a pronunciation field; Cantonese supplement entries have Jyutping.

## V13 learner-facing English coverage

English is mandatory for every learner-facing word, static sentence, static passage, casual item, and audited grammar context. Context Browser displays English under sentence and passage examples. Study/review continues to hide answers until reveal. Raw Cantonese corpus lines without translations remain internal parser/corpus evidence and are not surfaced as learning cards.


## V14 item-specific context policy

- Removed learner-facing runtime sentence templates and the old coherent-scenario passage generator.
- Added `data/item_specific_contexts.js`, a per-item context registry.
- Added exact, item-specific examples for all V12 everyday supplement entries.
- Japanese grammar contexts now come from manually audited overrides or authentic corpus sentences containing a strong construction signature.
- Cantonese grammar contexts now come from the manually audited registry only.
- Independent sentence examples are never stitched into passages; multi-sentence study uses the curated reading banks only.
- Items without a trustworthy sentence show no example instead of fabricated filler.

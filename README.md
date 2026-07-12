# AIDA / 間 — Functional V18 Cyberpunk Usability Pass

A local-first Japanese and Cantonese learning application. Both languages live on one website but remain independent tracks with separate targets, XP, daily goals, activity, mastery, and review schedules.


## V18 changes

- Rebuilt the default homepage into a simple poster-style introduction with only a small progress strip underneath.
- Fixed scroll ownership in Usage Lab, Contexts, Review, Study, and Source Library dialogs.
- Added Japanese furigana to revealed study/review content, context examples, the Source Library, and Usage Lab sentence output when readings are available.
- Replaced the N5/N4/N3 Japanese reading bank with level-controlled passages and sentence sets: five passages and five sentences per level, all with readings, English translations, and comprehension questions.
- Removed boxed styling from listen/pronunciation controls and centered button content consistently.
- Moved visual effects into `ui-effects.js` and added restrained canvas lines, scroll reveals, tilt, glitch pulses, dialog glow, and button feedback.
- Simplified visible copy so the interface sounds more natural and less like marketing language.

See `quality/reading-level-audit.json` for the current N5/N4/N3 reading guardrail results.

## V14 context policy: specific or nothing

AIDA no longer uses a generic sentence generator that inserts arbitrary words into a small set of reusable templates.

Learner-facing examples are allowed only when they are tied to the exact item being studied:

1. **item-specific curated examples** written for that exact word or grammar point;
2. **manually audited grammar examples** selected for the named construction;
3. **exact-expression corpus examples** with an English translation;
4. **exact bundled examples** attached to the source vocabulary item; or
5. **curated reading-bank sentences/passages** that actually contain the target item.

If none of those sources provides a trustworthy example, AIDA shows no sentence instead of inventing filler.

Multi-sentence material follows the same rule. Independent example sentences are never stitched together to make a fake passage. Passage study uses complete curated passages in which sentence 2 belongs to the same situation as sentence 1 and later sentences continue the same event, explanation, or argument.

See `ITEM_SPECIFIC_CONTEXT_POLICY.md` and `CONTEXT_COVERAGE.md`.

## Current verified context coverage

Active source inventory:

- **8,056** Japanese vocabulary items
- **963** Japanese grammar items
- **25,918** active Cantonese vocabulary items
- **67** Cantonese grammar items
- **35,004** active vocabulary/grammar items total

Item-specific additions and grammar verification:

- **83 / 83** Japanese everyday-supplement words have exact item-specific examples
- **49 / 49** Cantonese everyday-supplement words have exact item-specific examples with Jyutping
- **437 / 963** Japanese grammar items currently have verified learner-facing contexts in the V14 registry
- **129 / 129** N5 Japanese grammar items have verified contexts
- **67 / 67** Cantonese grammar items have manually audited contexts with Jyutping
- **1,061** verified Japanese grammar examples in the registry
- **201** audited Cantonese grammar examples

The remaining ambiguous higher-level Japanese grammar items are intentionally allowed to have no example. V14 prefers an honest gap over a sentence that only happens to contain a similar character sequence.

## Six independent learning skills

A source item does not have one universal mastery state. A learner can recognize a word while still being unable to produce it or understand it in speech.

AIDA tracks these independently:

- Recognition
- Production
- Listening
- Reading comprehension
- Grammar usage/understanding
- Casual register

The Progress dashboard shows a separate mastery and due-review state for each skill in each language.

## FSRS-based scheduling

AIDA vendors `ts-fsrs` and keeps a separate FSRS memory card for each active item × skill combination. Desired retention is configurable from 80% to 97%. Rating buttons show the predicted next interval before selection.

Existing older item-level progress is migrated into the most sensible initial skill bucket instead of being discarded.

See `LEARNING_ENGINE.md` and `vendor/TS-FSRS-LICENSE.txt`.

## Contextual listening

Listening is a first-class practice mode:

- sentence transcripts begin hidden;
- passage transcripts begin hidden;
- the learner can type what was heard or understood before reveal;
- revealed text can replay with synchronized highlighting;
- Cantonese reveal uses Jyutping ruby text above Chinese characters;
- Context Browser examples can also be played with highlighting.

Japanese playback sends the written surface form or complete written sentence to TTS rather than flattening compounds to isolated kana before synthesis. A same-origin Japanese neural TTS route is included. Cantonese has a hosted neural fallback as well. See `AUDIO_SETUP.md` and `JAPANESE_AUDIO.md`.

## Casual & conversational language

Japanese and Cantonese have a dedicated conversational register system with its own FSRS memory state. Practice rotates through:

```text
TRANSFORM → NOTICE → REGISTER JUDGMENT
```

The focused curriculum currently contains:

- **90 Japanese casual/conversational items**
- **90 Cantonese casual/conversational items**

Every casual item includes English on reveal. Japanese coverage includes plain forms, context-dependent particle omission, contractions, ellipsis, fillers, backchannels, indirectness, quotation, discourse markers, slang, and register-sensitive rough forms. Cantonese coverage includes omission, aspect, A-not-A questions, backchannels, repair, discourse markers, final-particle combinations, colloquial vocabulary, idioms, and selected Hong Kong code-switching with cautions.

See `CASUAL_LANGUAGE.md`.

## Grammar-context verification

The old character-overlap matcher was removed after false matches such as an `い-Adjectives` card accepting a sentence merely because it contained the character `い`.

V14 uses a static per-item registry plus conservative evidence rules:

- manually audited examples are accepted directly;
- automatic Japanese corpus matches require a strong construction signature and token-boundary evidence from the offline build audit;
- all N5 Japanese grammar items have verified contexts;
- ambiguous higher-level items may have no context rather than a guessed one;
- all Cantonese grammar contexts come from the manually audited registry.

See `GRAMMAR_CONTEXT_AUDIT.md`.

## Progressive difficulty

The selected target is an upper ceiling, never an exact-only filter.

```text
Japanese:  N5 → N4 → N3 → N2 → N1
Cantonese: Beginner → Intermediate → Advanced
```

Sessions are sampled from allowed levels and ordered from easier material toward harder material.

## Study modes

- Adaptive mixed practice
- Recognition
- Production
- Contextual listening
- Grammar understanding
- Casual & conversational language
- Vocabulary recognition
- Sentence comprehension
- Passage comprehension

Sentence practice uses only verified item-specific, bundled, audited, or translated corpus context. Passage practice uses curated reading-bank passages rather than generated multi-sentence filler.

## Comprehension testing

Passage questions test discourse rather than isolated word definitions. Question types include:

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

The Contexts tab lets the learner search vocabulary or grammar and review only the contexts actually available for that item:

- exact item-specific sentences;
- audited grammar examples;
- translated exact corpus examples;
- exact bundled examples;
- curated reading-bank passages that contain the target.

The interface does **not** force three sentences or three passages when trustworthy material is unavailable. Cantonese Jyutping appears above Chinese characters with ruby annotation.

## Usage Lab

Usage Lab uses global dynamic-programming segmentation, conjugation handling, imported-context overlap, nearby grammatical evidence, semantic-domain reranking, and alternative-sense display. It remains an offline heuristic parser rather than an authoritative neural dependency parser.

## Everyday vocabulary topics

Vocabulary can be filtered across 26 semantic topics, including vegetables, fruit, animals, vehicles, home objects, kitchen items, appliances, hygiene, tools, school, work, shopping, places, weather, health, cooking, sports, and travel.

The V12 everyday supplement added exact missing entries only where the source dictionaries lacked the form:

- 83 Japanese items
- 49 Cantonese items

Every supplement item has an English meaning; Cantonese entries have Jyutping. V14 gives every one of these 132 supplement items an exact item-specific example instead of a reusable topic template.

## English translation policy

English is required for every learner-facing:

- vocabulary word;
- static sentence;
- static passage;
- casual-language item;
- audited grammar context;
- translated corpus example shown as a learning card.

Study and review still hide the answer until reveal so the English does not spoil the test. Raw Cantonese corpus lines without English remain internal parser/corpus evidence and are not surfaced as learning examples.

## Example quality controls

Every displayed context has a provenance/evidence label and a local **Report issue** workflow. Reported examples can be hidden, restored, managed from Profile, and carried through JSON export/import.

Pre-release audits:

```bash
python tools/audit_content.py
python tools/audit_reality_contexts.py
python tools/audit_item_specific_contexts.py
```

See `QUALITY_CONTROL.md`.

## Local progress

The site stores progress in the browser and supports:

- JSON export/import;
- clear-progress confirmation;
- separate Japanese/Cantonese XP;
- independent skill-level FSRS histories;
- preserved profile targets and daily goals when learning progress is cleared.

No fake browser-only username/password system is included because it would not provide real account security or cross-device account retrieval.

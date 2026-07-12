# AIDA example quality control

AIDA separates **provenance** from **correctness**. A badge tells you how an example entered the system; it does not claim that the example is infallible.

Current evidence labels include:

- **CORPUS AUTHENTIC** — imported from an identified corpus/source and surfaced only when the learner-facing route also has the required translation evidence.
- **AUDITED** — explicitly selected for a specific grammar concept.
- **RULE VALIDATED** — accepted through a concept-specific structural check.
- **CURATED** — written for an exact learner-facing item or curriculum entry.
- **UNVERIFIED** — provenance is not strong enough for a higher label.

V14 no longer uses generic runtime sentence generation for learner-facing vocabulary or grammar context. Legacy `GENERATED` metadata may still exist in older stored content, but the V14 context selector does not rely on a reusable generic sentence/passage engine.

Every displayed sentence context, curated passage match, exact reading-bank match, and casual-language item has a **Report issue** control. Reports can flag:

- incorrect grammar or usage;
- failure to demonstrate the named concept;
- unnatural wording;
- incorrect translation;
- incorrect reading or Jyutping;
- bad difficulty level;
- audio mismatch;
- another issue with notes.

Reported examples can be hidden locally. The report manager is under **Profile → Example quality → Review reports**. Reports are stored with the normal local profile and therefore travel with JSON export/import. Clearing learning progress does not erase quality reports.

## V14 specific-or-nothing gate

Learner-facing examples are limited to:

- exact item-specific curated examples;
- manually audited grammar examples;
- exact-expression translated corpus examples;
- exact bundled source examples;
- complete curated reading-bank passages containing the target.

Independent sentence examples are never stitched together into passages. If no trustworthy example exists, the interface leaves the context absent rather than creating filler.

The current Japanese grammar registry is intentionally conservative:

- 963 registry keys total;
- 437 items currently have verified contexts;
- 1,061 verified examples;
- all 129 N5 grammar items have verified contexts;
- ambiguous higher-level items may remain without an example.

Cantonese grammar has 67 / 67 items with 201 manually audited examples.

## Pre-release audits

Run:

```bash
python tools/audit_content.py
python tools/audit_reality_contexts.py
python tools/audit_item_specific_contexts.py
```

`audit_content.py` checks deterministic failures such as missing English translations, missing Cantonese Jyutping, duplicate casual pairs, incomplete audited grammar override sets, leaked placeholders, and structurally incomplete examples.

`audit_item_specific_contexts.py` checks the V14 item-specific registry, exact everyday-supplement coverage, Japanese N5 grammar coverage, Cantonese grammar coverage, and the absence of runtime generic context generators.

`audit_reality_contexts.py` checks that passage study remains curated and that independent sentence examples are not joined to create fake multi-sentence material.

These audits deliberately do **not** claim to solve semantic naturalness. Naturalness and pedagogical quality still require corpus evidence, focused review, and learner reports.

## English-coverage gate

`audit_content.py` checks that every learner-facing vocabulary item, static sentence, static passage, casual item, and audited grammar context has English. Raw Cantonese corpus lines without English are retained only as parser/corpus evidence and are filtered out of learner-facing context cards.

The same audit checks semantic-topic coverage and pronunciation fields on the curated everyday supplement.

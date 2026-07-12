# AIDA example quality control

AIDA now separates **provenance** from **correctness**. A badge tells you how an example entered the system; it does not claim that the example is infallible.

- **CORPUS AUTHENTIC** — imported from an identified corpus/source.
- **AUDITED** — an explicit grammar override selected for a specific concept.
- **RULE VALIDATED** — created or selected by a concept-specific structural rule.
- **CURATED** — written for a focused learner-facing curriculum, including casual-language items.
- **GENERATED** — assembled by the context/passage engine and therefore especially worth checking.
- **UNVERIFIED** — provenance is not strong enough for a higher label.

Every displayed sentence context, generated passage, exact reading-bank match, and casual-language item has a **Report issue** control. Reports can flag:

- incorrect grammar or usage;
- failure to demonstrate the named concept;
- unnatural wording;
- incorrect translation;
- incorrect reading or Jyutping;
- bad difficulty level;
- audio mismatch;
- another issue with notes.

Reported examples can be hidden locally. The report manager is under **Profile → Example quality → Review reports**. Reports are stored with the normal local profile and therefore travel with JSON export/import. Clearing learning progress does not erase quality reports.

## Pre-release audit

Run:

```bash
python tools/audit_content.py
```

The audit checks deterministic failures such as missing English translations, missing Cantonese Jyutping, duplicate casual pairs, incomplete grammar override sets, leaked placeholders, and structurally incomplete examples. The latest machine-readable result is written to `quality/audit-report.json`.

This audit deliberately does **not** claim to solve semantic naturalness. That still requires corpus evidence, focused review, and learner reports.

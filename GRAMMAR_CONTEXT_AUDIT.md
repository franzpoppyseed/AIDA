# Grammar Context Audit — V10

The V10 context selector no longer treats a sentence as a valid grammar example merely because it contains a character that appears somewhere in the grammar label. The failure shown in the previous build — an **い-adjectives** card displaying unrelated sentences such as `いなければならない` — was a selection bug caused by overly broad substring matching.

## Runtime selection rules

1. **High-risk grammar points use audited overrides first.** These examples are tied directly to the intended construction and bypass the old loose corpus lookup.
2. **Broad grammatical classes use concept-specific validators.** The app has dedicated examples for い-adjectives, な-adjectives, dictionary-form verb classes, and major adjective inflections.
3. **Remaining Japanese source contexts must pass construction-surface validation.** Literal forms, inflected signatures, particles, and construction boundaries are checked before a context can be displayed.
4. **Cantonese grammar uses audited examples for every grammar card.** The generic fallback is no longer needed for the 67 active Cantonese grammar points.
5. **Failure is safer than fabrication.** A grammar card with no validated context shows no context tile rather than an unrelated sentence.

## Japanese audit

- Active Japanese grammar cards: **963**
- High-risk cards with manual audited override sets: **150**
- Curated examples in those override sets: **450**
- Broad class / inflection cards handled by dedicated concept validators: **8**
- Remaining source-driven cards subjected to a stricter offline morphological / construction-signature audit: **805**
- Source-driven cards with fewer than 3 validated contexts after the audit: **0**

The stricter audit verified that all **805** remaining source-driven cards have at least three contexts matching the intended construction signature. The audit tool itself is not a runtime dependency; the website remains a static local-first application.

### Regression check: い-adjectives

The card now resolves to genuine adjective examples such as:

```text
この本は面白い。
今日は昨日より暑いです。
その問題は難しくない。
```

The former unrelated `いなければ…` examples are rejected for this card.

## Cantonese audit

- Active Cantonese grammar cards: **67**
- Cards with manual audited override sets: **67 / 67**
- Curated Cantonese grammar examples: **201**
- Cards with fewer than 3 audited contexts: **0**
- Every audited Cantonese example includes a Jyutping reading for reveal/audio support.

The audit includes superficially similar patterns that require different structures, such as the three uses of `同 + PERSON + VERB`, result/complement patterns with `得` and `到`, aspect particles, sentence-final particles, relative clauses, and adjectival predicates without `係`.

## Scope and limitation

This is a systematic construction audit, not a claim that a browser-only app can prove the full syntactic analysis of arbitrary Japanese or Cantonese sentences. V10 combines manual examples for the highest-risk points with stricter construction-signature validation for the remaining Japanese source contexts. The goal is practical: **do not show a learner an example unless the target concept is actually represented.**


## V11 local quality-control loop

Every displayed context now carries an evidence label such as **Corpus authentic**, **Audited**, **Rule validated**, **Curated**, **Generated**, or **Unverified**. These labels describe how the example entered the app; they do not claim infallibility.

Every context and casual-language example also has a **Report issue** control. Reports record the target concept, exact example text, translation, source/evidence class, reason, optional notes, and whether the learner wants the example hidden locally. Reports are included in the normal JSON profile export. The Quality Review manager allows hidden examples to be restored or reports to be removed.

This creates a practical feedback loop for a dataset too large to pretend has been manually proofread sentence by sentence.

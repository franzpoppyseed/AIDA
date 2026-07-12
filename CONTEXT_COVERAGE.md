# Context coverage report — V9

## Learner-facing source items

| Track | Type | Items | Sentence variants | Coherent passage variants |
|---|---:|---:|---:|---:|
| Japanese | Vocabulary | 7,973 | 23,919 | 23,919 |
| Japanese | Grammar | 963 | 2,889 | 2,889 |
| Cantonese | Vocabulary | 25,869 | 77,607 | 77,607 |
| Cantonese | Grammar | 67 | 201 | 201 |
| **Total** |  | **34,872** | **104,616** | **104,616** |

Context is materialized on demand rather than stored as hundreds of thousands of duplicate runtime cards.

## Three-stage progression

Every source item exposes:

```text
EASIER → BUILD → HARDER
```

The progression is skill-specific. Repeated listening exposure can advance while recognition remains on another state because listening and recognition no longer share one universal exposure counter.

## Coherent passage construction

A passage variant is built from:

1. a semantic-domain scenario setup
2. an authentic, bundled, original, or deterministic target-containing anchor context
3. discourse framing appropriate to the difficulty stage
4. a consequence, reconsideration, evidence step, or inference step

The three variants are not simple concatenations of the three sentence cards.

### EASIER

- short everyday setup
- target-containing central event/claim
- direct consequence or follow-up
- detail and sequence questions

### BUILD

- initial expectation
- target-containing event/claim
- changed interpretation
- purpose, change-in-view, and evidence questions

### HARDER

- contextual setup
- target-containing event/claim
- broader reasoning
- delayed conclusion or information gathering
- context, reasoning, implication, and summary questions

## Exhaustive validation

The V9 validation pass generated all three passage variants for all 34,872 active vocabulary/grammar items:

- 104,616 generated passage variants checked
- 348,720 generated comprehension questions checked
- 0 duplicate three-variant sets
- 0 empty passages
- 0 item-linked passages without comprehension questions
- 0 generated “What does this word mean?” comprehension prompts
- 0 Cantonese generated passages missing a reading/Jyutping string

Question types observed:

- CENTRAL DETAIL
- SEQUENCE
- PURPOSE
- CHANGE IN VIEW
- EVIDENCE
- INFERENCE
- CONTEXT
- REASONING
- IMPLICATION
- SUMMARY

## Context source priority

### Japanese vocabulary and grammar

1. selected Tatoeba/Tanaka-WWWJDIC Japanese–English context
2. original AIDA grammar examples where no imported match exists
3. deterministic AIDA fallback for remaining gaps

### Cantonese vocabulary

1. bundled vocabulary examples with Jyutping
2. HKCanCor conversational context
3. deterministic AIDA fallback

### Cantonese grammar

Target-language structure instantiations with varied people, objects, times, and places.

Generated/original material is identified as AIDA material rather than corpus-authentic text.

## Imported/bundled coverage before fallback

- Japanese vocabulary with imported context: 6,991 / 7,973
- Japanese grammar with imported corpus context: 742 / 963
- Japanese grammar with at least three non-meta contexts after AIDA supplementation: 963 / 963
- Cantonese vocabulary with bundled examples: 24,927 / 25,869
- Cantonese vocabulary with HKCanCor context: 4,224 / 25,869
- Cantonese vocabulary covered by bundled examples or HKCanCor: 25,130 / 25,869

## Cantonese pronunciation coverage

The learner-facing active Cantonese dataset contains 25,869 vocabulary items and 67 grammar items. Active items retain learner-visible Jyutping/pronunciation data. Generated Cantonese passage support lines also include Jyutping so answer reveal and synchronized transcript rendering can annotate characters.

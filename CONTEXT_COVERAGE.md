# Context coverage report — V14

## Policy

V14 uses a **specific-or-nothing** rule for learner-facing context.

AIDA does not generate a sentence by dropping an arbitrary vocabulary word or grammar label into a generic frame. A learner-facing sentence must be connected to the exact item through one of these evidence paths:

1. item-specific curated context;
2. manually audited grammar context;
3. exact-expression translated corpus context;
4. exact bundled source example; or
5. exact occurrence inside a curated reading-bank passage.

When no trustworthy context is available, the item may be studied as a word/grammar card without a sentence. Missing coverage is treated as a content backlog, not permission to fabricate filler.

## Active source inventory

| Track | Type | Active items |
|---|---:|---:|
| Japanese | Vocabulary | 8,056 |
| Japanese | Grammar | 963 |
| Cantonese | Vocabulary | 25,918 |
| Cantonese | Grammar | 67 |
| **Total** |  | **35,004** |

Unlike older releases, V14 does not claim a fixed number of generated variants per item. The number of examples shown is the number of trustworthy examples currently available.

## Exact everyday-supplement coverage

The V12 supplement added concrete everyday vocabulary that was missing from the source dictionaries. V14 gives every supplement entry an exact item-specific example:

- Japanese: **83 / 83**
- Cantonese: **49 / 49**

Every learner-facing example has English. Cantonese examples also have Jyutping.

## Japanese grammar context coverage

The V14 static registry contains:

- **963** grammar registry keys;
- **437** grammar items with one or more verified learner-facing contexts;
- **1,061** verified Japanese grammar examples;
- **129 / 129 N5 grammar items** with verified contexts.

Evidence comes from manually audited overrides or conservative translated-corpus matches that passed offline construction-signature and token-boundary checks.

Higher-level Japanese grammar is intentionally conservative. If a form is too ambiguous to verify safely from the available corpus evidence, the registry can remain empty. This avoids false matches such as:

- `い` inside an unrelated form being treated as an い-adjective;
- a short grammar string being found inside a different lexical word;
- a surface-identical expression being accepted with the wrong grammatical sense.

## Cantonese grammar context coverage

- **67 / 67** grammar items have manually audited contexts;
- **201** audited Cantonese grammar examples;
- learner-facing examples include Jyutping and English.

Runtime slot-filling and placeholder substitution are disabled.

## Vocabulary context sources

### Japanese vocabulary

Priority:

1. exact item-specific registry context;
2. exact-expression Japanese–English corpus example;
3. exact bundled source example, when present.

No generic fallback sentence is created.

### Cantonese vocabulary

Priority:

1. exact item-specific registry context;
2. exact bundled example with English/Jyutping when available;
3. translated exact corpus evidence when available.

Raw HKCanCor utterances without English remain internal parser/corpus evidence and are not surfaced as learning cards.

## Multi-sentence coherence policy

AIDA never combines unrelated sentence examples to manufacture a passage.

Passage study and passage display use complete entries from the curated reading banks. A passage is stored as one unit, so later sentences belong to the same situation, event, explanation, or argument as the earlier sentences.

For a searched vocabulary or grammar item, a passage is shown only when that complete curated passage contains the target item.

If no matching curated passage exists, AIDA does not create one by joining independent examples.

## Current verification gates

Run:

```bash
python tools/audit_item_specific_contexts.py
python tools/audit_reality_contexts.py
python tools/audit_content.py
```

The V14 item-specific audit checks:

- all 83 Japanese everyday-supplement entries have exact item-specific context and English;
- all 49 Cantonese everyday-supplement entries have exact item-specific context, English, and Jyutping;
- all 129 N5 Japanese grammar items have verified contexts;
- all 67 Cantonese grammar items have audited contexts;
- low-confidence automatic grammar signatures are excluded;
- runtime generic sentence generators are absent.

The reality-context audit checks:

- the item-specific registry is loaded;
- runtime generic generators are removed;
- passage study uses curated reading banks;
- independent sentences are not stitched into passages.

## Design trade-off

V14 deliberately prefers **precision over nominal coverage**. A missing example is visible work to be completed later; a natural-looking but conceptually wrong example can actively teach the learner the wrong thing.

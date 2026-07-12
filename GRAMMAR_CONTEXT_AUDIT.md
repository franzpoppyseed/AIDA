# Grammar context audit — V14

## Why the audit exists

Older context selection could confuse surface overlap with grammatical evidence. The clearest failure was an `い-Adjectives` card accepting sentences that merely contained the character `い` somewhere inside another word or construction.

V14 removes that runtime behavior. Grammar context is resolved from a static per-item registry built under conservative evidence rules.

## Japanese grammar

Current registry:

- total grammar items: **963**
- registry keys: **963**
- items with one or more verified contexts: **437**
- verified examples: **1,061**
- N5 grammar coverage: **129 / 129**

Evidence sources:

1. manually audited overrides for high-risk or broad concepts;
2. manually added item-specific N5 examples where trustworthy corpus evidence was missing;
3. translated corpus examples that passed an offline token-boundary and strong construction-signature check.

Short ambiguous strings and lexical lookalikes are deliberately rejected. A higher-level grammar item may have no example if the available evidence cannot safely distinguish the intended construction.

This is intentional. The system no longer claims that all 963 Japanese grammar cards have three verified contexts.

## Cantonese grammar

- total grammar items: **67**
- items with audited contexts: **67 / 67**
- audited examples: **201**
- examples include Jyutping and English.

Runtime placeholder substitution and slot-filled grammar sentence generation are disabled.

## Runtime acceptance rule

At runtime, a grammar example is accepted only when it is already audited or carries the exact verified construction signature stored by the offline build process. Character overlap alone is not enough.

## Regression policy

The audit specifically protects against:

- an `い` character being treated as proof of an い-adjective;
- a grammar label matching inside a longer unrelated word;
- a surface-identical expression being used with the wrong grammatical sense;
- Cantonese slot-filling producing a technically shaped but unnatural sentence.

## Audit command

```bash
python tools/audit_item_specific_contexts.py
```

The audit verifies current registry coverage and fails if low-confidence automatic signatures leak into learner-facing grammar context.

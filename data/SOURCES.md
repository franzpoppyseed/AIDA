# AIDA data sources

## Japanese vocabulary

The main Japanese vocabulary dataset comes from the user-supplied `all.csv` source used to build `data/japanese_vocabulary.js`. V12 added a small curated everyday-vocabulary supplement only where the source dictionary lacked the exact desired form.

## Japanese grammar

The main Japanese grammar library comes from the project grammar source used to build `data/japanese_grammar.js`.

Learner-facing grammar examples are now controlled by the V14 static item-specific registry. They come from manually audited examples or conservative translated-corpus matches that passed offline construction-signature and token-boundary checks. Ambiguous items may intentionally have no example.

## Japanese context corpus

`data/context_examples.js` contains selected Japanese–English sentence pairs derived from the Tatoeba/Tanaka-WWWJDIC material described in `THIRD_PARTY_CONTEXT_LICENSES.md`.

The V14 learner-facing selector requires an exact item connection and an English translation before an imported sentence can appear as a learning example.

## Cantonese vocabulary

The main Cantonese vocabulary data is preserved in `data/cantonese_vocabulary.js`. Rows without usable learner-facing pronunciation/entry data remain outside the active study set in the preserved excluded export.

## Cantonese context corpus

Selected HKCanCor utterances are retained in `data/context_examples.js` for parser/corpus evidence. Raw lines without English are not shown as learner-facing learning examples.

## Cantonese grammar

All 67 learner-facing Cantonese grammar items use manually audited examples in the V14 item-specific registry. Runtime placeholder substitution and generic slot-filling are disabled.

## V14 item-specific context policy

The application no longer guarantees three generated sentence contexts or three generated passages for every item.

Learner-facing context may come from:

- an exact item-specific curated example;
- a manually audited grammar example;
- an exact-expression translated corpus example;
- an exact bundled source example;
- a complete curated reading-bank passage containing the item.

If no trustworthy context exists, no context is generated.

Independent sentence examples are never concatenated into a passage. Multi-sentence study uses complete curated passages whose sentences belong to the same situation or discourse.

See `ITEM_SPECIFIC_CONTEXT_POLICY.md` and `CONTEXT_COVERAGE.md`.

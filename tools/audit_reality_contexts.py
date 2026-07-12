#!/usr/bin/env python3
from pathlib import Path
import json, sys
ROOT = Path(__file__).resolve().parents[1]
app = (ROOT / "app.js").read_text(encoding="utf-8")
index = (ROOT / "index.html").read_text(encoding="utf-8")
banned = [
    "is an important topic",
    "大切なテーマです",
    "AIDA generated usage context",
    "function everydayVocabularyContexts",
    "COHERENT_SCENES",
    "COHERENT_FRAME_LINES",
    "AIDA grammar instantiation",
    "YUE_PLACEHOLDER_SETS",
]
found = [x for x in banned if x in app]
checks = {
    "item_specific_registry_loaded": 'data/item_specific_contexts.js' in index,
    "runtime_generic_generators_removed": not found,
    "passages_use_curated_bank": 'if (focus === "passages") return passages;' in app,
    "independent_sentences_not_stitched": 'curatedPassageMatchesForBase' in app and 'source[passageKind]' in app,
    "banned_phrases": found,
}
print(json.dumps(checks, ensure_ascii=False, indent=2))
if found or not all(v is True for k,v in checks.items() if k != "banned_phrases"):
    sys.exit(1)

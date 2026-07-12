from pathlib import Path
import json, re, sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

def load_js(path, key):
    text = path.read_text(encoding="utf-8")
    m = re.search(rf"window\.AIDA_DATA\.{re.escape(key)}\s*=\s*(\{{.*\}});\s*$", text, re.S)
    if not m:
        raise RuntimeError(f"Could not parse {path.name}")
    return json.loads(m.group(1))

reg = load_js(DATA / "item_specific_contexts.js", "itemSpecificContexts")
jp_v = load_js(DATA / "japanese_vocabulary.js", "japaneseVocabulary")["items"]
yue_v = load_js(DATA / "cantonese_vocabulary.js", "cantoneseVocabulary")["items"]
jp_g = load_js(DATA / "japanese_grammar.js", "japaneseGrammar")["items"]
yue_g = load_js(DATA / "cantonese_grammar.js", "cantoneseGrammar")["items"]

errors = []
for item in jp_v:
    if item["id"].startswith("jp-ev-"):
        examples = reg["japanese"]["vocabulary"].get(item["id"], [])
        if not examples:
            errors.append(f"missing Japanese supplement context: {item['id']}")
        for ex in examples:
            if item["expression"] not in ex.get("text", ""):
                errors.append(f"Japanese supplement context does not contain exact item: {item['id']}")
            if not ex.get("translation"):
                errors.append(f"Japanese supplement missing English: {item['id']}")

for item in yue_v:
    if item["id"].startswith("yue-ev-"):
        examples = reg["cantonese"]["vocabulary"].get(item["id"], [])
        if not examples:
            errors.append(f"missing Cantonese supplement context: {item['id']}")
        for ex in examples:
            if item["word"] not in ex.get("text", ""):
                errors.append(f"Cantonese supplement context does not contain exact item: {item['id']}")
            if not ex.get("translation"):
                errors.append(f"Cantonese supplement missing English: {item['id']}")
            if not ex.get("reading"):
                errors.append(f"Cantonese supplement missing Jyutping: {item['id']}")

jp_registry = reg["japanese"]["grammar"]
yue_registry = reg["cantonese"]["grammar"]
if len(jp_registry) != len(jp_g):
    errors.append(f"Japanese grammar registry count {len(jp_registry)} != {len(jp_g)}")
if len(yue_registry) != len(yue_g):
    errors.append(f"Cantonese grammar registry count {len(yue_registry)} != {len(yue_g)}")

jp_grammar_by_id = {item["id"]: item for item in jp_g}
for iid, examples in jp_registry.items():
    for ex in examples:
        if not ex.get("text") or not ex.get("translation"):
            errors.append(f"incomplete Japanese grammar context: {iid}")
        sig = ex.get("matchedSignature")
        if sig and sig not in ex.get("text", ""):
            errors.append(f"signature mismatch: {iid} / {sig}")
        if sig:
            kanji_count = len(re.findall(r"[一-龠]", sig))
            high_conf = len(sig) >= 5 or kanji_count >= 2 or (len(sig) >= 4 and kanji_count >= 1)
            if not high_conf:
                errors.append(f"low-confidence automatic signature leaked into registry: {iid} / {sig}")
for item in jp_g:
    if item.get("level") == "N5" and not jp_registry.get(item["id"]):
        errors.append(f"N5 grammar item has no verified context: {item['id']}")
for iid, examples in yue_registry.items():
    for ex in examples:
        if not ex.get("text") or not ex.get("translation"):
            errors.append(f"incomplete Cantonese grammar context: {iid}")

app = (ROOT / "app.js").read_text(encoding="utf-8")
for banned in [
    "function everydayVocabularyContexts",
    "COHERENT_SCENES",
    "COHERENT_FRAME_LINES",
    "AIDA grammar instantiation",
    "Example of: ${item.meaning}",
    "YUE_PLACEHOLDER_SETS",
]:
    if banned in app:
        errors.append(f"banned runtime generator remains: {banned}")

report = {
    "policy": "item-specific-only",
    "japanese_everyday_specific_contexts": len(reg["japanese"]["vocabulary"]),
    "cantonese_everyday_specific_contexts": len(reg["cantonese"]["vocabulary"]),
    "japanese_grammar_registry_items": len(jp_registry),
    "japanese_grammar_items_with_contexts": sum(bool(v) for v in jp_registry.values()),
    "japanese_grammar_context_examples": sum(len(v) for v in jp_registry.values()),
    "japanese_n5_grammar_items": sum(item.get("level") == "N5" for item in jp_g),
    "japanese_n5_grammar_items_with_contexts": sum(item.get("level") == "N5" and bool(jp_registry.get(item["id"])) for item in jp_g),
    "cantonese_grammar_registry_items": len(yue_registry),
    "cantonese_grammar_items_with_contexts": sum(bool(v) for v in yue_registry.values()),
    "cantonese_grammar_context_examples": sum(len(v) for v in yue_registry.values()),
    "runtime_generic_sentence_generators": 0 if not errors else None,
    "errors": errors,
}
(ROOT / "quality" / "item-specific-context-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
if errors:
    sys.exit(1)

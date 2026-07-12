#!/usr/bin/env python3
"""Lightweight guardrails for the curated Japanese N5/N4/N3 reading bank.

This does not claim to replace a teacher or official JLPT grading. It catches the
main failure mode that caused the old bank to drift upward: long passages,
missing readings/translations, missing questions, and clearly advanced grammar
patterns appearing in beginner material.
"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_js(path: Path, key: str):
    text = path.read_text(encoding="utf-8")
    match = re.search(rf"window\.AIDA_DATA\.{re.escape(key)}\s*=\s*(.*);\s*$", text, re.S)
    if not match:
        raise RuntimeError(f"Could not parse {path}")
    return json.loads(match.group(1))


comp = load_js(ROOT / "data" / "comprehension.js", "comprehension")
reading = load_js(ROOT / "data" / "reading_passages.js", "readingPassages")
passages = [*comp["japanese"].get("passages", []), *reading.get("japanese", [])]
sentences = comp["japanese"].get("sentences", [])

limits = {"N5": 75, "N4": 105, "N3": 145}
banned = {
    "N5": [r"ようにして", r"ことにして", r"うちに", r"一方", r"わけでは", r"にもかかわらず", r"に至る"],
    "N4": [r"一方で", r"にもかかわらず", r"に至る", r"あまり.*ならない"],
    "N3": [r"にもかかわらず", r"に至るまで", r"を余儀なく", r"にほかならない"],
}

report = {"levels": {}, "errors": [], "warnings": []}
for level in ("N5", "N4", "N3"):
    level_passages = [item for item in passages if item.get("level") == level]
    level_sentences = [item for item in sentences if item.get("level") == level]
    report["levels"][level] = {
        "passages": len(level_passages),
        "sentences": len(level_sentences),
        "max_passage_chars": max((len(item.get("text", "")) for item in level_passages), default=0),
    }
    if len(level_passages) < 5:
        report["errors"].append(f"{level} has fewer than 5 curated passages")
    if len(level_sentences) < 5:
        report["errors"].append(f"{level} has fewer than 5 curated sentences")
    for item in level_passages:
        if len(item.get("text", "")) > limits[level]:
            report["warnings"].append(f"{item['id']} exceeds {level} length guardrail")
        if not item.get("reading"):
            report["errors"].append(f"{item['id']} is missing a reading")
        if not item.get("translation"):
            report["errors"].append(f"{item['id']} is missing English")
        if len(item.get("questions", [])) < 3:
            report["errors"].append(f"{item['id']} has fewer than 3 comprehension questions")
        for pattern in banned[level]:
            if re.search(pattern, item.get("text", "")):
                report["errors"].append(f"{item['id']} contains a pattern above the {level} guardrail: {pattern}")
    for item in level_sentences:
        if not item.get("reading") or not item.get("translation"):
            report["errors"].append(f"{item['id']} is missing a reading or English translation")

out = ROOT / "quality" / "reading-level-audit.json"
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
raise SystemExit(1 if report["errors"] else 0)

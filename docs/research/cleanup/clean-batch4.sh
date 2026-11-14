#!/usr/bin/env bash
# Batch 4, the last seven reports, cleaned by gdr-clean 0.1.0 (gemini-research-cleanup, commit 078975e).
# Run from docs/research. The formulas and hand fixes are the sidecars cleanup/<slug>.{math,overrides}.json,
# the names that keep their digits are originals/gdr-clean.json. GDR_CLEAN names the command
# (default gdr-clean, e.g. GDR_CLEAN="node /path/to/gemini-research-cleanup/bin/gdr-clean.mjs").
set -eu
gdr=${GDR_CLEAN:-gdr-clean}

# --cite-style is the detected one (auto) everywhere but in the risk report: its tags and its glued words
# are both in use, and auto picks tag there once the names are kept, which would leave 30 citations glued.
$gdr apply \
  "originals/Autonomous Code Review Economics.md" \
  "originals/LLM Code Review Economics.md" \
  "originals/LLM Code Review Structural Variants.md" \
  "originals/Local Agent Harness Architecture.md" \
  "originals/Local LLM Agent Loops.md" \
  --work-dir cleanup --out-dir .
$gdr apply "originals/Code Review Risk Classification.md" --cite-style word --work-dir cleanup --out-dir .

# A prompt-and-result note with a source audit and no reference list: escapes and headings only.
$gdr apply "originals/Qwen Multi-Agent Benchmark.md" --no-refs --work-dir cleanup --out-dir .

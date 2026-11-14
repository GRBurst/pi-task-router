# How the reports were cleaned

The reports were exported from Gemini Deep Research as Markdown. The raw exports are in `originals/`; the
cleaned versions next to this file. The tool for this job, `gdr-clean`, has a repository of its own,
`gemini-research-cleanup`; its specification is pi-economics' `docs/prompts/research-cleanup-tool.md`. The first
eight reports (batches 1–3) were cleaned by scripts, the seven exports of batch 4 by the tool: see the last section.

## What was changed (batches 1–3)

- The embedded PNG images (`![][imageN]`, `[imageN]: <data:image/png;base64,...>`) are inline math formulas.
  Each was read by eye and transcribed to inline LaTeX (`$...$`); the data URIs were removed.
  Exception: batch 3's two reports (23 images) were transcribed by OCR
  (tesseract over ImageMagick preprocessed renders), because this session's
  model has no vision; the doubts it left are listed under open points.
- Citation numbers glued to words ("models3.") became footnotes `[^3]`; `[cite: 5, 11]` became `[^5][^11]`.
  Version numbers that swallowed a citation were split by hand ("Apache 2.014" → `Apache 2.0[^14]`, "CC BY
  4.03" → `CC BY 4.0[^3]`, "Claude Opus 4.83" → `Claude Opus 4.8[^3]`); names with digits (Qwen3, GPT-5, R1,
  v3, INT8, F1, SWE-bench Verified) were kept; batch 3 extended the keep list with NVFP4, Q4_K_M, NL2Repo,
  GSM8K, o1, qwen3, URL hashes and issue numbers.
- The two batch-3 reports cited differently from batches 1–2:
  `autonomous-merge-pipeline-size-limits.md` glues numbers to words, cleaned with the same pass after five
  hand-split fusions ("relative to Opus 518." → `Opus 5[^18].`, "Terminal-Bench 2.14." → `2.1[^4].`,
  "2.19." → `2.1[^9].` twice, "4.016." → `4.0[^16].`, "arXiv:2610.3350927" → `arXiv:2610.33509[^27]`);
  `coding-agent-loop-harness-research.md` puts the number after a claim-type tag (`[Peer-Reviewed]11`),
  converted only where the line ends in such a tag. Its untagged `[Inference]` and a stray
  "64.0% pass rate 1" (an Aider-post footnote-marker artifact) were kept, the prose otherwise unchanged.
- `#### **Works cited**` with `> n. Title, [url](url)` became `## Works cited` with `[^n]: Title, <url>`.
- Markdown escapes (`\- \+ \~ \. \: \= \!`, `\_`) removed, bold removed from headings, `$` before digits
  escaped as `\$`, blank-line runs collapsed. The prose is otherwise unchanged (checked by a word-level diff
  against the originals).

## Scripts

`cleanup/clean-batch1.mjs` (the first three reports), `cleanup/clean-batch2.mjs` (the middle three) and
`cleanup/clean-batch3.mjs` (the last two) did the work. Each holds its batch's formula transcriptions and
expects the original export file names (title with spaces, `.md`) in its working directory (batches 2 and 3:
the directory given as its argument). They are kept as provenance, not as a reusable tool.

## Results and open points

| Report | References | Cited |
|---|---|---|
| `llm-routing-for-coding-agents.md` | 50 | 31 |
| `local-model-coding-orchestration-research.md` | 51 | 33 |
| `strong-model-oversight-for-agents.md` | 45 | 27 |
| `two-tier-agent-planning-architecture.md` | 35 | 25 |
| `agentic-plan-and-code-sizing.md` | 58 | 25 |
| `frontier-model-plan-review-protocol.md` | 40 | 28 |
| `coding-agent-loop-harness-research.md` | 47 | 28 |
| `autonomous-merge-pipeline-size-limits.md` | 39 | 24 |
| `llm-code-review-economics.md` | 40 | 24 |
| `code-review-risk-classification.md` | 72 | 42 |
| `autonomous-code-review-economics.md` | 61 | 39 |
| `llm-code-review-structural-variants.md` | 52 | 43 |
| `local-agent-harness-architecture.md` | 26 | 15 |
| `local-llm-agent-loops.md` | 39 | 24 |

"Cited" is the number of different footnotes the body cites (the reference definitions are not counted). The first
version of this table counted batch 2 over the whole file, definitions included (58, 40, 35 for the three reports of
batch 2), and had 30 for `llm-routing-for-coding-agents.md`, which has 31 once its hand-fixed `Apache 2.07.` is
counted; the figures above were recounted on the tracked files.

One hand fix after the fact: `two-tier-agent-planning-architecture.md` (batch 2) had `FP8` and `INT4` turned into
citations (`such as FP[^8] or INT[^4])`, line 38), found when gdr-clean replayed the batch with its keep list. Those two
tokens are fixed by hand; the report is otherwise as cleaned by the script (it was not re-rendered, so it still differs
from a replay in the ways `gemini-research-cleanup`'s `docs/replay.md` lists). The footnotes 4 and 8 stay cited elsewhere in
the body, so the counts above do not change.

No footnote is dangling. Uncited references are Gemini's, left in place. The load-bearing sources of the two
batch-3 reports have not been spot-checked yet; the spot-check bullet in the README covers only the three
plan-authorship reports.

Transcribed literally although doubtful:

1. `frontier-model-plan-review-protocol.md`, line 19 (Post-Release row): `$60.0\times-100.0\times+$`; the
   trailing `+` is uncertain.
2. `two-tier-agent-planning-architecture.md`, line 93, `C_{A,1,cached}`: the image shows `− 600·$25.00`, but
   the stated value \$0.1863 needs `+`.
3. `two-tier-agent-planning-architecture.md`, line 111, `k_breakeven` (cached): the image shows `1.0 −`, but
   the stated ≈1.45 needs `+`.
4. `agentic-plan-and-code-sizing.md`, line 37: `p_success(agent, t) = σ(β(log h_agent − log t))`, read by eye;
   the sentence supports it.
5. `autonomous-merge-pipeline-size-limits.md`, the display cost formula `C*_merge(S)`: OCR of a 620×87 px
   render; the grouping of the `(1 − P_correct)` factor and the subscript of the last term are uncertain.
6. `autonomous-merge-pipeline-size-limits.md`, the size-cap cells `$\le 30$ files`, `$\le 2{,}000$ lines` and
   `$\le 50$`: OCR read `≤` and the prose supports it, but `≤` versus `<` is not certain.
7. `autonomous-merge-pipeline-size-limits.md`, the Haiku price cell: the raw cell ends "tokens) $0.01 Cache
   Reads" with no closing `$` after `100k`; the transcription adds it.

Not fixable without the sources: titles Gemini truncated in the reference lists; one reference in
`two-tier-agent-planning-architecture.md` (24) points to `http://docs.google.com/unknown_url`. One stray
`\<` escape is left in `two-tier-agent-planning-architecture.md`.

## Batch 4: cleaned by gdr-clean

The last seven exports (six reports and one note) were cleaned by the tool this file's first paragraph announced:
`gdr-clean` 0.1.0 of `gemini-research-cleanup`, commit 078975e. `cleanup/clean-batch4.sh` holds the commands, the
formulas and hand fixes are the sidecars `cleanup/<slug>.math.json` and `.overrides.json`, and the names that keep
their digits are in `originals/gdr-clean.json` (which batches 1–3 share). Unlike the scripts of batches 1–3, the
tool proves what it did: the prose check removes every footnote it added and requires the rest to equal the export
after the non-citation rules, and it passed for all six reports. None has a dangling footnote or a publishing-lint
finding.

- **Formulas.** 138 images in three reports (`autonomous-code-review-economics.md` 41, `llm-code-review-economics.md`
  75, `llm-code-review-structural-variants.md` 22). They were read by eye from enlarged renders, not by OCR. Two of the
  75 are not formulas: Gemini's maths parser took a sentence between two dollar signs for an equation (lines 118 and 119
  of `llm-code-review-economics.md`); the images hold that sentence, so they are text entries, and two overrides put the
  lost `$\times$` and the closing `**` back.
- **Citation style.** `--cite-style auto` detected `word` (digits glued to words, tags and punctuation) for five reports.
  For `code-review-risk-classification.md`, whose tags and glued words are both in use, auto picked `tag` as soon as the
  names below were kept, which would have left some 50 citations glued; that report is cleaned with `--cite-style word`.
- **Names that keep their digits** (`originals/gdr-clean.json`): `Q8`, `BF16`, `FP8`, `INT4`, `K3`, `v2`
  (`CR-Bench-v2`), the research questions `RQ1`–`RQ3`, the levels `L3`–`L5`, `H1` (first half of 2026) and the nine
  arXiv ids that end in a version (`2509.01494v1,` is not `v` plus citation 1). Every other capitalised word with glued digits
  that the report listed as `name-like` is a citation (`PR40`, `GB48`, `GiB9`, `Pi6`, `SDK1`, `32B13`, `Preprint8`,
  `HotpotQA11`, `CodeRabbit4`, ...) and stays converted. Of the 15 decimals the reports listed, 14 are numbers (`124.22 s`,
  `0.657`, `0.043`, `0.845`, ...) and one, `Opus 4.542`, is `Opus 4.5` plus citation 42.
- **Citations the rules left glued, fixed by override** (38). Digits before a closing parenthesis and a second
  punctuation mark (`(<500 lines21),`, `correlation52);`, `416504011)30—`) are listed under "remaining glued digits" and
  not converted; so are runs of three digits that exceed the reference count (`F119` is `F1` plus 19, `RQ354`, `16708v117`),
  digits fused to a number (`Table 91`, `Figure 31`, `Section 330`, `0.53324`, `0.3331`) and a citation after a
  formula (`$R_F = 0.337$2)`). The last two kinds are not in the listing at all; they were found by reading the
  numbers that follow `Table`, `Figure` and `Section` and the decimals with more digits than their neighbours, and
  confirmed against the reference titles. Other fusions of this kind may remain unseen.
- **Other hand fixes by override** (12). Nine table headers held Word's equation fallback (a name written three
  times, `nnn`, `F1F_1F1`, `E[Cost]E[\text{Cost}]E[Cost]`, or flattened subscripts such as `pd R1 Desc/F=10` with
  zero-width spaces): they are inline LaTeX now, as `N>2N > 2N>2` was in batch 1; one `$` before a bold amount
  (`$300–$**450**`) is escaped; two are the text entries above. The zero-width spaces that remain are in other
  headers of the same kind, left as exported.
- **Redaction.** `originals/Code Review Risk Classification.md`, line 163, is the title of reference 51: the page's
  site name, which Gemini scraped as a third party's e-mail address (the leak check forbids any). It reads
  `(e-mail redacted)` in the original itself, so the cleaned report inherits it; the raw export, with the address, is
  not tracked. This is the only byte of the seven originals that differs from the export. The host of the address
  stays in the reference's URL.
- **The note.** `Qwen Multi-Agent Benchmark.md` has a prompt, an answer and a source audit but no reference list, so
  it was cleaned with `--no-refs` (escapes and headings only; its bracketed source names such as `[AI Pricing Guru, 2026]`
  stay as they are). The prose check does not apply: no citation is added.

Not fixed: titles Gemini truncated in the reference lists. Besides the doubts below, the source claims were not
checked, as for the earlier batches.

Transcribed literally although doubtful (lines of the cleaned files):

1. `autonomous-code-review-economics.md`, line 28 (the confidence drift score): the subscripts of `r_5 | C_1` and
   `C_0` are two pixels high; `C_1` may be `C_4` (a five-turn conversation conditions on four turns).
2. `autonomous-code-review-economics.md`, line 55: a two-line display, flattened to one line.
3. `llm-code-review-economics.md`, lines 151 and 208 (the nominal cost) and `llm-code-review-structural-variants.md`,
   lines 13 and 15 (the batched cost, the break-even condition): the plus and minus signs are drawn so faintly that
   some are missing from the image (`(C_CI [gap] T_fixed`, `(1 [gap] s(L))`, `(1 [gap] 1/k)`); they were restored from
   the surrounding algebra (`F_total = C_CI + T_fixed p_in + T_out p_out`, `C_1(L) s(L) = F`).
4. `llm-code-review-economics.md`, line 161: `(s/s_0)^\gamma` in the recall model is drawn as a stacked pair inside
   large parentheses; it was read as a fraction (a power-decay function of the diff size).
5. `llm-code-review-economics.md`, lines 210 and 213: the superscript of `s*_low risk` and `s*_high risk` is one asterisk-like
   pixel cluster, and the right edge of the second image cuts the last letter of "LOC".
6. `llm-code-review-economics.md`, lines 78–80 and 170–173: `45.00`, `37.50`, `25.00` and `4.00/10^6`, `0.20/10^6`,
   `20.00/10^6` are dollar amounts whose images carry no dollar sign; transcribed as drawn.
7. `llm-code-review-structural-variants.md`, line 12: the closing bracket of `[0.73, 0.96]` is cut by the image edge;
   line 42: two images end in `=`, as in the export.

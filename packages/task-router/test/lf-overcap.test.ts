// Local-first plan LF5.T9, T10 (spec SIZE-8, design §5.3): the local-first gate never refuses on size; a diff above the review's
// budget is reviewed on the numstat, the check output and the riskiest files' hunks within `overCapBytes` (`overCap`).
// Legacy local mode keeps its size refusal. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { nodeRig } from "./node-rig.ts";
import { seeded } from "./rand.ts";

/** Commits `files` files holding `lines` lines in all into `dir`. */
function change(x: ReturnType<typeof nodeRig>, dir: string, lines: number, files: number, tag: string): void {
  for (let i = 0; i < files; i++) {
    const n = Math.floor(lines / files) + (i < lines % files ? 1 : 0), p = join(dir, "src", tag, `f${i}.ts`);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, Array.from({ length: n }, (_, k) => `export const v${k} = ${k};\n`).join(""));
  }
  x.r.git(["add", "-A"], dir);
  x.r.git(["commit", "-q", "-m", tag], dir);
}

test("no size refusal", async () => {
  const x = nodeRig(), rnd = seeded(808);
  const cases: Array<[number, number]> = [[0, 1], [151, 1], [1, 7], [5000, 40], [150, 6]];
  for (let i = 0; i < 6; i++) cases.push([rnd(5001), 1 + rnd(40)]);
  const g = x.settings.mergeGate;
  for (const [i, [lines, files]] of cases.entries()) {
    const n = await x.node({ slug: `n${i}`, estimate: { kind: "code", lines: 10 } });
    change(x, n.worktree, lines, files, `n${i}`);
    const r = await x.merge({ branch: n.branch });
    assert.notEqual(r.reason, "size", `local-first ${lines} lines in ${files} files: ${r.detail}`);
    // legacy local mode (a branch without a node): refused above maxDiffLines/maxDiffFiles, as before
    const b = await x.start(`b${i}`);
    change(x, b.worktree, lines, files, `b${i}`);
    const l = await x.merge({ branch: b.branch });
    assert.equal(l.reason === "size", lines > g.maxDiffLines || files > g.maxDiffFiles, `legacy ${lines} lines in ${files} files: ${l.reason} ${l.detail}`);
  }
});

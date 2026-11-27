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

const bytes = (s: string): number => Buffer.byteLength(s, "utf8");
const lines = (n: number, tag: string): string => Array.from({ length: n }, (_, k) => `export const ${tag}${k} = ${k};\n`).join("");

test("SIZE-8", async () => {
  const cap = 6000, x = nodeRig({ localFirst: { overCapBytes: cap }, mergeGate: { extraChecks: ["echo check-output-marker"] } });
  // 900 lines: one risky file (riskGlobs `**/auth/**`), then three by size
  // (the risky file makes it elevated: the branch check is not vacuous, the orthogonal check of REV-3)
  const n = await x.node({ slug: "big", check: "test -f src/auth/login.ts", estimate: { kind: "code", lines: 100 } });
  const files: Array<[string, number]> = [["src/auth/login.ts", 60], ["src/big.ts", 500], ["src/mid.ts", 240], ["src/small.ts", 100]];
  for (const [p, k] of files) { mkdirSync(dirname(join(n.worktree, p)), { recursive: true }); writeFileSync(join(n.worktree, p), lines(k, "v")); }
  x.r.git(["add", "-A"], n.worktree);
  x.r.git(["commit", "-q", "-m", "big"], n.worktree);
  const r = await x.merge({ branch: n.branch });
  assert.equal(r.status, "merged", r.detail);
  const a = x.reviews[0]!, input = a.input as string;
  assert.equal(a.overCap, true);
  assert.ok(bytes(input) <= cap, `${bytes(input)} > ${cap}`);
  for (const [p, k] of files) assert.ok(input.split("\n").includes(`${k}\t0\t${p}`), `numstat ${p}`);
  assert.ok(input.includes("check-output-marker"), "the check output");
  // the hunks: the risky file first, then by changed lines; what does not fit is left out
  const shown = input.split("\n").filter((l) => l.startsWith("diff --git a/")).map((l) => l.slice("diff --git a/".length).split(" ")[0]);
  assert.deepEqual(shown, ["src/auth/login.ts", "src/small.ts"], input);
  // the riskiest file's part alone above the cap: its head, cut, still within the cap
  const y = nodeRig({ localFirst: { overCapBytes: cap } });
  const m = await y.node({ slug: "risky", check: "test -f src/auth/a.ts", estimate: { kind: "code", lines: 100 } });
  mkdirSync(join(m.worktree, "src", "auth"), { recursive: true });
  writeFileSync(join(m.worktree, "src", "auth", "a.ts"), lines(400, "w"));
  y.r.git(["add", "-A"], m.worktree);
  y.r.git(["commit", "-q", "-m", "risky"], m.worktree);
  assert.equal((await y.merge({ branch: m.branch })).status, "merged");
  const ri = y.reviews[0]!.input as string;
  assert.ok(bytes(ri) <= cap, `${bytes(ri)} > ${cap}`);
  assert.ok(ri.includes("diff --git a/src/auth/a.ts") && ri.includes("… cut: the rest of src/auth/a.ts is not shown"), ri.slice(-300));
  assert.equal(y.reviews[0]!.overCap, true);
});

test("SIZE-8 never the diff budget's refusal", async () => {
  // 300 changed lines (large, not over) in scattered hunks: the diff exceeds the review's line budget → over-cap, not an error
  const x = nodeRig();
  x.r.commit("src/long.ts", lines(3000, "l"));
  const n = await x.node({ slug: "spread", estimate: { kind: "code", lines: 100 } });
  const body = lines(3000, "l").split("\n").map((l, i) => (i % 20 === 0 && i < 3000 ? `${l} // changed` : l)).join("\n");
  writeFileSync(join(n.worktree, "src", "long.ts"), body);
  x.r.git(["commit", "-q", "-am", "spread"], n.worktree);
  const r = await x.merge({ branch: n.branch });
  assert.equal(r.status, "merged", r.detail);
  assert.equal(x.reviews[0]!.overCap, true);
  // a diff within the budget: the plain review, no overCap
  const small = await x.node({ slug: "small", estimate: { kind: "code", lines: 10 } });
  x.r.commit("src/s.ts", lines(20, "s"), "small", small.worktree);
  assert.equal((await x.merge({ branch: small.branch })).status, "merged");
  assert.equal(x.reviews[1]!.overCap, undefined);
  assert.ok((x.reviews[1]!.input as string).includes("diff --git a/src/s.ts"));
});

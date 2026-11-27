// Local-first plan LF3.T1 (spec NR-6, design §5.9, D60): the strategy parts sit behind one seam. The mechanism reaches
// them only through `Strategy` (`core/strategy/types.ts`), composed once in `local-first.ts`; `arms.ts` is the registry
// and `assign`. A strategy file imports nothing outside `core/strategy/` but `node:crypto` and `../types.ts` (pure).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { localFirst } from "../core/strategy/local-first.ts";
import { defaults } from "../core/settings.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRATEGY = "core/strategy";
/** Production sources: the package's `.ts` files outside `test/` (a test reaches a part directly to unit-test it). */
const sources = (dir = ROOT): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  const p = join(dir, d.name);
  if (d.isDirectory()) return d.name === "test" || d.name === "node_modules" ? [] : sources(p);
  return d.name.endsWith(".ts") ? [relative(ROOT, p)] : [];
});
/** Every module a file names (static, bare and dynamic imports); relative ones resolved against the file. */
const importsOf = (file: string): string[] => {
  const src = readFileSync(join(ROOT, file), "utf8");
  const specs = [...src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map((m) => m[1]!);
  return specs.map((s) => (s.startsWith(".") ? relative(ROOT, resolve(ROOT, dirname(file), s)) : s));
};
const PARTS = ["breaker", "child", "classify", "context", "ladder", "points", "quota", "reviewer", "sessionTier", "tierBudget", "tierOfLines", "treeCaps"];

test("NR-6 imports", () => {
  const files = sources();
  assert.ok(files.includes(`${STRATEGY}/types.ts`) && files.includes(`${STRATEGY}/local-first.ts`), "the seam's two files exist");
  const open = new Set(["types.ts", "local-first.ts", "arms.ts"].map((f) => `${STRATEGY}/${f}`));
  const bad: string[] = [];
  for (const f of files) {
    const inside = f.startsWith(`${STRATEGY}/`);
    for (const i of importsOf(f)) {
      if (!inside && i.startsWith(`${STRATEGY}/`) && !open.has(i)) bad.push(`${f} imports ${i}`);
      if (inside && !i.startsWith(`${STRATEGY}/`) && i !== "node:crypto" && i !== "core/types.ts") bad.push(`${f} imports ${i}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("NR-6 one composition: localFirst(settings) is a Strategy with every part", () => {
  const s = localFirst(defaults()) as unknown as Record<string, unknown>;
  assert.deepEqual(Object.keys(s).sort(), PARTS);
  for (const p of PARTS) assert.equal(typeof s[p], "function", p);
});

test("the mechanism reads the tree caps with the session's arms (review lf56 nit: E6/E15 draw them)", () => {
  // the split's caps and the budgets line must agree once a factor draws the caps: never `treeCaps({})`
  const bad = sources().filter((f) => !f.startsWith(`${STRATEGY}/`) && /treeCaps\(\s*\{\s*\}\s*\)/.test(readFileSync(join(ROOT, f), "utf8")));
  assert.deepEqual(bad, []);
});

// Local-first plan LF4.T12 (spec TREE-6, PRO-10 b; S34b): in a local-first session the spawn policy places a `package` card by
// the tree (the start member, the node's worktree, the package contract in the brief, `meta.node`), a `t2` package card on the
// cloud route as an open-ended contact, and a card without `package` by its kind's `localFirst.placement`. Real git.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PolicyResult } from "../core/api.ts";
import type { SplitPlan } from "../core/local/tree.ts";
import { accepted, card, harness, provideSkills } from "./harness.ts";
import { treeRig } from "./tree-rig.ts";
import { MERGE_REASON } from "../core/local/gitcmd.ts";

type Placed = Extract<PolicyResult, { model: string }>;
const QWEN = "llama/qwen3.8";
const ROOT = { slug: "auth", goal: "add a login", check: "true", estimate: { kind: "plan", lines: 0 } };
const PLAN: SplitPlan = { summary: "two packages", children: [
  { slug: "form", goal: "build the login form", files: ["src/form/**", "test/form.test.ts"], estimate: { lines: 60, kind: "code" }, check: "npm test -- form", forbidden: ["src/db/**"] },
  { slug: "docs", goal: "document it", files: ["docs/login.md"], estimate: { lines: 0, kind: "inert" }, check: "true" },
] };

async function packaged(settings?: Record<string, unknown>) {
  const s = treeRig(settings);
  provideSkills(s.h, ["tdd-implementation-planner", "code-reviewer"]);
  await s.start(ROOT);
  assert.equal((await s.call("split", PLAN as never)).isError, undefined);
  const form = await s.start({ parent: "auth", child: "form" });
  assert.equal(form.isError, undefined, form.content[0]!.text);
  return { s, worktree: form.details.worktree as string };
}
const spawn = async (h: ReturnType<typeof harness>, name: string, task: unknown) => await h.a.spawn({ name, task } as never);

test("TREE-6", async () => {
  const { s, worktree } = await packaged();
  // a package card: the start member, the node's worktree, the contract, meta.node
  const r = accepted(await spawn(s.h, "p1", card({ kind: "implement", files: ["src/form/a.ts"], package: "auth.form" } as never))) as Placed;
  assert.equal(r.model, QWEN);
  assert.equal(r.cwd, worktree);
  assert.deepEqual([(r.meta as Record<string, unknown>).node, (r.meta as Record<string, unknown>).contact], ["auth.form", undefined]);
  const brief = r.briefAppend!.split("\n");
  for (const l of ["Package auth.form: your contract.", "- goal: build the login form", "- files: src/form/**, test/form.test.ts",
    "- budget: 60 changed lines (code)", "- check: npm test -- form", "- forbidden: src/db/**"]) assert.ok(brief.includes(l), `${l}\n---\n${r.briefAppend}`);
  // a t2 package card: the cloud route, an open-ended contact, still in the node's worktree under its contract
  const t2 = accepted(await spawn(s.h, "p2", card({ package: "auth.form", t2: ["security"] } as never))) as Placed;
  assert.notEqual(t2.model, QWEN);
  assert.equal(t2.cwd, worktree);
  assert.deepEqual([(t2.meta as Record<string, unknown>).node, (t2.meta as Record<string, unknown>).contact], ["auth.form", "open"]);
  assert.ok(t2.briefAppend!.split("\n").includes("- goal: build the login form"));
  // refused: an unknown node, a node that is not active (split), a node that is no package (the request node)
  const why = async (pkg: string) => { const x = await spawn(s.h, `x-${pkg}`, card({ package: pkg } as never)); assert.ok("reject" in x, pkg); return x.reject; };
  assert.equal(await why("nope"), "package nope: unknown node");
  assert.equal(await s.h.router.tree.apply({ op: "state", node: "auth.form", state: "blocked" }), undefined);
  assert.equal(await why("auth.form"), "package auth.form: the node is blocked, not active");
  assert.equal(await s.h.router.tree.apply({ op: "state", node: "auth.form", state: "active" }), undefined);
  const lone = await s.start({ parent: "auth", slug: "lone", goal: "g", check: "true", estimate: { kind: "code", lines: 5 } });
  assert.equal(lone.isError, undefined, lone.content[0]!.text);
  assert.equal(await why("auth.lone"), "package auth.lone: the node is no package of a split (start it with start_branch({parent, child}))");
  // a card field of the wrong type is a card error
  const bad = await spawn(s.h, "x-bad", card({ package: 3 } as never));
  assert.ok("reject" in bad && bad.reject.includes("package: expected string"), JSON.stringify(bad));
});

test("PRO-10 b", async () => {
  const { s } = await packaged();
  // a local kind: the start member, ungated
  const scout = accepted(await spawn(s.h, "k1", card({ kind: "scout", files: ["src/a.ts"] }) as never)) as Placed;
  assert.equal(scout.model, QWEN);
  assert.equal((scout.meta as Record<string, unknown>).ungated, true);
  // a cloud kind and a t2 card: today's planning, as a cloud-first session places them
  const cf = harness();
  provideSkills(cf, ["tdd-implementation-planner", "code-reviewer"]);
  for (const [name, c] of [["k2", card({ kind: "review", files: ["src/a.ts"] })], ["k3", card({ kind: "scout", t2: ["security"] })]] as const) {
    const lf = accepted(await spawn(s.h, name, c as never)) as Placed, today = accepted(await spawn(cf, name, c as never)) as Placed;
    assert.deepEqual([lf.model, lf.thinkingLevel, (lf.meta as Record<string, unknown>).ungated], [today.model, today.thinkingLevel, undefined], name);
  }
  // cloud-first: a package card is placed as today (the field is ignored), no ungated mark
  const ignored = accepted(await spawn(cf, "k4", card({ kind: "scout", package: "auth.form" } as never))) as Placed;
  const plain = accepted(await spawn(cf, "k5", card({ kind: "scout" }) as never)) as Placed;
  assert.deepEqual([ignored.model, ignored.cwd, (ignored.meta as Record<string, unknown>).node, (ignored.meta as Record<string, unknown>).ungated], [plain.model, plain.cwd, undefined, undefined]);
});

test("R26", async () => {
  const { s, worktree } = await packaged();
  const r = accepted(await spawn(s.h, "p1", card({ package: "auth.form" } as never))) as Placed;
  const g = (command: string) => r.toolGuard!("bash", { command });
  // a package child never reaches a remote: push, remote and the other remote commands are refused, naming the command
  for (const [cmd, sub] of [["git push origin lm/auth.form", "push"], ["git remote add up https://x.invalid/r.git", "remote"],
    [`git -C ${worktree} fetch`, "fetch"], ["git status && git pull --rebase", "pull"], ["git ls-remote origin", "ls-remote"]] as const) {
    const why = await g(cmd);
    assert.ok(typeof why === "string" && why.includes(`git ${sub}`), `${cmd}: ${why}`);
  }
  // its work in its worktree is not
  for (const cmd of ["git status", "git add -A", "git commit -qm 'form'", `git -C ${worktree} diff`, "npm test"]) assert.equal(await g(cmd), undefined, cmd);
  // review M3: only local git subcommands run; the review's probes (aliases, computed subcommands, git's remote-reaching
  // subcommands and helpers, the forges' and the remote copy tools) are refused by the package guard
  for (const cmd of ["git -c alias.p=push p origin x", "git p", "git config alias.p push", "git $(echo push)", "c=push; git $c origin",
    "echo push | xargs git", "git submodule update --remote", "git subtree push --prefix=x origin y", "git lfs push origin x",
    "git send-email x.patch", "git archive --remote=https://x.invalid/r.git HEAD", "gh pr create", "gh repo sync", "glab mr create",
    "hub push", "ssh x.invalid", "scp a x.invalid:b", "rsync -a . x.invalid:r", "git -c core.fsmonitor=./x.sh status",
    "git --exec-path=./bin status", "git rebase -x ./push.sh lm/auth", "git rebase -ix ./push.sh lm/auth", "git grep -O./push.sh x", "/usr/lib/git-core/git-push origin x", "$(echo gh) pr create",
    "bash -c 'gh pr create'", "echo x | xargs gh pr create", "git status; git worktree add ../w"]) {
    const why = await g(cmd);
    assert.ok(typeof why === "string" && why.includes("(R26)"), `${cmd}: ${why}`);
  }
  // the local git work of a package (package.ts LOCAL_GIT), with a -c that runs nothing
  for (const cmd of ["git log --oneline -3", "git show HEAD", "git restore x", "git checkout -- x", "git branch -a", "git rev-parse HEAD",
    "git ls-files", "git grep -n foo", "git stash", "git reset --hard", "git mv a b", "git rm a", "git merge-base HEAD lm/auth",
    "git cat-file -p HEAD", "git blame x", "git -c user.name=u -c user.email=u commit -qm x", "git rebase lm/auth"]) {
    assert.equal(await g(cmd), undefined, cmd);
  }
  // a filter, not a boundary: a script or a program the child writes and runs is not read (docs/task-router.md: the sandbox
  // and children without credentials are the boundary)
  for (const cmd of ["bash ./push.sh", "make push", "curl -s https://x.invalid"]) assert.equal(await g(cmd), undefined, cmd);
  // a child that is no package keeps today's guard: no remote rule
  const plain = accepted(await spawn(s.h, "p2", card({ kind: "review" }))) as Placed;
  assert.equal(await plain.toolGuard?.("bash", { command: "git fetch" }), undefined);
});

test("TREE-13", async () => {
  const { s, worktree } = await packaged();
  const r = accepted(await spawn(s.h, "p1", card({ package: "auth.form" } as never))) as Placed;
  // below the depth cap: submit_split and the do-or-split rule
  assert.deepEqual(r.childTools?.map((t) => t.name), ["submit_split"]);
  const rule = r.briefAppend!.split("\n").filter((l) => l.startsWith("Do or split:"));
  assert.equal(rule.length, 1, r.briefAppend);
  assert.ok(rule[0]!.includes("submit_split"), rule[0]);
  const tool = r.childTools![0]!;
  // an invalid split: an error to resubmit, nothing written
  const before = s.ops().length;
  const bad = await tool.execute({ summary: "x", children: [] });
  assert.deepEqual([bad.isError, bad.terminate], [true, undefined], bad.text);
  assert.equal(s.ops().length, before);
  // a valid one: committed on the node's branch, op split, the node split, the child ends, one message to the main naming the node
  const plan = { summary: "the form in two", children: [
    { slug: "fields", goal: "the fields", files: ["src/form/fields.ts"], estimate: { lines: 30, kind: "code" }, check: "true" },
    { slug: "submit", goal: "the submit button", files: ["src/form/submit.ts"], estimate: { lines: 25, kind: "code" }, check: "true" }] };
  const ok = await tool.execute(plan);
  assert.deepEqual([ok.isError, ok.terminate], [undefined, true], ok.text);
  assert.deepEqual(s.ops().slice(before).map((o) => [o.op, o.node]), [["split", "auth.form"]]);
  assert.equal(s.h.router.tree.tree().nodes["auth.form"]!.state, "split");
  const file = `${s.h.router.settings.plans.dir}/split/auth.form.json`;
  assert.equal(JSON.parse(s.r.git(["show", `lm/auth.form:${file}`])).node, "auth.form");
  assert.equal(s.r.git(["status", "--porcelain"], worktree), "");
  const msgs = s.h.f.sent.filter((m) => String(m.msg?.customType).startsWith("task-router/"));
  assert.equal(msgs.length, 1, JSON.stringify(s.h.f.sent));
  assert.ok(String(msgs[0]!.msg.content).includes("auth.form"), msgs[0]!.msg.content);
  assert.deepEqual(s.h.lines().filter((l) => l.event === "split").map((l) => [l.taskId, l.reason, l.children, l.depth]),
    [["auth", "choice", 2, 0], ["auth.form", "choice", 2, 1]]);
  // the main starts the children of the child's split
  assert.equal((await s.start({ parent: "auth.form", child: "fields" })).isError, undefined);
  // at the cap: neither the tool nor the rule
  const cap = await packaged({ profile: "local-first", localFirst: { experimental: true, tree: { maxDepth: 1 } } });
  const at = accepted(await spawn(cap.s.h, "p2", card({ package: "auth.form" } as never))) as Placed;
  assert.equal(at.childTools, undefined);
  assert.ok(!at.briefAppend!.includes("Do or split") && !at.briefAppend!.includes("submit_split"), at.briefAppend);
});

// Review m4: the main's split and the child's submit_split of the same node at once: one commits and splits the node, the other
// is refused; the tree's plan is the committed file's, one split op, one split line.
test("TREE-13 concurrent splits", async () => {
  const { s } = await packaged();
  const r = accepted(await spawn(s.h, "p1", card({ package: "auth.form" } as never))) as Placed;
  const kid = (slug: string) => ({ slug, goal: `the ${slug}`, files: [`src/form/${slug}.ts`], estimate: { lines: 20, kind: "code" }, check: "true" });
  const before = s.ops().length;
  const [main, child] = await Promise.all([s.call("split", { node: "auth.form", summary: "main's", children: [kid("a")] }),
    r.childTools![0]!.execute({ summary: "child's", children: [kid("b"), kid("c")] })]);
  assert.deepEqual([main.isError === true, child.isError === true].sort(), [false, true], `${main.content[0]!.text} | ${child.text}`);
  const file = `${s.h.router.settings.plans.dir}/split/auth.form.json`;
  const committed = JSON.parse(s.r.git(["show", `lm/auth.form:${file}`]));
  assert.equal(s.h.router.tree.tree().nodes["auth.form"]!.split!.summary, committed.summary);
  assert.deepEqual(s.ops().slice(before).map((o) => [o.op, o.node]), [["split", "auth.form"]]);
  assert.equal(s.h.lines().filter((l) => l.event === "split" && l.taskId === "auth.form").length, 1);
});

// Review m8 (TREE-7 f, a child's guard): a routed child's git guard protects the open parent as the main's does.
test("TREE-7 guard: a child's", async () => {
  const { s, worktree } = await packaged();
  const parent = s.h.router.tree.tree().nodes.auth!;
  const r = accepted(await spawn(s.h, "p1", card({ package: "auth.form" } as never))) as Placed;
  assert.equal(await r.toolGuard!("bash", { command: `git -C ${parent.worktree} commit -qm x` }), MERGE_REASON(parent.branch));
  assert.equal(await r.toolGuard!("bash", { command: `git -C ${worktree} commit -qm x` }), undefined);
  const plain = accepted(await spawn(s.h, "p2", card({ kind: "implement", files: ["src/a.ts"] }))) as Placed;
  assert.equal(await plain.toolGuard!("bash", { command: `git -C ${parent.worktree} merge lm/auth.form` }), MERGE_REASON(parent.branch));
});

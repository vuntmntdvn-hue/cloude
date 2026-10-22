# How I work — global instructions

Copy to `~/.claude/CLAUDE.md` on a new machine. Project-specific rules go in
each repo's own `CLAUDE.md`; this file is how I work everywhere.

## The loop: propose → "do it" → edit → report → stop

- **Propose before any edit, even a small one.** Restate what I want in 3–5
  bullets, list edge cases and open questions, propose the smallest
  implementation, then wait for an explicit go-ahead ("do it", "go").
  Reading, searching and probing are fine before that; edits are not.
- **A question is not a go-ahead.** If I ask something mid-task, answer it;
  it doesn't approve or withdraw anything.
- **No reply buttons, ever.** When the app offers an end-of-turn summary
  box, send the recap alone — no question, no buttons — and ask any
  question in the reply's plain text. Text you drafted for me (an old
  button's message, a suggested reply) is never my "do it"; edits wait for
  my own words.
- **When I ask for a plan, write the plan out** in the reply before the turn
  ends, then wait.
- **Lead the proposal with what stays the same** when the change is near a
  hot path (startup, video loading, anything performance-sensitive): show
  that the normal path gets no new await, call or lookup, and put new logic
  on the failure path only.
- **Recommend; don't survey.** Give me one option you'd pick and why. Name
  alternatives only when they're real.
- **After editing: report what changed, then stop.** List anything you
  couldn't verify and anything I have to do by hand (Xcode/macOS, Play
  Console, App Store Connect, Firebase Console, a physical device), and leave
  `// TODO(human): …` breadcrumbs in the code for those.

## Git

- **Never commit or push on your own.** Only on an explicit "commit" or
  "push". "Looks good" / "nice" / "now do X" is not one. While iterating on
  a design: one commit at the end, not one per tweak.
- **Conventional Commits, English only:** `type(scope): imperative summary`
  (lower-case, ≤ 72 chars, identifiers in backticks), a body that explains
  *why*, and a `Co-Authored-By: Claude …` trailer. PR titles and bodies in
  English too.
- **I often run parallel sessions in the same working tree.** Before a
  commit: `git status`, `git diff --cached --name-status`, and read every
  shared file's diff for hunks that aren't yours. Commit only your own paths
  (`git commit -F msg -- <paths>`); never `git add -A` / `commit -a`. When a
  file holds both sessions' hunks, build the commit in a private index
  (`GIT_INDEX_FILE=<scratch>/idx git read-tree HEAD`, `git apply --cached`
  with `-U3` context, then commit with that variable set) — never stage into
  the shared index, even for a moment. Don't pipe patches through text-mode
  Python on Windows (CRLF).
- Work on the branch the team works on (e.g. `dev`); release branches are
  merged by someone else — read them, don't edit them.

## Builds, analysis, reviews, tests

- **No builds unless I ask in that very message.** An earlier "build it"
  doesn't cover later changes — finish, analyze, report, and offer the build
  in one line. If a build was started by mistake, kill the whole process
  tree (Gradle keeps running otherwise).
- **Builds run at low priority** so the PC doesn't lag: through
  `~/.claude/skills/low-priority-build/` (below-normal priority, 4 Gradle
  workers, no daemon), in the background. Two in parallel is fine. Copy each
  output under a name that says its branch/feature before sending it.
- **"Build it so I can see it" means implement it and make it reachable on
  my phone** (a Dev tools / debug-menu entry for anything hard to reach),
  not run the app for me. I preview UI and motion on the device myself; tell
  me what to look at and which constants to tune.
- **Verify with the analyzer in the terminal** (`dart analyze`) plus a
  careful read of the diff. Don't use an MCP analyze tool (it hangs); skip it
  if it doesn't finish in reasonable time. Format only the files you edited.
- **No unprompted reviews.** Don't run reviewer agents before handing off —
  only when I ask.
- **Tests:**
  - **Never UI tests** (widget, golden, integration, E2E) — not written, not
    proposed.
  - **Data layer and domain services:** unit tests are a must and come with
    the change without asking (DTO mapping, repositories, services with
    logic, DAOs on an in-memory DB).
  - **Feature code** (cubits, page logic, shared feature helpers): when a
    change adds or changes logic a unit test can cover, name the unit tests
    you'd add and ask whether to add them. Never skip them silently, never
    add them without a yes. The logic decides, not the folder the class
    sits in.
  - During a UI fine-tune pass, defer tests broken by the churn and fix
    them once at the end.

## Subagents and workflows

- **Ask which model before every subagent**, suggest one with a one-line
  reason, then pass it as `model`. One question can cover several agents
  launched together. Audits, gap analysis and probing a live API → haiku;
  verify their high-severity findings yourself before reporting.
- **Simple audits: answer directly.** No multi-agent workflow for a small
  task — too slow.
- **Every editing prompt to an agent quotes my go-ahead verbatim**, with
  date and branch ("The user approved building this on feature/x: '…'. A
  later question in chat does not withdraw it."). Agents apply
  propose-then-code to my latest message and will otherwise refuse.

## Editing style

- **Code goes through Edit / Write.** Find-and-replace scripts only for
  broad *meaningless* sweeps (a rename, a wording change, the same line in
  many files) — never to write a feature. Put such a script in the
  scratchpad, assert the old text exists before replacing, format after.
- **Conservative cleanups.** No sweeping lint fixes, no whole-tree format, no
  deleting "unused" code that may be someone's work in progress.
- **Match the surrounding code**: its naming, comment density and idiom.
- **Every TODO / FIXME you add is tagged `TODO(vuntm): …`.** `TODO(human)`
  is for steps that need a person (a device, a console).
- **User-facing text is localized in the same change** — every locale file.
  Hard-coded copy is unfinished work.
- **Shared widgets get generic names** matching their scope; when a second
  consumer appears, rename the class *and* the file.
- **Name contracts generically, implementations after their source**
  (`VideoSdk` → `ByteplusSdkWrapper`, `*Dto`). Layering is by folder:
  `domain/` (what the app is, grouped by concept) vs `data/` (one folder per
  outside source); dependencies point inward.

## UI and design

- **User-facing controls need extra care** (close buttons, CTAs, back
  navigation): trace every code path. A guard flag read by both a handler
  and `PopScope` can self-cancel (`maybePop()` goes through the pop scope;
  `pop()` doesn't).
- **For visual glitches (flashes, flicker), offer a blanket fix early** —
  one that covers the likely causes — rather than a long root-cause hunt. Go
  deeper only if it doesn't work.
- **From Figma take colours, text styles and measurements only.** Layer
  order, what a dim covers, and behaviour stay as built unless I ask.
  Propose a Figma-vs-built table first; change shared components only on a
  go-ahead. A Figma token lives in a gitignored file and is never echoed.
- **One value app-wide, no per-screen overrides** unless I ask (e.g. empty /
  error blocks sit ~40% down the page in every screen).
- **Interaction choices are mine** — e.g. ask whether long press should start
  select mode on any new select-mode UI before wiring it.
- Motion: skip it under the OS reduce-motion setting; timing lives in one
  motion-constants file; use the shared animation widgets, don't hand-roll.
- Theme tokens for colours and text styles (one token per meaning, even if
  two hexes match); SVG assets over icon fonts unless asked.

## Backends and contracts

- **The live server is the truth**, not the spec file or a local snapshot of
  the backend. Probe it cheaply before claiming something is unbuilt (a
  route that exists answers `401` without a token, one that doesn't `404`)
  and say which source a claim was checked against.
- **Backend code I don't own is read-only.** Every backend want decided in
  chat goes into the API contract (the OpenAPI yaml) *in the same change*,
  as the requirement itself — the rule, the shape, the limit, the why — and
  bumps `info.version`. The yaml is the message to the backend dev: no
  separate note to paste.
- **The contract is evergreen**: it says what the app wants, never what the
  backend has built — no "not built yet", "checked on <date>", status
  sections. Removing stale ones is fine.
- **The app is in production**: every backend ask must be additive and
  invisible to builds already on phones.
- Pagination is one page at a time; never loop through every page.

## Memory and docs

- **Keep `CLAUDE.md` current as decisions land**: dated ("since 2026-10-15"),
  with the why and "the user's call" where it was mine, so a new session
  doesn't re-litigate it.
- Save feedback I give (corrections *and* approaches I confirm) to memory
  with **Why** and **How to apply**; update an existing memory rather than
  adding a duplicate.
- Chat replies in English. Plain words; no hype.

## Secrets

- Never in git: tokens, keystores, `key.properties`, API keys. Tokens go in
  secure storage, never SharedPreferences. Client-shipped configuration
  (server URLs, public SDK ids) may live in code — say so in the docs.

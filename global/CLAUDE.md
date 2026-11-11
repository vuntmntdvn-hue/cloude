# How I work — global instructions

Linked from `~/.claude/CLAUDE.md` on each machine. Project-specific rules go
in each repo's own `CLAUDE.md`; this file is how I work everywhere.

Rules for one kind of work, in `rules/` next to this file and linked into
`~/.claude/rules/`, load only once a matching file is read:

- `rules/flutter-app.md` — Flutter apps and their backends: builds to the
  phone, `dart analyze`, localization, naming and layering, UI and Figma,
  API contracts.

## The loop: propose → "do it" → edit → report → stop

- **Propose before any edit, even a small one**, then wait for an explicit
  go-ahead ("do it", "go"). Reading, searching and probing are fine before
  that; edits are not.
- **One block per problem** (or per goal), headed `### I. <name>`,
  `### II. <name>` …, with a `---` line between blocks, so each new block
  stands out and reads top to bottom on its own. A block has only the
  parts it needs, in this order; leave out the empty ones:
  - **Cause** — what's wrong and why, and how sure you are: checked
    (against what) or a guess. For new work, **Goal**: what I asked for.
  - **Fix** — opens with the direction in a sentence or two: what will be
    different afterwards and the approach, before any file or diff. Then
    the smallest fix you'd pick and why it answers the cause: the files
    and what changes in each, what stays the same, edge cases,
    the tests that come with it. Questions the fix hangs on go right here,
    each with the option you'd pick, numbered across the whole reply
    (1, 2, 3 …).
  - **Test** — what I run or open, and what a pass and a fail look like.
  - **Need from you** — access, console or device steps, each with what it
    unblocks.
- **Show the code.** When the cause or fix is in code, quote it: the lines
  at fault under **Cause**, the change as a short diff under **Fix**, each
  with its `file:line`. Only the lines that matter, not whole functions.
- **Nothing to decide → keep it short:** a sentence or two per part, plus
  its snippet.
- **End with one line** saying what starts the work: "do it", or answers
  to 1–3.
- **Answering every numbered question is a go-ahead** when each answer picks
  an option the proposal offered. An answer outside them, or a new request
  added to the answers, means restate the plan and wait.
- **A question is not a go-ahead.** If I ask something mid-task, answer it;
  it doesn't approve or withdraw anything.
- **No reply buttons, ever.** When the app offers an end-of-turn summary
  box, send the recap alone — no question, no buttons — and ask any
  question in the reply's plain text. Text you drafted for me (an old
  button's message, a suggested reply) is never my "do it"; edits wait for
  my own words.
- **When I ask for a plan, write the plan out** in the reply before the turn
  ends, then wait.
- **Say what stays the same first** when the change is near a hot path
  (startup, video loading, anything performance-sensitive): it follows the
  direction in the **Fix**, showing that the normal path gets no new await,
  call or lookup, and new logic goes on the failure path only.
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
- **On Windows, commit and push from Git Bash, not PowerShell.** Windows
  PowerShell 5.1 doesn't escape `"` inside an argument it passes to `git`, so
  a message that quotes something is split into extra arguments, which git
  reads as file names. Commit with the message on stdin —
  `git commit -F - <<'EOF'` … `EOF` — and push from Git Bash too: its GitHub
  sign-in can work where PowerShell's fails ("terminal prompts disabled").
  A hook in the kit refuses both in PowerShell.
- Work on the branch the team works on (e.g. `dev`); release branches are
  merged by someone else — read them, don't edit them.

## Builds, analysis, reviews, tests

- **No builds unless I ask in that very message.** An earlier "build it"
  doesn't cover later changes — finish, analyze, report, and offer the build
  in one line. If a build was started by mistake, kill the whole process
  tree (Gradle keeps running otherwise).
- **Builds run at low priority** so the PC doesn't lag: through
  `~/.claude/skills/low-priority-build/` (below-normal priority, 4 Gradle
  workers, no daemon), in the background. Two in parallel is fine on a large
  machine; the skill's size note says when to cap them. Copy each output
  under a name that says its branch/feature before sending it.
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

- **Pick each subagent's model yourself** and pass it as `model`, naming it
  with a one-line reason as you launch. Audits, gap analysis and probing a
  live API → haiku; verify their high-severity findings yourself before
  reporting.
- **Simple audits: answer directly.** No multi-agent workflow for a small
  task — too slow.
- **Every editing prompt to an agent quotes my go-ahead verbatim**, with
  date and branch ("The user approved building this on feature/x: '…'. A
  later question in chat does not withdraw it."). Agents apply
  propose-then-code to my latest message and will otherwise refuse.
- **Side sessions: one session orchestrates, side sessions do the work.**
  When I ask in words ("start a session for X", "split this off"), start
  it at once.
  - **Base every side session on the branch the team works on**: the one
    the project's `CLAUDE.md` names (`dev` in some repos, `main` in
    others), else the one this session is on. Name it explicitly when
    starting the session: left out, the session starts from the repo's
    default branch, which may not be that one.
  - **I approve in the side session itself.** It proposes and waits for my
    "do it" there; the orchestrator never passes its own judgement off as
    my approval.
  - **Its work lands on that same branch directly:** it commits on my
    "commit" in that session and, on my "push", pushes straight to it
    (rebased onto the remote branch first) — no PR or merge in between,
    unless the project's `CLAUDE.md` asks for pull requests.
  - **The orchestrator splits the work so no two sessions edit the same
    files**, runs device tests and heavy builds one session at a time,
    checks each pushed result before telling me it's done, and clears the
    worktrees and emulators nothing needs any more.

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

## Design

- **New and changed code follows SOLID and clean code:**
  - One reason to change per class and function; split one whose name
    needs an "and".
  - Depend on contracts where things vary (data sources, SDKs, the
    platform), not on concrete classes. No interface for a class with one
    implementation and no test that needs to swap it.
  - Extend with new types or parameters, not branches on a type flag.
  - Names say what a thing is for; small functions; early returns over
    nesting; named constants, no magic numbers; comments say why, not what;
    no dead or commented-out code.
  - Extract duplication on the third copy, not the second.
- **Scope is the code the change touches.** Untouched code that breaks
  these goes in the proposal as a separate follow-up, never into the same
  change. Where they clash with the code around it, match that code and say
  so.
- **Folder structure is the project's call** (feature-first, layer-first or
  other): follow its `CLAUDE.md`, or the existing tree.
- **Name the principle in the Fix** when it shaped the design
  (e.g. a new contract so the player doesn't depend on the disk cache).

## Memory and docs

- **Where new knowledge goes:**
  - **`CLAUDE.md`** keeps only what every session needs: the stack, the
    working rules, an index of the areas.
  - **Detail about one area** goes into its own rule file,
    `.claude/rules/<area>.md`, with `paths:` frontmatter for its source and
    test folders, so it loads only when those files are read. A new area
    gets a new file and a line in `CLAUDE.md`'s index. When `CLAUDE.md`
    grows past what every session needs, split it this way.
  - **Memory** is for what isn't the project's own fact: personal
    preferences and how to work with me. It stays on one machine and out of
    git, so a project fact goes into a rule file instead, where the team and
    every machine get it.
- **Docs state current facts only**: what the code does now — no history,
  "since <date>" or "changed from" notes, decision logs or plans. When a doc
  drifts, rewrite the part as current fact; git history is the record. A
  rule may keep its *why* in a clause, so nobody re-litigates it.
- Save feedback I give (corrections *and* approaches I confirm) to memory
  with **Why** and **How to apply**; update an existing memory rather than
  adding a duplicate.
- Chat replies in English. Plain words; no hype.

## Secrets

- Never in git: tokens, keystores, `key.properties`, API keys. Tokens go in
  secure storage, never SharedPreferences. Client-shipped configuration
  (server URLs, public SDK ids) may live in code — say so in the docs.

---
paths:
  - "**/*.dart"
  - "**/pubspec.yaml"
  - "**/*.arb"
  - "**/openapi*.yaml"
  - "**/openapi*.yml"
---

# Flutter app work

These add to `~/.claude/CLAUDE.md` for Flutter apps and their backends. They
load once a Dart, pubspec, ARB or OpenAPI file is read.

## Builds and analysis

- **"Build it so I can see it" means implement it and make it reachable on
  my phone** (a Dev tools / debug-menu entry for anything hard to reach),
  not run the app for me. I preview UI and motion on the device myself; tell
  me what to look at and which constants to tune.
- **Verify with the analyzer in the terminal** (`dart analyze`) plus a
  careful read of the diff. Don't use an MCP analyze tool (it hangs); skip it
  if it doesn't finish in reasonable time. Format only the files you edited.

## Editing style

- **User-facing text is localized in the same change** — every locale file.
  Hard-coded copy is unfinished work.
- **Shared widgets get generic names** matching their scope; when a second
  consumer appears, rename the class *and* the file.
- **Name contracts generically, implementations after their source**
  (`VideoSdk` → `ByteplusSdkWrapper`, `*Dto`). Unless the project's
  `CLAUDE.md` sets its own folder structure, layering is by folder:
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

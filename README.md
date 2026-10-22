# claude-portable — set up Claude Code the way vuntm works

This repo copies the user's Claude Code workflow onto a new machine
(Windows with Git Bash, or Linux; macOS works too). If you are an agent
setting it up: follow the steps in order, **ask before overwriting anything
that already exists**, and report what you installed and what you skipped.

Get it first (the commands below run from inside it):

```bash
git clone https://github.com/vuntmntdvn-hue/cloude.git ~/claude-portable
cd ~/claude-portable
```

## What's here and where it goes

| File | Goes to | What it is |
|---|---|---|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | Global instructions: how the user works (propose → "do it" → edit → report; no unasked commits or builds; tests; subagents; UI and backend habits). |
| `skills/low-priority-build/` | `~/.claude/skills/low-priority-build/` | A skill that runs long builds at low priority with capped Gradle workers, so the machine stays usable. `CLAUDE.md` refers to it. |
| `settings.hooks.json` | merged into `~/.claude/settings.json` | Two hooks, plus two preferences (below). |
| — | pub's global bin | **build_ntd**, the user's own Flutter build CLI. Not in this repo; installed from its own (step 6). |

`~` is the user's home folder: `C:\Users\<name>` on Windows (Git Bash shows it
as `/c/Users/<name>`), `/home/<name>` on Linux.

### The hooks

Both are `PreToolUse` hooks: they see a tool call before it runs.

- **On the `Agent` tool:** before any subagent starts, it turns the call into
  a permission prompt that reads *"Subagent Explore on model: haiku |
  <description>"*, or *"model: NOT SET (agent default / inherited)"*. The
  user approves or denies it. It backs up the `CLAUDE.md` rule "ask which
  model before every subagent". Nothing is blocked outright (`"ask"`, not
  `"deny"`).
- **On the `PowerShell` tool (Windows):** it refuses `git push` and a
  `git commit` with `-m` / `--message`, telling Claude to run them with the
  Bash tool (Git Bash) instead — Windows PowerShell 5.1 splits a message at
  the quotes inside it, and its push may have no GitHub sign-in. Everything
  else goes through untouched, `git commit -F <file>` included. On Linux and
  macOS there is no `PowerShell` tool, so it never runs.

The other two keys are preferences: `outputStyle: "Explanatory"` and
`effortLevel: "high"`. Ask the user whether they want them on this machine.

## 1. Install the prerequisites

- **Claude Code**, signed in.
- **`jq`**: the hook runs it. Without it, every subagent call errors.
  - Windows: `winget install jqlang.jq` (open a new shell afterwards).
  - Debian / Ubuntu: `sudo apt install jq` · Fedora: `sudo dnf install jq` ·
    Arch: `sudo pacman -S jq` · macOS: `brew install jq`.
- **Windows only: Git for Windows (Git Bash).** The build script uses its
  `bash`, `cygpath` and `cmd`. Claude Code's Bash tool on Windows is Git Bash
  already.
- **Linux:** `bash`, coreutils and `nice` are always there. `ionice` (in
  `util-linux`) is optional: the script uses it when present.
- For actual builds: Flutter and the Android SDK, set up as the projects need.
  They aren't part of this kit.

## 2. Copy the files

From this folder, in bash (Git Bash on Windows):

```bash
mkdir -p ~/.claude/skills
# CLAUDE.md: if ~/.claude/CLAUDE.md exists, show the user both and ask
# whether to replace it or merge them. Never overwrite it silently.
[ -e ~/.claude/CLAUDE.md ] || cp CLAUDE.md ~/.claude/CLAUDE.md
cp -r skills/low-priority-build ~/.claude/skills/
chmod +x ~/.claude/skills/low-priority-build/lowprio-build.sh
```

## 3. Merge the settings

Don't copy `settings.hooks.json` over `settings.json`: that would drop
whatever is there. Merge it. This keeps every existing key and **appends**
the hook to any `PreToolUse` hooks already there. (A plain `jq '.[0] * .[1]'`
would *replace* the array.)

```bash
cd ~/.claude
[ -f settings.json ] || echo '{}' > settings.json
cp settings.json settings.json.bak
jq -s '.[0] as $a | .[1] as $b
       | $a * ($b | del(.hooks))
       | .hooks.PreToolUse = (($a.hooks.PreToolUse // []) + $b.hooks.PreToolUse)' \
   settings.json ~/claude-portable/settings.hooks.json > settings.new \
  && mv settings.new settings.json
```

If the user doesn't want `outputStyle` / `effortLevel`, delete those keys
from `settings.json` afterwards. If the merge was run twice, the hooks appear
twice. Check that `.hooks.PreToolUse` holds one `"matcher": "Agent"` entry
and one `"matcher": "PowerShell"` entry.

## 4. Check each piece

- **Build script.** Run it on something harmless:
  ```bash
  bash ~/.claude/skills/low-priority-build/lowprio-build.sh -C ~ -l /tmp/lp.log -- echo hello
  tail -2 /tmp/lp.log    # → hello / EXIT 0
  ```
  On Linux, to see the priority took:
  `... -- sh -c 'nice; ionice -p $$'` should print `10` and
  `best-effort: prio 7` (the second only when `ionice` exists).
- **Agent hook.** In a new Claude Code session, ask for anything that spawns
  a subagent. A permission prompt naming the subagent and its model must
  appear. If the call errors instead, `jq` isn't on the PATH.
- **PowerShell hook (Windows).** Without a session, feed it a fake call — it
  prints a `deny` for a `git push`, and nothing for an allowed command:
  ```bash
  HOOK=$(jq -r '.hooks.PreToolUse[] | select(.matcher=="PowerShell") | .hooks[0].command' ~/.claude/settings.json)
  echo '{"tool_input":{"command":"git push"}}' | bash -c "$HOOK"
  echo '{"tool_input":{"command":"git status"}}' | bash -c "$HOOK"
  ```
- **CLAUDE.md.** In a new session, ask Claude to change some code. It should
  restate the request, list edge cases and wait for "do it" before editing.

## 5. Adjust for this machine

- **Build workers:** `SKILL.md` says two builds in parallel are fine on
  12 cores / 32 GB. On a smaller machine tell the user that, and use `-w 2`
  or one build at a time.
- **TODO tag:** `CLAUDE.md` tags new TODOs `TODO(vuntm)`. Keep it if the same
  person uses this machine.

## 6. build_ntd (optional — for Flutter Android builds)

[build_ntd](https://github.com/vuntmntdvn-hue/build_ntd) wraps
`flutter build apk/appbundle`: it names the artifact from a template
(`App941_short_drama_v1.0.0(1)_2026.10.17_14.30_dev_release.apk`), logs each
build with its commit and branch in `build_ntd_records.md`, and has `bump`,
`install` (adb) and `doctor` commands. The low-priority-build skill uses it
for any project whose `pubspec.yaml` has a `build_ntd:` section.

It needs the Dart SDK (comes with Flutter). Install from a clone, so a
private repo works with the machine's normal git sign-in:

```bash
git clone https://github.com/vuntmntdvn-hue/build_ntd.git ~/Repos/build_ntd
dart pub global activate --source=path ~/Repos/build_ntd
```

Then put pub's global bin folder on `PATH` if it isn't:

- Windows: `%LOCALAPPDATA%\Pub\Cache\bin` (user PATH; open a new shell). Pub
  writes `build_ntd.bat` there — Git Bash can't run it by name, but `cmd`,
  which the build script goes through on Windows, can.
- Linux / macOS: `export PATH="$PATH:$HOME/.pub-cache/bin"` in `~/.bashrc`
  (or your shell's rc file).

Check it: `build_ntd --help` (Windows: `cmd //c build_ntd --help` from Git
Bash), then `build_ntd doctor` from a project with a `build_ntd:` section.
To update: `git pull` in the clone, **then delete its cached snapshot**:

```bash
rm ~/Repos/build_ntd/.dart_tool/pub/bin/build_ntd/*.snapshot
```

The installed launcher runs that compiled copy whenever it exists, and only
rebuilds it when the Dart version changes — `git pull` and even running
`activate` again leave the old code running. Deleted, the next run compiles
the current source and caches it again (the first run prints pub's
dependency resolution). Check with `build_ntd apk --help`: the new build
ends with a note about extra flutter flags after `--`.

Optional extras it uses when present: `adb` on `PATH` for `build_ntd install`;
on Linux `wl-copy` or `xclip` for its clipboard copy (agent builds pass
`--no-copy` anyway).

## Not in this kit (on purpose)

- **Project rules** (`<repo>/CLAUDE.md`, `<repo>/.claude/rules/`, agents, project
  skills) travel with each repository. Clone the repo and they're there.
- **Memories** (`~/.claude/projects/<project>/memory/`) are per project and
  per machine. The habits worth keeping everywhere are already in `CLAUDE.md`.
- **Model, plugins, marketplaces, theme, notifications:** set them on the new
  machine through the app's own settings.
- **Secrets:** no tokens or keys are in this folder, and none should be added.

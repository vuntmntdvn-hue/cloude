#!/usr/bin/env bash
# Stops every build process of the current user, on Windows (Git Bash), Linux
# and macOS: java (Gradle and Kotlin daemons, Android tooling), dart and
# dartaotruntime (the flutter tool, flutter run), flutter_tester, and anything
# whose command line names a Gradle or Kotlin daemon.
#   - Spares the editor's Dart language server and the Dart MCP server unless
#     -a is given: killing them only makes the editor and Claude sessions lose
#     their Dart tools.
#   - Linux / macOS: SIGTERM first, so Gradle can release its locks under
#     ~/.gradle, then SIGKILL whatever is still running after 3 s.
#   - Windows: Stop-Process -Force straight away (console programs have no
#     gentle stop there), found through PowerShell, since only CIM shows a
#     process's command line.
#
# Usage:
#   kill-builds.sh [-a] [-n]
#     -a  kill the language server and MCP server too
#     -n  list what would be killed, kill nothing

set -euo pipefail

all=0
dry=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -a) all=1; shift ;;
    -n) dry=1; shift ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (use -a, -n)" >&2; exit 2 ;;
  esac
done

# Passed through the environment, not the awk / PowerShell program text, so the
# matcher's own command line never matches itself.
export KB_NAMES='java|dart|dartaotruntime|flutter_tester'
export KB_MARKERS='GradleDaemon|GradleWrapperMain|KotlinCompileDaemon'
export KB_SPARE='language-server|analysis_server|mcp-server'
export KB_ALL="$all" KB_DRY="$dry"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) ;;  # Windows: below, through PowerShell.
  *)
    # Each line: kill|spare <tab> pid <tab> command line (first 150 chars).
    pids=()
    while IFS=$'\t' read -r what pid cmd; do
      printf '%-6s %7s  %s\n' "$what" "$pid" "$cmd"
      if [[ "$what" == kill ]]; then pids+=("$pid"); fi
    done < <(ps -U "$(id -u)" -o pid= -o ucomm= -o args= | awk -v self="$$" '
      {
        pid = $1; exe = $2; cmd = $0
        sub(/^ *[0-9]+ +[^ ]+ +/, "", cmd)
        if (pid == self) next
        if (exe !~ ("^(" ENVIRON["KB_NAMES"] ")$") && cmd !~ ENVIRON["KB_MARKERS"]) next
        what = "kill"
        if (ENVIRON["KB_ALL"] != "1" && exe ~ /^dart/ && cmd ~ ENVIRON["KB_SPARE"]) what = "spare"
        print what "\t" pid "\t" substr(cmd, 1, 150)
      }')

    if [[ ${#pids[@]} -eq 0 ]]; then echo "nothing to kill"; exit 0; fi
    if [[ "$dry" == 1 ]]; then echo "dry run: killed nothing"; exit 0; fi

    kill -TERM "${pids[@]}" 2> /dev/null || true
    alive=()
    for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
      alive=()
      for p in "${pids[@]}"; do
        if kill -0 "$p" 2> /dev/null; then alive+=("$p"); fi
      done
      if [[ ${#alive[@]} -eq 0 ]]; then break; fi
      sleep 0.1
    done
    if [[ ${#alive[@]} -gt 0 ]]; then
      echo "still running after 3 s, forcing: ${alive[*]}"
      kill -KILL "${alive[@]}" 2> /dev/null || true
    fi
    echo "killed ${#pids[@]} process(es)"
    exit 0
    ;;
esac

# TODO(human): run `kill-builds -n` once on a Windows machine and check the list.
script="$(mktemp --suffix=.ps1)"
trap 'rm -f "$script"' EXIT
cat > "$script" <<'EOF'
$names = $env:KB_NAMES -split '\|' | ForEach-Object { "$_.exe" }
$kill = @()
Get-CimInstance Win32_Process | ForEach-Object {
  $name = "$($_.Name)".ToLower()
  $cmd = "$($_.CommandLine)"
  if (-not (($names -contains $name) -or ($cmd -match $env:KB_MARKERS))) { return }
  $what = 'kill'
  if ($env:KB_ALL -ne '1' -and $name -like 'dart*' -and $cmd -match $env:KB_SPARE) { $what = 'spare' }
  if ($cmd.Length -gt 150) { $cmd = $cmd.Substring(0, 150) }
  '{0,-6} {1,7}  {2}' -f $what, $_.ProcessId, $cmd
  if ($what -eq 'kill') { $script:kill += $_.ProcessId }
}
if ($kill.Count -eq 0) { 'nothing to kill'; exit 0 }
if ($env:KB_DRY -eq '1') { 'dry run: killed nothing'; exit 0 }
Stop-Process -Id $kill -Force -ErrorAction Continue
"killed $($kill.Count) process(es)"
EOF

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$script")"

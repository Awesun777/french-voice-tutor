#!/bin/bash
# One-shot overnight dictionary precompute on DeepSeek — scheduled 23:00,
# removes its own LaunchAgent when finished so it never fires twice.
#
# DeepSeek is selected by unsetting the other provider keys INSIDE the
# railway environment (railway run injects them; unsetting before it would
# do nothing). DATABASE_URL stays — cache writes are the whole point.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOG="$HOME/Library/Logs/romaintalk-precompute.log"
PLIST="$HOME/Library/LaunchAgents/com.romaintalk.precompute-once.plist"
cd "$HOME/french-voice-tutor" || exit 1

{
  echo "══════ precompute (DeepSeek) started $(date) ══════"
  # caffeinate: don't let the Mac idle-sleep out of a 5-hour run.
  caffeinate -is railway run -- /usr/bin/env -u OPENAI_API_KEY -u BUILT_IN_FORGE_API_KEY \
    npx tsx scripts/precompute-dictionary.ts --from 1 --to 6000 --concurrency 8 --yes
  echo "────── verification pass $(date) ──────"
  railway run -- npx tsx scripts/precompute-dictionary.ts --from 1 --to 6000 --dry-run
  echo "══════ finished $(date) ══════"
} >> "$LOG" 2>&1

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
rm -f "$PLIST"

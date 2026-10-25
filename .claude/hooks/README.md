# Shabbat guard

Stops Claude from doing any work from Friday afternoon until Saturday night, New York time. Inside
that time every tool is blocked (files, commands, GitHub, everything), so a session that wakes up by
itself, for example when a usage limit resets, cannot carry on. Claude may only post one short note
saying what is unfinished.

After Shabbat nothing restarts by itself. A session that was working before Shabbat stays blocked
until you write to it again; finished background work and GitHub events don't count as you. The
guard finds your last message in the session's own record, so this holds even if the session comes
back on a fresh machine.

## When it is on

The times come from the sunset in New York for that exact week (summer and winter time included):

- **Starts** 3 hours before Friday's sunset (about 2 hours 40 minutes before candle lighting).
- **Ends** 2 hours after Saturday's sunset (well after the usual times for the end of Shabbat).

These are safety margins picked for this tool, not a halachic ruling. To change them, edit
`hoursBeforeFridaySunset` and `hoursAfterSaturdaySunset` at the top of `shabbat-guard.mjs`, then run
`node .claude/hooks/make-setup-script.mjs` so the setup script below picks up the change.

## Where it works

- **This repository**: `.claude/settings.json` turns it on for every Claude Code session that works
  on pixel-studio.
- **Every cloud session, whatever the repository**: paste `cloud-setup-script.sh` into a cloud
  environment's Setup script, and use that environment for your projects and sessions. It installs
  the guard in the session's own settings (`~/.claude/settings.json`), so it covers all repositories.
- **Claude Code on your own computer**: run `bash .claude/hooks/cloud-setup-script.sh` once
  (Node.js must be installed).

## Trying it

`SHABBAT_GUARD_NOW` pretends it is another time:

```sh
echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | SHABBAT_GUARD_NOW=2026-10-23T20:12-04:00 node .claude/hooks/shabbat-guard.mjs
```

The tests (`shabbat-guard.test.mjs`) run with `npm test`.

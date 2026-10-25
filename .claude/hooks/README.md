# Shabbat guard

Stops Claude from doing any work on Shabbat and Yom Tov, New York time. Inside
that time every tool is blocked (files, commands, GitHub, everything), so a session that wakes up by
itself, for example when a usage limit resets, cannot carry on. Claude may only post one short note
saying what is unfinished.

Afterward nothing restarts by itself. A session that was working before it stays blocked
until you write to it again; finished background work and GitHub events don't count as you. The
guard finds your last message in the session's own record, so this holds even if the session comes
back on a fresh machine.

## When it is on

The times come from the sunset in New York for that exact day (summer and winter time included):

- **Starts** 1 hour before sunset on Friday or the day before Yom Tov (42 minutes before candle
  lighting).
- **Ends** 2 hours after sunset on Saturday or the last day of Yom Tov (well after the usual times
  for the end of Shabbat).

Yom Tov is Rosh Hashanah, Yom Kippur, Sukkot, Shemini Atzeret and Simchat Torah, Pesach and Shavuot,
with the two days kept outside Israel. The dates come from the fixed Hebrew calendar, worked out
here. When Yom Tov is next to Shabbat, the days join into one quiet time.

These are safety margins picked for this tool, not a halachic ruling. To change them, edit
`hoursBeforeSunset` and `hoursAfterSunset` at the top of `shabbat-guard.mjs` (or set `yomTov` to
`false` for Shabbat only), then run
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

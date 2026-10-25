#!/usr/bin/env node
// Shabbat guard: stops Claude from working on Shabbat and Yom Tov, New York time.
//
// Claude Code runs this before every tool use (PreToolUse), when a session starts (SessionStart)
// and when a message comes in (UserPromptSubmit). Inside the quiet time it blocks every tool, so a
// session that resumes by itself (for example after a usage limit resets) cannot do any work. It
// only lets Claude post one short note saying what is unfinished. Afterward nothing restarts
// by itself: a session that was working before it stays blocked until the person writes to it
// again (found from the session's own record of messages, so it holds even on a fresh machine).
//
// The times come from the sunset in New York, worked out here (no internet needed), with the
// change between summer and winter time handled by the America/New_York time zone. Yom Tov comes
// from the fixed Hebrew calendar, with the two days kept outside Israel; when Yom Tov is next to
// Shabbat, the days join into one quiet time.

import { readFileSync, realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ---- Settings you can change -------------------------------------------------------------------
// These margins are safety buffers chosen for this tool, not a halachic ruling. Candle lighting is
// usually listed 18 minutes before sunset, and Shabbat usually ends 42 to 72 minutes after sunset;
// the margins below start before the first and end well after the second.
export const SETTINGS = {
  // How many hours before sunset on the day before Shabbat or Yom Tov the quiet time starts.
  // 1 = 42 minutes before candle lighting.
  hoursBeforeSunset: 1,
  // How many hours after sunset on the last day of Shabbat or Yom Tov the quiet time ends.
  // 2 = about 50 minutes after the latest common time for the end of Shabbat (72 minutes).
  hoursAfterSunset: 2,
  // Also keep Yom Tov (Rosh Hashanah, Yom Kippur, Sukkot, Shemini Atzeret and Simchat Torah,
  // Pesach, Shavuot), with the two days kept outside Israel.
  yomTov: true,
  // Where the sunset is worked out for (New York City) and its time zone.
  latitude: 40.7128,
  longitude: -74.006,
  timeZone: 'America/New_York',
  // If the sunset can't be worked out for any reason, this plain window is used instead: from
  // this hour on the day before until this hour on the day after (24-hour clock, New York time).
  fallbackStartHour: 12,
  fallbackEndHour: 1,
}
// ------------------------------------------------------------------------------------------------

// Tools that may still run during the quiet time: only what Claude needs to post its short note
// and end its turn in a project thread.
const NOTE_TOOLS = new Set([
  'mcp__hearthbot__post_message',
  'mcp__hearthbot__update_progress_checklist',
  'mcp__hearthbot__no_reply_needed',
])

const DAY = 86400000
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

/** Sunset (as a Date) on the given calendar day at the given place, from the NOAA solar formulas. */
export function sunset(year, month, day, latitude, longitude) {
  const midnightUtc = Date.UTC(year, month - 1, day)
  // Start from a rough guess (6 PM local solar time) and refine once with the sun's position then.
  let minutes = 720 - 4 * longitude + 360
  for (let i = 0; i < 2; i++) {
    const t = (midnightUtc + minutes * 60000) / DAY + 2440587.5 // Julian day
    const c = (t - 2451545) / 36525 // Julian centuries since 2000
    const meanLong = (280.46646 + c * (36000.76983 + c * 0.0003032)) % 360
    const meanAnom = 357.52911 + c * (35999.05029 - 0.0001537 * c)
    const ecc = 0.016708634 - c * (0.000042037 + 0.0000001267 * c)
    const center =
      Math.sin(rad(meanAnom)) * (1.914602 - c * (0.004817 + 0.000014 * c)) +
      Math.sin(rad(2 * meanAnom)) * (0.019993 - 0.000101 * c) +
      Math.sin(rad(3 * meanAnom)) * 0.000289
    const omega = 125.04 - 1934.136 * c
    const appLong = meanLong + center - 0.00569 - 0.00478 * Math.sin(rad(omega))
    const obliq =
      23 + (26 + (21.448 - c * (46.815 + c * (0.00059 - c * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(omega))
    const decl = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(appLong))))
    const y = Math.tan(rad(obliq / 2)) ** 2
    const eqTime =
      4 *
      deg(
        y * Math.sin(2 * rad(meanLong)) -
          2 * ecc * Math.sin(rad(meanAnom)) +
          4 * ecc * y * Math.sin(rad(meanAnom)) * Math.cos(2 * rad(meanLong)) -
          0.5 * y * y * Math.sin(4 * rad(meanLong)) -
          1.25 * ecc * ecc * Math.sin(2 * rad(meanAnom)),
      )
    const cosHa =
      Math.cos(rad(90.833)) / (Math.cos(rad(latitude)) * Math.cos(rad(decl))) -
      Math.tan(rad(latitude)) * Math.tan(rad(decl))
    if (!(cosHa >= -1 && cosHa <= 1)) throw new Error('no sunset on this day here')
    minutes = 720 - 4 * longitude - eqTime + 4 * deg(Math.acos(cosHa))
  }
  return new Date(midnightUtc + minutes * 60000)
}

/** The calendar day (year, month, day, weekday 0 = Sunday, hour) of a moment in a time zone. */
function localDay(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  return { year: +parts.year, month: +parts.month, day: +parts.day, weekday, hour: +parts.hour }
}

/** A moment at a given hour of a local calendar day (to within the hour, which is all we need). */
function localHour(year, month, day, hour, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour)
  for (let i = 0; i < 2; i++) {
    const seen = localDay(new Date(guess), timeZone)
    const seenUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour)
    guess += Date.UTC(year, month - 1, day, hour) - seenUtc
  }
  return new Date(guess)
}

// ---- Hebrew calendar ----
// The fixed Hebrew calendar (the molad of Tishrei and the rules that move Rosh Hashanah), as set out
// in Rambam, Hilchot Kiddush HaChodesh chapters 6 to 8. Days are counted from 1970-01-01.
const HEBREW_EPOCH = -1373427 - 719163 // 1 Tishrei of year 1, counted from 1970-01-01

function elapsedDays(year) {
  const months = Math.floor((235 * year - 234) / 19)
  const parts = 12084 + 13753 * months
  const days = 29 * months + Math.floor(parts / 25920)
  return (3 * (days + 1)) % 7 < 3 ? days + 1 : days
}

/** The day (counted from 1970-01-01) of Rosh Hashanah, 1 Tishrei, of a Hebrew year. */
export function roshHashanah(year) {
  const [before, at, after] = [elapsedDays(year - 1), elapsedDays(year), elapsedDays(year + 1)]
  const correction = after - at === 356 ? 2 : at - before === 382 ? 1 : 0
  return HEBREW_EPOCH + at + correction
}

/** The days of Yom Tov (outside Israel) in a Hebrew year, counted from 1970-01-01. */
export function yomTovDays(year) {
  const tishrei = roshHashanah(year)
  // 15 Nisan is always 163 days before the next Rosh Hashanah.
  const pesach = roshHashanah(year + 1) - 163
  return [
    tishrei, tishrei + 1, // Rosh Hashanah
    tishrei + 9, // Yom Kippur
    tishrei + 14, tishrei + 15, // Sukkot
    tishrei + 21, tishrei + 22, // Shemini Atzeret, Simchat Torah
    pesach, pesach + 1, // Pesach, first days
    pesach + 6, pesach + 7, // Pesach, last days
    pesach + 50, pesach + 51, // Shavuot (6 and 7 Sivan)
  ]
}

const dayParts = (n) => {
  const d = new Date(n * DAY)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** The quiet time for a run of days of rest (counted from 1970-01-01), first to last. */
function quietTimeFor(first, last, settings) {
  const eve = dayParts(first - 1)
  const end = dayParts(last)
  try {
    const startSunset = sunset(eve.year, eve.month, eve.day, settings.latitude, settings.longitude)
    const endSunset = sunset(end.year, end.month, end.day, settings.latitude, settings.longitude)
    return {
      start: new Date(startSunset.getTime() - settings.hoursBeforeSunset * 3600000),
      end: new Date(endSunset.getTime() + settings.hoursAfterSunset * 3600000),
    }
  } catch {
    const after = dayParts(last + 1)
    return {
      start: localHour(eve.year, eve.month, eve.day, settings.fallbackStartHour, settings.timeZone),
      end: localHour(after.year, after.month, after.day, settings.fallbackEndHour, settings.timeZone),
    }
  }
}

/** The quiet times near `now` (Shabbat and Yom Tov, joined when they are next to each other). */
function nearbyQuietTimes(now, settings) {
  const today = localDay(now, settings.timeZone)
  const todayN = Date.UTC(today.year, today.month - 1, today.day) / DAY
  const rest = new Set()
  if (settings.yomTov) {
    const hebrewYear = today.year + 3760
    for (const year of [hebrewYear - 1, hebrewYear, hebrewYear + 1]) for (const d of yomTovDays(year)) rest.add(d)
  }
  // Look 10 days either way, so wide margins and three-day Yom Tov still work.
  const windows = []
  for (let n = todayN - 10; n <= todayN + 10; n++) {
    const isRest = (d) => rest.has(d) || new Date(d * DAY).getUTCDay() === 6
    if (!isRest(n) || isRest(n - 1)) continue
    let last = n
    while (isRest(last + 1)) last++
    windows.push(quietTimeFor(n, last, settings))
  }
  return windows
}

/** The quiet time `now` falls in, or null when it is fine to work. */
export function currentQuietTime(now, settings = SETTINGS) {
  return nearbyQuietTimes(now, settings).find((w) => now >= w.start && now < w.end) ?? null
}

/** The last quiet time that has already ended. */
export function lastQuietTime(now, settings = SETTINGS) {
  return nearbyQuietTimes(now, settings).filter((w) => w.end <= now).at(-1)
}

/** Whether a message that starts a turn came from a person rather than something automatic. */
export function fromPerson(prompt = '') {
  return !/^\s*<task-notification>|\[SYSTEM NOTIFICATION/.test(prompt)
}

/**
 * When the person last wrote in this session, from its transcript (one record per line), or null.
 * Tool results and automatic messages (finished background work, GitHub events) don't count.
 */
export function lastPersonMessage(transcript) {
  let last = null
  for (const line of transcript.split('\n')) {
    if (!line.includes('"user"')) continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (entry.type !== 'user' || entry.isMeta || !entry.timestamp) continue
    const content = entry.message?.content
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter((c) => c.type === 'text').map((c) => c.text).join('') : ''
    if (Array.isArray(content) && content.some((c) => c.type === 'tool_result')) continue
    if (entry.origin ? entry.origin.kind !== 'human' : !fromPerson(text)) continue
    const at = new Date(entry.timestamp)
    if (!last || at > last) last = at
  }
  return last
}

/** Whether this session was working before the last quiet time and nobody has written since. */
function waitsForRestart(input, now, settings) {
  const last = lastQuietTime(now, settings)
  if (!last || !input.transcript_path) return false
  try {
    const person = lastPersonMessage(readFileSync(input.transcript_path, 'utf8'))
    return person !== null && person < last.end
  } catch {
    return false
  }
}

export function newYorkTime(date, timeZone = SETTINGS.timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

const ALLOW = { exitCode: 0, stdout: '', stderr: '' }

/** Blocks tools and tells new turns to stop, with the given message. */
function stop(input, message) {
  const event = input.hook_event_name
  if (event === 'PreToolUse') {
    if (NOTE_TOOLS.has(input.tool_name)) return ALLOW
    return { exitCode: 2, stdout: '', stderr: `Blocked by the Shabbat guard. ${message}` }
  }
  if (event === 'SessionStart' || event === 'UserPromptSubmit') {
    const stdout = JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: message } })
    return { exitCode: 0, stdout, stderr: '' }
  }
  return ALLOW
}

/** What the hook says and does for one event. Returns { exitCode, stdout, stderr }. */
export function decide(input, now, settings = SETTINGS) {
  const window = currentQuietTime(now, settings)
  if (window) {
    const until = newYorkTime(window.end, settings.timeZone)
    return stop(
      input,
      `It is Shabbat or Yom Tov (or very close to it) in New York: no work until ${until} (New York time). ` +
        'Stop now. Do not start, continue or finish any work, even if a usage limit has reset. ' +
        'If you are in a project thread, post one short note saying what is unfinished, then end your turn. ' +
        'Afterward, do not resume on your own: wait for the person to restart the work.',
    )
  }
  // A message from the person is the restart; from then on the transcript shows it.
  if (input.hook_event_name === 'UserPromptSubmit' && fromPerson(input.prompt)) return ALLOW
  if (!waitsForRestart(input, now, settings)) return ALLOW
  return stop(
    input,
    'Shabbat or Yom Tov is over, but this session was working before it and the person has not written since. ' +
      'Do not continue on your own: end your turn and wait for the person to write and restart the work.',
  )
}

async function main() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  let input = {}
  try {
    input = JSON.parse(text || '{}')
  } catch {
    // Unreadable input: still guard tool use.
    input = { hook_event_name: 'PreToolUse' }
  }
  // SHABBAT_GUARD_NOW pretends it is another time, for testing (any date the Date class reads).
  const now = process.env.SHABBAT_GUARD_NOW ? new Date(process.env.SHABBAT_GUARD_NOW) : new Date()
  const result = decide(input, now)
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.exitCode)
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main()

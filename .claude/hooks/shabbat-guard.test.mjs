import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SETTINGS, currentQuietTime, decide, newYorkTime, sunset } from './shabbat-guard.mjs'
import { setupScript } from './make-setup-script.mjs'

const NY = [40.7128, -74.006]
const at = (iso) => new Date(iso)
const tool = (name = 'Bash') => ({ hook_event_name: 'PreToolUse', tool_name: name })

describe('Shabbat guard', () => {
  it('finds sunset in New York within a couple of minutes, in summer and winter time', () => {
    // Published New York sunsets: 6:03 PM, 8:31 PM, 4:31 PM.
    expect(newYorkTime(sunset(2026, 10, 23, ...NY))).toMatch(/6:0[2-4] PM/)
    expect(newYorkTime(sunset(2026, 6, 19, ...NY))).toMatch(/8:(29|30|31|32) PM/)
    expect(newYorkTime(sunset(2026, 12, 18, ...NY))).toMatch(/4:(29|30|31|32) PM/)
  })

  it('blocks the times agents worked last Friday night', () => {
    // Usage resumed at 8:12 PM Friday and the work went on until 10:43 PM.
    expect(decide(tool(), at('2026-10-23T20:12:00-04:00')).exitCode).toBe(2)
    expect(decide(tool(), at('2026-10-23T22:43:00-04:00')).exitCode).toBe(2)
    expect(decide(tool(), at('2026-10-24T12:00:00-04:00')).exitCode).toBe(2)
  })

  it('starts 3 hours before Friday sunset and ends 2 hours after Saturday sunset', () => {
    const window = currentQuietTime(at('2026-10-23T20:00:00-04:00'))
    expect(newYorkTime(window.start)).toBe('Friday, October 23 at 3:03 PM')
    expect(newYorkTime(window.end)).toBe('Saturday, October 24 at 8:02 PM')
    expect(decide(tool(), at('2026-10-23T14:55:00-04:00')).exitCode).toBe(0)
    expect(decide(tool(), at('2026-10-24T20:10:00-04:00')).exitCode).toBe(0)
  })

  it('follows the clock change and long summer days', () => {
    // Summer: sunset 8:30 PM, so the quiet time starts about 5:30 PM Friday.
    expect(decide(tool(), at('2026-06-19T17:00:00-04:00')).exitCode).toBe(0)
    expect(decide(tool(), at('2026-06-19T18:00:00-04:00')).exitCode).toBe(2)
    expect(decide(tool(), at('2026-06-20T22:00:00-04:00')).exitCode).toBe(2)
    // Winter time (after the clocks go back on November 1): sunset 4:46 PM on November 6.
    expect(decide(tool(), at('2026-11-06T13:30:00-05:00')).exitCode).toBe(0)
    expect(decide(tool(), at('2026-11-06T14:00:00-05:00')).exitCode).toBe(2)
  })

  it('lets work go on during the week', () => {
    for (const iso of ['2026-10-25T00:02:00-04:00', '2026-10-21T23:00:00-04:00', '2026-10-23T09:00:00-04:00']) {
      expect(decide(tool(), at(iso)).exitCode).toBe(0)
    }
  })

  it('lets only the short note through, and tells new sessions and messages to stop', () => {
    const friday = at('2026-10-23T21:00:00-04:00')
    expect(decide(tool('mcp__hearthbot__post_message'), friday).exitCode).toBe(0)
    expect(decide(tool('Edit'), friday).exitCode).toBe(2)
    expect(decide(tool('mcp__github__create_pull_request'), friday).exitCode).toBe(2)
    for (const event of ['SessionStart', 'UserPromptSubmit']) {
      const out = JSON.parse(decide({ hook_event_name: event }, friday).stdout)
      expect(out.hookSpecificOutput.additionalContext).toMatch(/Saturday, October 24 at 8:02 PM/)
    }
  })

  it('wider margins still work', () => {
    const wide = { ...SETTINGS, hoursBeforeFridaySunset: 24, hoursAfterSaturdaySunset: 8 }
    expect(currentQuietTime(at('2026-10-22T19:00:00-04:00'), wide)).not.toBeNull()
    expect(currentQuietTime(at('2026-10-25T01:00:00-04:00'), wide)).not.toBeNull()
  })

  it('runs as a hook, with a pretend time', () => {
    const run = (iso) =>
      spawnSync('node', [new URL('shabbat-guard.mjs', import.meta.url).pathname], {
        input: JSON.stringify(tool()),
        env: { ...process.env, SHABBAT_GUARD_NOW: iso },
      })
    const blocked = run('2026-10-23T20:12:00-04:00')
    expect(blocked.status).toBe(2)
    expect(blocked.stderr.toString()).toMatch(/Shabbat guard/)
    expect(run('2026-10-21T12:00:00-04:00').status).toBe(0)
  })

  it('the setup script carries the current guard', () => {
    const saved = readFileSync(new URL('cloud-setup-script.sh', import.meta.url), 'utf8')
    expect(saved, 'run: node .claude/hooks/make-setup-script.mjs').toBe(setupScript())
    expect(() => execFileSync('bash', ['-n', new URL('cloud-setup-script.sh', import.meta.url).pathname])).not.toThrow()
  })
})


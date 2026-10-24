import { describe, expect, it } from 'vitest'
import { GOALS } from './help.ts'
import { PRO_NAMES } from './proNames.ts'
import { TOOLS } from './tools.ts'

// The app's sentences: the words inside t('…') and msg('…') (the same reading as the translation test).
const APP = import.meta.glob<string>(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./proNames.ts'], { query: '?raw', import: 'default', eager: true })
const CALL = /\b(?:t|tParts|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
const sentences = new Set(Object.values(APP).flatMap((source) => [...source.matchAll(CALL)].map((m) => (m[1] ?? m[2]).replace(/\\(.)/g, '$1'))))
const SOURCES = import.meta.glob<string>(['./appActions.ts'], { query: '?raw', import: 'default', eager: true })
const actionIds = new Set([...Object.values(SOURCES)[0].matchAll(/\bid: '([\w-]+)'/g)].map((m) => m[1]))

describe('plain names and pro names', () => {
  it('every pro name belongs to a word the app still shows', () => {
    expect(Object.keys(PRO_NAMES).filter((word) => !sentences.has(word))).toEqual([])
  })

  it('every tool says when to use it and what the pro programs call it', () => {
    for (const tool of TOOLS) {
      expect(tool.when.length, tool.id).toBeGreaterThan(20)
      expect(tool.pro.length, tool.id).toBeGreaterThan(2)
    }
  })
})

describe('Help guide', () => {
  it('every goal leads to a tool or an action that exists', () => {
    const tools = new Set(TOOLS.map((tool) => tool.id))
    for (const goal of GOALS) {
      expect(!!goal.tool !== !!goal.action, goal.id).toBe(true)
      if (goal.tool) expect(tools.has(goal.tool), goal.id).toBe(true)
      if (goal.action) expect(actionIds.has(goal.action), goal.id).toBe(true)
    }
  })

  it('goals have their own ids', () => {
    expect(new Set(GOALS.map((goal) => goal.id)).size).toBe(GOALS.length)
  })
})

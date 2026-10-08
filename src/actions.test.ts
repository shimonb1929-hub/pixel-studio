import { describe, expect, it } from 'vitest'
import { isActionEnabled, searchActions, type Action } from './actions.ts'

const noop = () => {}

const ACTIONS: Action[] = [
  { id: 'new', group: 'Design', title: 'New design…', description: 'Start a fresh, empty design.', keywords: ['blank', 'create'], run: noop },
  { id: 'open', group: 'Design', title: 'Open a picture…', description: 'Pick a picture from your computer.', keywords: ['photo', 'upload', 'import'], run: noop },
  { id: 'download', group: 'Design', title: 'Download…', description: 'Save your design as a PNG or JPG picture.', keywords: ['save', 'export', 'share'], needsDocument: true, run: noop },
  { id: 'zoom-in', group: 'View', title: 'Zoom in', description: 'See your design bigger.', keywords: ['bigger', 'closer', 'magnify'], needsDocument: true, run: noop },
  { id: 'zoom-out', group: 'View', title: 'Zoom out', description: 'See your design smaller.', keywords: ['smaller', 'farther'], needsDocument: true, run: noop },
  { id: 'actual', group: 'View', title: 'Actual size (100%)', description: 'Show the real size.', keywords: ['real', 'original'], needsDocument: true, run: noop },
]

const ids = (query: string) => searchActions(ACTIONS, query).map((a) => a.id)

describe('searchActions', () => {
  it('returns everything for an empty search', () => {
    expect(ids('')).toEqual(ACTIONS.map((a) => a.id))
    expect(ids('   ')).toEqual(ACTIONS.map((a) => a.id))
  })

  it('finds actions by everyday words', () => {
    expect(ids('save')[0]).toBe('download')
    expect(ids('bigger')[0]).toBe('zoom-in')
    expect(ids('photo')[0]).toBe('open')
    expect(ids('100')[0]).toBe('actual')
  })

  it('ranks title matches above keyword matches', () => {
    expect(ids('zoom')).toEqual(['zoom-in', 'zoom-out'])
  })

  it('needs every word to match', () => {
    expect(ids('zoom out')).toEqual(['zoom-out'])
    expect(ids('zoom banana')).toEqual([])
  })

  it('ignores case and accents', () => {
    expect(ids('DOWNLOAD')[0]).toBe('download')
    expect(ids('dówn')[0]).toBe('download')
  })

  it('matches a single letter only at the start of a word', () => {
    expect(ids('w')).toEqual([])
    expect(ids('d')).toEqual(['new', 'download'])
  })
})

describe('isActionEnabled', () => {
  it('turns off design actions until a design is open', () => {
    const download = ACTIONS[2]
    expect(isActionEnabled(download, false)).toBe(false)
    expect(isActionEnabled(download, true)).toBe(true)
    expect(isActionEnabled(ACTIONS[0], false)).toBe(true)
  })
})

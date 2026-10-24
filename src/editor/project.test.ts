import { describe, expect, it } from 'vitest'
import { isProjectFile, packProject, PROJECT_VERSION, ProjectError, unpackProject, validateManifest, type ProjectLayer, type ProjectManifest } from './project.ts'
import { NO_ADJUSTMENTS } from './adjust.ts'

const pixels = (patch: Partial<Extract<ProjectLayer, { kind: 'raster' }>> = {}): ProjectLayer => ({
  kind: 'raster',
  name: 'Background',
  x: 0,
  y: 0,
  width: 400,
  height: 300,
  box: null,
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  bytes: 3,
  ...patch,
})

const shape = (patch: Partial<Extract<ProjectLayer, { kind: 'shape' }>> = {}): ProjectLayer => ({
  kind: 'shape',
  name: 'Star',
  box: { cx: 100, cy: 80, width: 120, height: -90, rotation: 0.3 },
  geometry: { type: 'star', corners: 0, sides: 5, arrow: false },
  fill: { kind: 'color', color: '#ff8800' },
  outline: { color: '#1b1d23', width: 4 },
  visible: true,
  opacity: 0.8,
  locked: false,
  adjust: { ...NO_ADJUSTMENTS, brightness: 0.2, saturation: -1, blur: 0.1 },
  ...patch,
})

const words = (patch: Partial<Extract<ProjectLayer, { kind: 'text' }>> = {}): ProjectLayer => ({
  kind: 'text',
  name: 'שבת שלום',
  box: { cx: 200, cy: 100, width: 180, height: 58, rotation: 0 },
  text: 'שבת שלום\nShabbat 2024',
  style: { font: 'frank-ruhl-libre', size: 24, weight: 700, italic: false, color: '#c4320a', align: 'auto', direction: 'auto', letterSpacing: 0.05, lineHeight: 1.2 },
  wrap: false,
  visible: true,
  opacity: 1,
  locked: false,
  adjust: null,
  ...patch,
})

function manifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    version: PROJECT_VERSION,
    name: 'Birthday card',
    width: 400,
    height: 300,
    background: '#ffffff',
    activeLayer: 1,
    selection: null,
    layers: [
      pixels({ locked: true }),
      pixels({ name: 'Layer 1', x: -20, y: 10, width: 50, height: 60, visible: false, opacity: 0.5, bytes: 2, box: { cx: 5, cy: 40, width: -100, height: 120, rotation: 1 } }),
    ],
    ...overrides,
  }
}

const IMAGES = () => [new Blob([new Uint8Array([1, 2, 3])]), new Blob([new Uint8Array([4, 5])])]

async function bytes(blob: Blob): Promise<number[]> {
  return [...new Uint8Array(await blob.arrayBuffer())]
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectError)
    return (error as Error).message
  }
  throw new Error('expected the project to be refused')
}

describe('project files', () => {
  it('pack and unpack give back the same description and layer pictures', async () => {
    const original = manifest({ selection: { ops: [{ kind: 'polygon', subtract: false, points: [{ x: 1, y: 2 }, { x: 30, y: 2 }, { x: 30, y: 40 }] }, { kind: 'invert' }] } })
    const file = packProject(original, IMAGES())
    expect(await isProjectFile(file)).toBe(true)
    const { manifest: read, images } = await unpackProject(file)
    expect(read).toEqual(original)
    expect(await Promise.all(images.map(bytes))).toEqual([[1, 2, 3], [4, 5]])
  })

  it('keeps lists and carries fonts of your own after the pictures', async () => {
    const list = words({ style: { font: 'own-0123456789abcdef', size: 24, weight: 400, italic: false, color: '#000000', align: 'auto', direction: 'auto', letterSpacing: 0, lineHeight: 1.2, list: 'letter' } })
    const fonts = [{ id: 'own-0123456789abcdef', name: 'My Hebrew', format: 'truetype' as const, hebrew: true, yiddish: false, bytes: 4 }]
    const original = manifest({ layers: [...manifest().layers, list], fonts })
    const read = await unpackProject(packProject(original, [...IMAGES(), new Blob([new Uint8Array([7, 7, 7, 7])])]))
    expect(read.manifest).toEqual(original)
    expect(read.fonts.map((f) => [f.id, f.name, f.format])).toEqual([['own-0123456789abcdef', 'My Hebrew', 'truetype']])
    expect(await bytes(read.fonts[0].data)).toEqual([7, 7, 7, 7])
    expect(() => validateManifest({ ...original, fonts: [{ ...fonts[0], id: 'heebo' }] })).toThrow(ProjectError)
    expect(() => validateManifest({ ...original, layers: [words({ style: { ...(list as { style: object }).style, list: 'stars' } as never })] })).toThrow(ProjectError)
  })

  it('keeps names in any language', async () => {
    const { manifest: read } = await unpackProject(packProject(manifest({ name: 'כרטיס ברכה ✓' }), IMAGES()))
    expect(read.name).toBe('כרטיס ברכה ✓')
  })

  it('recognizes project files by their contents, not their name', async () => {
    expect(await isProjectFile(new Blob(['\x89PNG\r\n\x1a\n'.padEnd(40, ' ')]))).toBe(false)
    expect(await isProjectFile(new Blob(['PXST']))).toBe(false)
  })

  it('explains files that are cut short or are not projects', async () => {
    const file = packProject(manifest(), IMAGES())
    expect(await rejection(unpackProject(file.slice(0, file.size - 1)))).toMatch(/damaged/)
    expect(await rejection(unpackProject(file.slice(0, 20)))).toMatch(/damaged/)
    expect(await rejection(unpackProject(new Blob(['hello there, this is not a project'])))).toMatch(/damaged/)
  })

  it('explains a description that is not readable', async () => {
    const header = new Uint8Array(12)
    header.set(new TextEncoder().encode('PXSTUDIO'))
    new DataView(header.buffer).setUint32(8, 5, true)
    expect(await rejection(unpackProject(new Blob([header, '{oops'])))).toMatch(/damaged/)
  })

  it('asks for a newer Pixel Studio for projects from the future', () => {
    expect(() => validateManifest(manifest({ version: PROJECT_VERSION + 1 }))).toThrow(/newer version/)
  })

  it('refuses sizes, layers and selections that cannot be right', () => {
    const bad: unknown[] = [
      null,
      [],
      { ...manifest(), version: 0 },
      manifest({ width: 0 }),
      manifest({ height: 20001 }),
      manifest({ width: 10.5 }),
      manifest({ activeLayer: 2 }),
      manifest({ activeLayer: -2 }),
      { ...manifest(), background: 'white' },
      { ...manifest(), name: 7 },
      manifest({ layers: [pixels({ width: 0 })], activeLayer: 0 }),
      manifest({ layers: [pixels({ opacity: 2 })], activeLayer: 0 }),
      manifest({ layers: [pixels({ bytes: 0 })], activeLayer: 0 }),
      manifest({ layers: [{ ...pixels(), kind: 'text' } as unknown as ProjectLayer], activeLayer: 0 }),
      manifest({ layers: [pixels({ box: { cx: 0, cy: 0, width: 0, height: 10, rotation: 0 } })], activeLayer: 0 }),
      manifest({ layers: [pixels({ adjust: { ...NO_ADJUSTMENTS, brightness: 3 } })], activeLayer: 0 }),
      manifest({ layers: [shape({ geometry: { type: 'blob' as 'star', corners: 0, sides: 5, arrow: false } })], activeLayer: 0 }),
      manifest({ layers: [shape({ geometry: { type: 'polygon', corners: 0, sides: 2, arrow: false } })], activeLayer: 0 }),
      manifest({ layers: [shape({ fill: { kind: 'color', color: 'red' } })], activeLayer: 0 }),
      manifest({ layers: [shape({ fill: { kind: 'photo', zoom: 0.5, x: 0, y: 0, width: 10, height: 10, bytes: 4 } })], activeLayer: 0 }),
      manifest({ layers: [shape({ outline: { color: '#000000', width: -1 } })], activeLayer: 0 }),
      manifest({ layers: [shape({ geometry: { type: 'path', corners: 0, sides: 6, arrow: false } })], activeLayer: 0 }),
      manifest({ layers: [shape({ geometry: { type: 'path', corners: 0, sides: 6, arrow: false, path: { closed: true, nodes: [] } } })], activeLayer: 0 }),
      manifest({ layers: [shape({ fill: { kind: 'gradient', gradient: { type: 'linear', angle: 0, stops: [{ at: 0, color: '#000000', opacity: 1 }] } } })], activeLayer: 0 }),
      manifest({ layers: [shape({ fill: { kind: 'gradient', gradient: { type: 'conic' as 'linear', angle: 0, stops: [] } } })], activeLayer: 0 }),
      { ...manifest(), selection: { ops: [{ kind: 'polygon', subtract: false, points: [{ x: 'a', y: 1 }] }] } },
      { ...manifest(), selection: { ops: [{ kind: 'star' }] } },
    ]
    for (const value of bad) expect(() => validateManifest(value), JSON.stringify(value)).toThrow(ProjectError)
  })

  it('refuses projects too big to open', () => {
    const huge = pixels({ name: 'Huge', width: 16000, height: 16000, bytes: 1 })
    expect(() => validateManifest(manifest({ layers: [huge, huge, huge, huge], activeLayer: 0 }))).toThrow(/too big/)
  })

  it('opens version 1 projects, which had no locks, boxes or adjustments', () => {
    const old = { ...manifest(), version: 1, layers: [{ kind: 'raster', name: 'Old', x: 0, y: 0, width: 4, height: 4, visible: true, opacity: 1, bytes: 9 }], activeLayer: 0 }
    expect(validateManifest(old).layers[0]).toEqual(pixels({ name: 'Old', width: 4, height: 4, bytes: 9 }))
  })

  it('opens adjustments saved before the newer sliders, and keeps curves and one-color changes', () => {
    const old = { brightness: 0.2, contrast: 0, saturation: -1, warmth: 0, blur: 0.1, sharpen: 0 }
    expect(validateManifest(manifest({ layers: [pixels({ adjust: old as never })], activeLayer: 0 })).layers[0].adjust).toEqual({
      ...NO_ADJUSTMENTS,
      ...old,
    })
    const full = {
      ...NO_ADJUSTMENTS,
      shadows: 0.4,
      grain: 0.3,
      colors: { blue: { hue: 0, strength: 0.5, light: -0.2 } },
      curve: { all: [[0, 0], [0.5, 0.6], [1, 1]] as [number, number][] },
    }
    expect(validateManifest(manifest({ layers: [pixels({ adjust: full })], activeLayer: 0 })).layers[0].adjust).toEqual(full)
    for (const bad of [{ ...full, grain: -0.5 }, { ...full, colors: { blue: { hue: 2, strength: 0, light: 0 } } }, { ...full, curve: { all: [[0, 2]] } }]) {
      expect(() => validateManifest(manifest({ layers: [pixels({ adjust: bad as never })], activeLayer: 0 }))).toThrow(ProjectError)
    }
  })

  it('keeps shapes, and finds the photo inside a shape among the pictures', async () => {
    const withPhoto = shape({ name: 'Frame', fill: { kind: 'photo', zoom: 1.5, x: -0.5, y: 0.25, width: 30, height: 20, bytes: 2 } })
    const original = manifest({ layers: [pixels(), shape(), withPhoto, pixels({ name: 'Top', bytes: 1 })], activeLayer: 1 })
    const file = packProject(original, [new Blob([new Uint8Array([1, 2, 3])]), new Blob([new Uint8Array([7, 8])]), new Blob([new Uint8Array([9])])])
    const { manifest: read, images } = await unpackProject(file)
    expect(read).toEqual(original)
    expect(await Promise.all(images.map(bytes))).toEqual([[1, 2, 3], [7, 8], [9]])
  })

  it('keeps pen paths and gradient fills', async () => {
    const corner = (x: number, y: number) => ({ x, y, in: { x, y }, out: { x, y }, smooth: false })
    const pen = shape({
      name: 'Pen shape 1',
      geometry: { type: 'path', corners: 0, sides: 6, arrow: false, path: { closed: true, nodes: [corner(-0.5, -0.5), { x: 0.5, y: 0, in: { x: 0.5, y: -0.3 }, out: { x: 0.5, y: 0.3 }, smooth: true }, corner(-0.5, 0.5)] } },
      fill: { kind: 'gradient', gradient: { type: 'radial', angle: 45, stops: [{ at: 0, color: '#ff0000', opacity: 1 }, { at: 1, color: '#0000ff', opacity: 0.25 }] } },
    })
    const original = manifest({ layers: [pen], activeLayer: 0 })
    const { manifest: read } = await unpackProject(packProject(original, []))
    expect(read).toEqual(original)
  })

  it('keeps text, which brings no pictures along', async () => {
    const original = manifest({ layers: [pixels(), words(), words({ name: 'Box', wrap: true, style: { ...(words() as Extract<ProjectLayer, { kind: 'text' }>).style, direction: 'rtl', align: 'justify' } })], activeLayer: 1 })
    const file = packProject(original, [new Blob([new Uint8Array([1, 2, 3])])])
    const { manifest: read, images } = await unpackProject(file)
    expect(read).toEqual(original)
    expect(images).toHaveLength(1)
  })

  it('keeps text that runs on from box to box, and turns away a damaged one', async () => {
    const flow = { story: 'story-1', index: 0, full: 'One two three four', start: 0, end: 8, height: 30 }
    const original = manifest({ layers: [words({ wrap: true, text: 'One two', flow }), words({ wrap: true, text: 'three four', flow: { ...flow, index: 1, start: 8, end: 18 } })], activeLayer: 0 })
    const { manifest: read } = await unpackProject(packProject(original, []))
    expect(read).toEqual(original)
    const bad = [{ ...flow, end: 99 }, { ...flow, start: 9 }, { ...flow, height: 0 }, { ...flow, index: -1 }, { ...flow, story: 5 }, 'flow']
    for (const wrong of bad) {
      const layer = words({ flow: wrong as unknown as typeof flow })
      expect(() => validateManifest(manifest({ layers: [layer], activeLayer: 0 })), JSON.stringify(wrong)).toThrow(ProjectError)
    }
  })

  it('keeps bent text and text along the edge of a shape, and turns away damaged ones', async () => {
    const style = (words() as Extract<ProjectLayer, { kind: 'text' }>).style
    const node = (x: number, y: number) => ({ x, y, in: { x, y }, out: { x, y }, smooth: false })
    const along = { path: { closed: true, nodes: [node(-50, -50), node(50, -50), node(50, 50)] }, at: 0.25, flip: true }
    const original = manifest({ layers: [words({ style: { ...style, bend: -0.4 } }), words({ along })], activeLayer: 0 })
    const { manifest: read } = await unpackProject(packProject(original, []))
    expect(read).toEqual(original)
    for (const wrong of [{ ...along, at: 2 }, { ...along, flip: 'yes' }, { ...along, path: null }]) {
      expect(() => validateManifest(manifest({ layers: [words({ along: wrong as unknown as typeof along })], activeLayer: 0 })), JSON.stringify(wrong)).toThrow(ProjectError)
    }
    expect(() => validateManifest(manifest({ layers: [words({ style: { ...style, bend: 3 } })], activeLayer: 0 }))).toThrow(ProjectError)
  })

  it('refuses text settings that cannot be right', () => {
    const style = (words() as Extract<ProjectLayer, { kind: 'text' }>).style
    const bad = [
      words({ text: 7 as unknown as string }),
      words({ style: { ...style, size: 0 } }),
      words({ style: { ...style, align: 'middle' as 'center' } }),
      words({ style: { ...style, direction: 'up' as 'rtl' } }),
      words({ style: { ...style, color: 'blue' } }),
      words({ style: { ...style, font: '' } }),
      words({ wrap: 'yes' as unknown as boolean }),
    ]
    for (const layer of bad) expect(() => validateManifest(manifest({ layers: [layer], activeLayer: 0 })), JSON.stringify(layer)).toThrow(ProjectError)
  })

  it('keeps tables, right to left too, and turns away a damaged one', async () => {
    const style = { ...(words() as Extract<ProjectLayer, { kind: 'text' }>).style, list: null, gradient: null }
    const table = (patch: Partial<Extract<ProjectLayer, { kind: 'table' }>> = {}): ProjectLayer => ({
      kind: 'table',
      name: 'תפריט',
      box: { cx: 200, cy: 150, width: 300, height: 120, rotation: 0 },
      cells: [
        ['מנה', 'מחיר'],
        ['מרק עוף', '₪25'],
        ['Kugel', '12.50'],
      ],
      columnWidths: [200, 100],
      align: ['auto', 'left'],
      style,
      padding: 8,
      background: null,
      header: '#eef2ff',
      stripes: '#f4f5f7',
      lines: { kind: 'rows', color: '#d0d5dd', width: 1 },
      rtl: true,
      visible: true,
      opacity: 1,
      locked: false,
      adjust: null,
      ...patch,
    })
    const original = manifest({ layers: [pixels(), table(), table({ rtl: false, header: null, background: '#ffffff' })], activeLayer: 1 })
    const { manifest: read } = await unpackProject(packProject(original, [new Blob([new Uint8Array([1, 2, 3])])]))
    expect(read).toEqual(original)
    const bad = [
      table({ cells: [['one'], ['two', 'three']] }),
      table({ cells: [] }),
      table({ cells: [['a', 5 as unknown as string]] }),
      table({ columnWidths: [200] }),
      table({ columnWidths: [200, 0] }),
      table({ align: ['auto', 'middle' as 'left'] }),
      table({ lines: { kind: 'dots' as 'all', color: '#000000', width: 1 } }),
      table({ header: 'blue' }),
      table({ rtl: 'yes' as unknown as boolean }),
      table({ padding: -1 }),
    ]
    for (const layer of bad) expect(() => validateManifest(manifest({ layers: [layer], activeLayer: 0 })), JSON.stringify(layer)).toThrow(ProjectError)
  })

  it('keeps the page color, and designs with nothing on the page yet', async () => {
    const empty = manifest({ layers: [], activeLayer: -1, background: null })
    const { manifest: read } = await unpackProject(packProject(empty, []))
    expect(read).toEqual(empty)
    // Older files had no page color: their page is see-through, with a layer for the paper.
    const { background: _, ...older } = manifest({ version: 3 })
    expect(validateManifest(older).background).toBeNull()
  })

  it('keeps things kept together, and turns away a damaged group', async () => {
    const group = { id: 'group-1', name: 'Logo' }
    const kept = manifest({ layers: [pixels({ group }), words({ group })], activeLayer: 0 })
    const { manifest: read } = await unpackProject(packProject(kept, IMAGES().slice(0, 1)))
    expect(read.layers.map((l) => l.group)).toEqual([group, group])
    expect(validateManifest(manifest()).layers[0].group).toBeUndefined()
    expect(() => validateManifest(manifest({ layers: [pixels({ group: { id: 3 } as never })], activeLayer: 0 }))).toThrow(ProjectError)
  })

  it('treats an empty selection as no selection', () => {
    expect(validateManifest({ ...manifest(), selection: { ops: [] } }).selection).toBeNull()
    expect(validateManifest({ ...manifest(), selection: undefined }).selection).toBeNull()
  })
})

describe('effects in projects', () => {
  it('keeps effects and blend modes', () => {
    const effects = {
      shadow: { color: '#000000', opacity: 0.4, blur: 20, distance: 10, angle: 90 },
      glow: null,
      outline: { color: '#ffffff', width: 8 },
    }
    const read = validateManifest(manifest({ activeLayer: 0, layers: [shape({ effects, blend: 'multiply' })] }))
    expect(read.layers[0].effects).toEqual(effects)
    expect(read.layers[0].blend).toBe('multiply')
  })

  it('refuses made-up effects and blend modes', () => {
    expect(() => validateManifest(manifest({ activeLayer: 0, layers: [shape({ blend: 'sparkle' as never })] }))).toThrow(ProjectError)
    expect(() => validateManifest(manifest({ activeLayer: 0, layers: [shape({ effects: { shadow: null, glow: { color: 'red', opacity: 1, size: 3 }, outline: null } })] }))).toThrow(ProjectError)
  })

  it("keeps the design's colors and text styles, and which texts use them", async () => {
    const look = (words() as Extract<ProjectLayer, { kind: 'text' }>).style
    const original = { ...manifest({ layers: [words({ styleId: 'style-1' })], activeLayer: 0 }), colors: ['#c4320a', '#ffffff'], textStyles: [{ id: 'style-1', name: 'כותרת', style: look }] }
    const { manifest: read } = await unpackProject(packProject(original, []))
    expect(read).toEqual(original)
    const bad = [
      { colors: ['red'] },
      { colors: Array(40).fill('#ffffff') },
      { textStyles: [{ id: '', name: 'x', style: look }] },
      { textStyles: [{ id: 'a', name: 'x', style: { ...look, size: -1 } }] },
    ]
    for (const patch of bad) expect(() => validateManifest({ ...original, ...patch }), JSON.stringify(patch)).toThrow(ProjectError)
    expect(() => validateManifest(manifest({ layers: [words({ styleId: 5 as never })], activeLayer: 0 }))).toThrow(ProjectError)
  })
})

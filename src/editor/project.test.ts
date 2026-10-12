import { describe, expect, it } from 'vitest'
import { isProjectFile, packProject, PROJECT_VERSION, ProjectError, unpackProject, validateManifest, type ProjectLayer, type ProjectManifest } from './project.ts'

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
  adjust: { brightness: 0.2, contrast: 0, saturation: -1, warmth: 0, blur: 0.1, sharpen: 0 },
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
      manifest({ layers: [pixels({ adjust: { brightness: 3, contrast: 0, saturation: 0, warmth: 0, blur: 0, sharpen: 0 } })], activeLayer: 0 }),
      manifest({ layers: [shape({ geometry: { type: 'blob' as 'star', corners: 0, sides: 5, arrow: false } })], activeLayer: 0 }),
      manifest({ layers: [shape({ geometry: { type: 'polygon', corners: 0, sides: 2, arrow: false } })], activeLayer: 0 }),
      manifest({ layers: [shape({ fill: { kind: 'color', color: 'red' } })], activeLayer: 0 }),
      manifest({ layers: [shape({ fill: { kind: 'photo', zoom: 0.5, x: 0, y: 0, width: 10, height: 10, bytes: 4 } })], activeLayer: 0 }),
      manifest({ layers: [shape({ outline: { color: '#000000', width: -1 } })], activeLayer: 0 }),
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

  it('keeps shapes, and finds the photo inside a shape among the pictures', async () => {
    const withPhoto = shape({ name: 'Frame', fill: { kind: 'photo', zoom: 1.5, x: -0.5, y: 0.25, width: 30, height: 20, bytes: 2 } })
    const original = manifest({ layers: [pixels(), shape(), withPhoto, pixels({ name: 'Top', bytes: 1 })], activeLayer: 1 })
    const file = packProject(original, [new Blob([new Uint8Array([1, 2, 3])]), new Blob([new Uint8Array([7, 8])]), new Blob([new Uint8Array([9])])])
    const { manifest: read, images } = await unpackProject(file)
    expect(read).toEqual(original)
    expect(await Promise.all(images.map(bytes))).toEqual([[1, 2, 3], [7, 8], [9]])
  })

  it('keeps text, which brings no pictures along', async () => {
    const original = manifest({ layers: [pixels(), words(), words({ name: 'Box', wrap: true, style: { ...(words() as Extract<ProjectLayer, { kind: 'text' }>).style, direction: 'rtl', align: 'justify' } })], activeLayer: 1 })
    const file = packProject(original, [new Blob([new Uint8Array([1, 2, 3])])])
    const { manifest: read, images } = await unpackProject(file)
    expect(read).toEqual(original)
    expect(images).toHaveLength(1)
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

  it('keeps the page color, and designs with nothing on the page yet', async () => {
    const empty = manifest({ layers: [], activeLayer: -1, background: null })
    const { manifest: read } = await unpackProject(packProject(empty, []))
    expect(read).toEqual(empty)
    // Older files had no page color: their page is see-through, with a layer for the paper.
    const { background: _, ...older } = manifest({ version: 3 })
    expect(validateManifest(older).background).toBeNull()
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
})

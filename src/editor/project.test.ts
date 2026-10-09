import { describe, expect, it } from 'vitest'
import { isProjectFile, packProject, PROJECT_VERSION, ProjectError, unpackProject, validateManifest, type ProjectManifest } from './project.ts'

function manifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    version: PROJECT_VERSION,
    name: 'Birthday card',
    width: 400,
    height: 300,
    activeLayer: 1,
    selection: null,
    layers: [
      { kind: 'raster', name: 'Background', x: 0, y: 0, width: 400, height: 300, visible: true, opacity: 1, bytes: 3 },
      { kind: 'raster', name: 'Layer 1', x: -20, y: 10, width: 50, height: 60, visible: false, opacity: 0.5, bytes: 2 },
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
      manifest({ layers: [] }),
      manifest({ activeLayer: 2 }),
      manifest({ activeLayer: -1 }),
      { ...manifest(), name: 7 },
      manifest({ layers: [{ ...manifest().layers[0], width: 0 }] , activeLayer: 0 }),
      manifest({ layers: [{ ...manifest().layers[0], opacity: 2 }], activeLayer: 0 }),
      manifest({ layers: [{ ...manifest().layers[0], bytes: 0 }], activeLayer: 0 }),
      manifest({ layers: [{ ...manifest().layers[0], kind: 'text' as 'raster' }], activeLayer: 0 }),
      { ...manifest(), selection: { ops: [{ kind: 'polygon', subtract: false, points: [{ x: 'a', y: 1 }] }] } },
      { ...manifest(), selection: { ops: [{ kind: 'star' }] } },
    ]
    for (const value of bad) expect(() => validateManifest(value), JSON.stringify(value)).toThrow(ProjectError)
  })

  it('refuses projects too big to open', () => {
    const huge = { kind: 'raster' as const, name: 'Huge', x: 0, y: 0, width: 16000, height: 16000, visible: true, opacity: 1, bytes: 1 }
    expect(() => validateManifest(manifest({ layers: [huge, huge, huge, huge], activeLayer: 0 }))).toThrow(/too big/)
  })

  it('treats an empty selection as no selection', () => {
    expect(validateManifest({ ...manifest(), selection: { ops: [] } }).selection).toBeNull()
    expect(validateManifest({ ...manifest(), selection: undefined }).selection).toBeNull()
  })
})

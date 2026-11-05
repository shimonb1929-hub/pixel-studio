import { t } from '../i18n/i18n.ts'
// "Your designs": every design is kept in the browser (IndexedDB) as you work, so closing the
// tab or the design never loses anything. The list holds small summaries with a preview; each
// design's full project is stored separately and only read when it's opened.
// Earlier versions: for every ten minutes of work, how the design looked at the end of them is kept
// as well, so going back to how it looked this morning (or before a change that went wrong) is
// always possible.

export interface SavedDesign {
  id: string
  name: string
  width: number
  height: number
  // When it was last changed, in milliseconds since 1970.
  updatedAt: number
  thumbnail: Blob
}

const DB_NAME = 'pixel-studio'
const DB_VERSION = 2
const SUMMARIES = 'designs'
const PROJECTS = 'projects'
const VERSIONS = 'versions'
const BY_DESIGN = 'design'

// Each version holds the last of this much work, and only this many are kept.
export const VERSION_EVERY_MS = 10 * 60_000
export const MAX_VERSIONS = 20

export interface DesignVersion {
  key: number
  designId: string
  savedAt: number
  thumbnail: Blob
}

interface StoredVersion extends Omit<DesignVersion, 'key'> {
  key?: number
  project: Blob
  // When the stretch of work this version holds began; later saves in it replace the version.
  startedAt: number
  // Kept on purpose (before going back to another version): later saves never replace it.
  fixed?: boolean
}

// 'auto' keeps the latest of each stretch of work, 'keep' always adds a version that stays as it
// is, and 'none' leaves the versions alone.
export type VersionKeeping = 'auto' | 'keep' | 'none'

// Says in plain words why the browser wouldn't keep a design.
export class StorageError extends Error {}

let opening: Promise<IDBDatabase> | null = null

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new StorageError(t('Saving was stopped.')))
  })
}

function describe(error: unknown): StorageError {
  if (error instanceof StorageError) return error
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new StorageError(t('This browser is out of space for designs. Delete designs you no longer need from the start screen.'))
  }
  return new StorageError(t("This browser isn't letting Pixel Studio keep designs (it may be a private window)."))
}

function database(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') throw new StorageError(t("This browser can't keep designs."))
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS)
        if (!db.objectStoreNames.contains(VERSIONS)) db.createObjectStore(VERSIONS, { keyPath: 'key', autoIncrement: true }).createIndex(BY_DESIGN, 'designId')
      }
      req.onsuccess = () => {
        const db = req.result
        // Another tab with a newer Pixel Studio needs the database; step aside and reopen later.
        db.onversionchange = () => {
          db.close()
          opening = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new StorageError(t('Pixel Studio is open in another tab that needs to be reloaded first.')))
    }).catch((error: unknown) => {
      // Try again next time; the problem may go away (say, after freeing up space).
      opening = null
      throw describe(error)
    })
  }
  return opening
}

// Newest first.
export async function listDesigns(): Promise<SavedDesign[]> {
  const db = await database()
  const designs = await request(db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll() as IDBRequest<SavedDesign[]>)
  return designs.sort((a, b) => b.updatedAt - a.updatedAt)
}

// Keeps the design, and its earlier versions (see VersionKeeping).
export async function saveDesign(summary: SavedDesign, project: Blob, keeping: VersionKeeping = 'auto'): Promise<void> {
  try {
    const db = await database()
    const tx = db.transaction([SUMMARIES, PROJECTS, VERSIONS], 'readwrite')
    tx.objectStore(SUMMARIES).put(summary)
    tx.objectStore(PROJECTS).put(project, summary.id)
    if (keeping !== 'none') await keepVersion(tx.objectStore(VERSIONS), summary, project, keeping === 'keep')
    await done(tx)
  } catch (error) {
    throw describe(error)
  }
}

async function keepVersion(versions: IDBObjectStore, summary: SavedDesign, project: Blob, fixed: boolean) {
  const keys = await request(versions.index(BY_DESIGN).getAllKeys(summary.id) as IDBRequest<number[]>)
  const newest = keys.length ? await request(versions.get(keys[keys.length - 1]) as IDBRequest<StoredVersion | undefined>) : undefined
  const version = { designId: summary.id, savedAt: summary.updatedAt, thumbnail: summary.thumbnail, project }
  if (!fixed && newest && !newest.fixed && summary.updatedAt - newest.startedAt < VERSION_EVERY_MS) {
    versions.put({ ...newest, ...version } satisfies StoredVersion)
    return
  }
  versions.add({ ...version, startedAt: summary.updatedAt, ...(fixed ? { fixed } : {}) } satisfies StoredVersion)
  // Keys only grow, so the first ones are the oldest.
  for (const key of keys.slice(0, Math.max(0, keys.length + 1 - MAX_VERSIONS))) versions.delete(key)
}

// Newest first, without their projects.
export async function listVersions(designId: string): Promise<DesignVersion[]> {
  const db = await database()
  const stored = await request(db.transaction(VERSIONS).objectStore(VERSIONS).index(BY_DESIGN).getAll(designId) as IDBRequest<StoredVersion[]>)
  return stored.map(({ key, designId, savedAt, thumbnail }) => ({ key: key!, designId, savedAt, thumbnail })).sort((a, b) => b.savedAt - a.savedAt || b.key - a.key)
}

export async function loadVersion(key: number): Promise<Blob | null> {
  const db = await database()
  const stored = await request(db.transaction(VERSIONS).objectStore(VERSIONS).get(key) as IDBRequest<StoredVersion | undefined>)
  return stored?.project ?? null
}

export async function loadDesign(id: string): Promise<Blob | null> {
  const db = await database()
  const project = await request(db.transaction(PROJECTS).objectStore(PROJECTS).get(id) as IDBRequest<Blob | undefined>)
  return project ?? null
}

export async function deleteDesign(id: string): Promise<void> {
  const db = await database()
  const tx = db.transaction([SUMMARIES, PROJECTS, VERSIONS], 'readwrite')
  tx.objectStore(SUMMARIES).delete(id)
  tx.objectStore(PROJECTS).delete(id)
  const versions = tx.objectStore(VERSIONS)
  for (const key of await request(versions.index(BY_DESIGN).getAllKeys(id))) versions.delete(key)
  await done(tx)
}

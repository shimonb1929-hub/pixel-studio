import { t } from '../i18n/i18n.ts'
// "Your designs": every design is kept in the browser (IndexedDB) as you work, so closing the
// tab or the design never loses anything. The list holds small summaries with a preview; each
// design's full project is stored separately and only read when it's opened.

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
// "My layouts": designs kept to start new ones from (pro programs call these templates). They
// live in a database of their own, so they never mix with the designs being worked on.
const LAYOUTS_DB = 'pixel-studio-my-layouts'
const DB_VERSION = 1
const SUMMARIES = 'designs'
const PROJECTS = 'projects'

// Says in plain words why the browser wouldn't keep a design.
export class StorageError extends Error {}

const opening = new Map<string, Promise<IDBDatabase>>()

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

function database(name = DB_NAME): Promise<IDBDatabase> {
  let open = opening.get(name)
  if (!open) {
    open = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') throw new StorageError(t("This browser can't keep designs."))
      const req = indexedDB.open(name, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS)
      }
      req.onsuccess = () => {
        const db = req.result
        // Another tab with a newer Pixel Studio needs the database; step aside and reopen later.
        db.onversionchange = () => {
          db.close()
          opening.delete(name)
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new StorageError(t('Pixel Studio is open in another tab that needs to be reloaded first.')))
    }).catch((error: unknown) => {
      // Try again next time; the problem may go away (say, after freeing up space).
      opening.delete(name)
      throw describe(error)
    })
    opening.set(name, open)
  }
  return open
}

// Newest first.
export async function listDesigns(name = DB_NAME): Promise<SavedDesign[]> {
  const db = await database(name)
  const designs = await request(db.transaction(SUMMARIES).objectStore(SUMMARIES).getAll() as IDBRequest<SavedDesign[]>)
  return designs.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveDesign(summary: SavedDesign, project: Blob, name = DB_NAME): Promise<void> {
  try {
    const db = await database(name)
    const tx = db.transaction([SUMMARIES, PROJECTS], 'readwrite')
    tx.objectStore(SUMMARIES).put(summary)
    tx.objectStore(PROJECTS).put(project, summary.id)
    await done(tx)
  } catch (error) {
    throw describe(error)
  }
}

export async function loadDesign(id: string, name = DB_NAME): Promise<Blob | null> {
  const db = await database(name)
  const project = await request(db.transaction(PROJECTS).objectStore(PROJECTS).get(id) as IDBRequest<Blob | undefined>)
  return project ?? null
}

export async function deleteDesign(id: string, name = DB_NAME): Promise<void> {
  const db = await database(name)
  const tx = db.transaction([SUMMARIES, PROJECTS], 'readwrite')
  tx.objectStore(SUMMARIES).delete(id)
  tx.objectStore(PROJECTS).delete(id)
  await done(tx)
}

// My layouts: kept the same way as designs, in their own place.
export const listMyLayouts = () => listDesigns(LAYOUTS_DB)
export const saveMyLayout = (summary: SavedDesign, project: Blob) => saveDesign(summary, project, LAYOUTS_DB)
export const loadMyLayout = (id: string) => loadDesign(id, LAYOUTS_DB)
export const deleteMyLayout = (id: string) => deleteDesign(id, LAYOUTS_DB)

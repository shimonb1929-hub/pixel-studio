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
const DB_VERSION = 1
const SUMMARIES = 'designs'
const PROJECTS = 'projects'

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
    tx.onabort = () => reject(tx.error ?? new StorageError('Saving was stopped.'))
  })
}

function describe(error: unknown): StorageError {
  if (error instanceof StorageError) return error
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new StorageError('This browser is out of space for designs. Delete designs you no longer need from the start screen.')
  }
  return new StorageError("This browser isn't letting Pixel Studio keep designs (it may be a private window).")
}

function database(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') throw new StorageError("This browser can't keep designs.")
      const req = indexedDB.open(DB_NAME, DB_VERSION)
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
          opening = null
        }
        resolve(db)
      }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new StorageError('Pixel Studio is open in another tab that needs to be reloaded first.'))
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

export async function saveDesign(summary: SavedDesign, project: Blob): Promise<void> {
  try {
    const db = await database()
    const tx = db.transaction([SUMMARIES, PROJECTS], 'readwrite')
    tx.objectStore(SUMMARIES).put(summary)
    tx.objectStore(PROJECTS).put(project, summary.id)
    await done(tx)
  } catch (error) {
    throw describe(error)
  }
}

export async function loadDesign(id: string): Promise<Blob | null> {
  const db = await database()
  const project = await request(db.transaction(PROJECTS).objectStore(PROJECTS).get(id) as IDBRequest<Blob | undefined>)
  return project ?? null
}

export async function deleteDesign(id: string): Promise<void> {
  const db = await database()
  const tx = db.transaction([SUMMARIES, PROJECTS], 'readwrite')
  tx.objectStore(SUMMARIES).delete(id)
  tx.objectStore(PROJECTS).delete(id)
  await done(tx)
}

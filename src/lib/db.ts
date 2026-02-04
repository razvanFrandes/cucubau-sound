// IndexedDB wrapper for audio storage

const DB_NAME = 'SoundCaptureDB'
const DB_VERSION = 1
const STORE_NAME = 'audioFiles'

let dbInstance: IDBDatabase | null = null

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.put({ id, blob, savedAt: Date.now() })

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.get(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.blob)
      } else {
        resolve(null)
      }
    }
  })
}

export async function deleteAudioBlob(id: string): Promise<void> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getAllAudioIds(): Promise<string[]> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.getAllKeys()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as string[])
  })
}

export async function getStorageUsage(): Promise<{ count: number; totalSize: number }> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const items = request.result
      let totalSize = 0
      for (const item of items) {
        if (item.blob) {
          totalSize += item.blob.size
        }
      }
      resolve({ count: items.length, totalSize })
    }
  })
}

export async function clearAllAudio(): Promise<void> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

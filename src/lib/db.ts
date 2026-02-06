// IndexedDB wrapper for directory handle storage
// Audio blobs are now stored directly on file system

const DB_NAME = 'SoundCaptureDB'
const DB_VERSION = 2
const DIR_HANDLE_STORE = 'directoryHandle'

// Legacy store name - kept for migration purposes only
const LEGACY_AUDIO_STORE = 'audioFiles'

let dbInstance: IDBDatabase | null = null

async function getDB(): Promise<IDBDatabase> {
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

      // Create directory handle store if it doesn't exist
      if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        db.createObjectStore(DIR_HANDLE_STORE, { keyPath: 'id' })
      }

      // Keep legacy audio store for migration purposes
      if (!db.objectStoreNames.contains(LEGACY_AUDIO_STORE)) {
        db.createObjectStore(LEGACY_AUDIO_STORE, { keyPath: 'id' })
      }
    }
  })
}

// ============================================================================
// Directory Handle Storage (Primary)
// ============================================================================

export async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await getDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIR_HANDLE_STORE, 'readwrite')
    const store = transaction.objectStore(DIR_HANDLE_STORE)
    const request = store.put({ id: 'saveDir', handle, name: handle.name, savedAt: Date.now() })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getDirHandle(): Promise<{ handle: FileSystemDirectoryHandle; name: string } | null> {
  const db = await getDB()
  if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
    return null
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIR_HANDLE_STORE, 'readonly')
    const store = transaction.objectStore(DIR_HANDLE_STORE)
    const request = store.get('saveDir')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (request.result?.handle) {
        resolve({ handle: request.result.handle, name: request.result.name })
      } else {
        resolve(null)
      }
    }
  })
}

export async function clearDirHandle(): Promise<void> {
  const db = await getDB()
  if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
    return
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIR_HANDLE_STORE, 'readwrite')
    const store = transaction.objectStore(DIR_HANDLE_STORE)
    const request = store.delete('saveDir')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// ============================================================================
// Legacy Audio Storage (For Migration Only)
// ============================================================================

export async function getAudioBlob(id: string): Promise<Blob | null> {
  const db = await getDB()
  if (!db.objectStoreNames.contains(LEGACY_AUDIO_STORE)) {
    return null
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LEGACY_AUDIO_STORE, 'readonly')
    const store = transaction.objectStore(LEGACY_AUDIO_STORE)

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

export async function getAllAudioIds(): Promise<string[]> {
  const db = await getDB()
  if (!db.objectStoreNames.contains(LEGACY_AUDIO_STORE)) {
    return []
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LEGACY_AUDIO_STORE, 'readonly')
    const store = transaction.objectStore(LEGACY_AUDIO_STORE)

    const request = store.getAllKeys()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result as string[])
  })
}

export async function clearAllAudio(): Promise<void> {
  const db = await getDB()
  if (!db.objectStoreNames.contains(LEGACY_AUDIO_STORE)) {
    return
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LEGACY_AUDIO_STORE, 'readwrite')
    const store = transaction.objectStore(LEGACY_AUDIO_STORE)

    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

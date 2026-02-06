// IndexedDB helpers
const DB_NAME = 'SoundCaptureDB'
const DIR_HANDLE_STORE = 'directoryHandle'
let dbInstance = null

async function getDB() {
  if (dbInstance) return dbInstance
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains('audioFiles')) {
        db.createObjectStore('audioFiles', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) {
        db.createObjectStore(DIR_HANDLE_STORE, { keyPath: 'id' })
      }
    }
  })
}

async function saveDirHandle(handle) {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIR_HANDLE_STORE, 'readwrite')
    const store = transaction.objectStore(DIR_HANDLE_STORE)
    const request = store.put({ id: 'saveDir', handle, name: handle.name, savedAt: Date.now() })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

async function getDirHandle() {
  const db = await getDB()
  if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) return null
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

async function clearDirHandle() {
  const db = await getDB()
  if (!db.objectStoreNames.contains(DIR_HANDLE_STORE)) return
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DIR_HANDLE_STORE, 'readwrite')
    const store = transaction.objectStore(DIR_HANDLE_STORE)
    const request = store.delete('saveDir')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// UI elements
const folderPathEl = document.getElementById('folderPath')
const chooseFolderBtn = document.getElementById('chooseFolder')
const clearFolderBtn = document.getElementById('clearFolder')
const statusEl = document.getElementById('status')
const toggleAutoSave = document.getElementById('toggleAutoSave')
const toggleKeepInLibrary = document.getElementById('toggleKeepInLibrary')

function showStatus(message, type) {
  statusEl.textContent = message
  statusEl.className = 'status ' + type
  if (type === 'success') {
    setTimeout(() => { statusEl.className = 'status' }, 3000)
  }
}

async function updateUI() {
  const dirData = await getDirHandle()
  if (dirData) {
    folderPathEl.textContent = dirData.name
    folderPathEl.classList.remove('not-set')
    clearFolderBtn.style.display = 'inline-flex'

    // Check if we still have permission
    try {
      const permission = await dirData.handle.queryPermission({ mode: 'readwrite' })
      if (permission !== 'granted') {
        showStatus('Permission needed. Click "Choose Folder" to re-grant access.', 'warning')
      }
    } catch (e) {
      showStatus('Folder access may need to be re-granted.', 'warning')
    }
  } else {
    folderPathEl.textContent = 'No folder selected'
    folderPathEl.classList.add('not-set')
    clearFolderBtn.style.display = 'none'
  }

  // Load toggle states
  const result = await chrome.storage.local.get(['autoSaveEnabled', 'keepInLibrary'])
  if (result.autoSaveEnabled === false) {
    toggleAutoSave.classList.remove('active')
  }
  if (result.keepInLibrary === false) {
    toggleKeepInLibrary.classList.remove('active')
  }
}

chooseFolderBtn.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await saveDirHandle(handle)
    showStatus('Folder selected successfully!', 'success')
    await updateUI()
  } catch (err) {
    if (err.name !== 'AbortError') {
      showStatus('Failed to select folder: ' + err.message, 'error')
    }
  }
})

clearFolderBtn.addEventListener('click', async () => {
  await clearDirHandle()
  showStatus('Folder removed.', 'success')
  await updateUI()
})

toggleAutoSave.addEventListener('click', async () => {
  toggleAutoSave.classList.toggle('active')
  const enabled = toggleAutoSave.classList.contains('active')
  await chrome.storage.local.set({ autoSaveEnabled: enabled })
})

toggleKeepInLibrary.addEventListener('click', async () => {
  toggleKeepInLibrary.classList.toggle('active')
  const enabled = toggleKeepInLibrary.classList.contains('active')
  await chrome.storage.local.set({ keepInLibrary: enabled })
})

// Initialize
updateUI()

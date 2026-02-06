// IndexedDB helpers for directory handle storage
const DB_NAME = 'SoundCaptureDB'
const DB_VERSION = 2
const DIR_HANDLE_STORE = 'directoryHandle'
let dbInstance = null

async function getDB() {
  if (dbInstance) return dbInstance
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
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

async function saveFullPathToLibrary(handle, fullPath) {
  try {
    // Read existing library or create new one
    let library = { version: 1, recordings: [], folders: [], fullPath: '' }
    try {
      const libraryFile = await handle.getFileHandle('cucubau-library.json')
      const file = await libraryFile.getFile()
      const content = await file.text()
      library = JSON.parse(content)
    } catch (e) {
      // Library doesn't exist, use default
    }

    // Update full path
    library.fullPath = fullPath

    // Write back to disk
    const libraryFile = await handle.getFileHandle('cucubau-library.json', { create: true })
    const writable = await libraryFile.createWritable()
    await writable.write(JSON.stringify(library, null, 2))
    await writable.close()

    return true
  } catch (e) {
    console.error('Failed to save full path to library:', e)
    return false
  }
}

async function getFullPathFromLibrary(handle) {
  try {
    const libraryFile = await handle.getFileHandle('cucubau-library.json')
    const file = await libraryFile.getFile()
    const content = await file.text()
    const library = JSON.parse(content)
    return library.fullPath || null
  } catch (e) {
    return null
  }
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
        resolve({
          handle: request.result.handle,
          name: request.result.name
        })
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
const changeFolderBtn = document.getElementById('changeFolder')
const statusEl = document.getElementById('status')
const recordingCountEl = document.getElementById('recordingCount')
const folderCountEl = document.getElementById('folderCount')
const fullPathSection = document.getElementById('fullPathSection')
const pathPrefixInput = document.getElementById('pathPrefix')
const folderSuffix = document.getElementById('folderSuffix')

let currentFolderName = ''

function buildFullPath() {
  const prefix = pathPrefixInput.value.trim()
  if (!prefix) return ''
  // Ensure prefix ends with / or \
  const separator = prefix.includes('\\') ? '\\' : '/'
  const cleanPrefix = prefix.endsWith('/') || prefix.endsWith('\\') ? prefix : prefix + separator
  return cleanPrefix + currentFolderName
}

async function saveCurrentPath() {
  const fullPath = buildFullPath()
  const dirData = await getDirHandle()
  if (dirData) {
    const success = await saveFullPathToLibrary(dirData.handle, fullPath)
    if (success) {
      showStatus('Path saved!', 'success')
    }
  }
}

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
    currentFolderName = dirData.name
    folderPathEl.textContent = dirData.name
    folderPathEl.classList.remove('not-set')
    folderSuffix.textContent = '/' + dirData.name
    changeFolderBtn.style.display = 'inline-flex'
    chooseFolderBtn.style.display = 'none'

    // Check if we still have permission
    try {
      const permission = await dirData.handle.queryPermission({ mode: 'readwrite' })
      if (permission !== 'granted') {
        showStatus('Permission needed. Click "Change Folder" to re-grant access.', 'warning')
        fullPathSection.style.display = 'none'
      } else {
        // Show full path section and load from library
        fullPathSection.style.display = 'block'
        const fullPath = await getFullPathFromLibrary(dirData.handle)

        if (fullPath) {
          // Extract prefix from saved full path (remove folder name at the end)
          if (fullPath.endsWith(currentFolderName)) {
            const prefix = fullPath.slice(0, -currentFolderName.length)
            // Remove trailing slash
            pathPrefixInput.value = prefix.replace(/[/\\]$/, '')
          } else {
            pathPrefixInput.value = fullPath
          }
        }

        // Try to read library stats
        try {
          const libraryFile = await dirData.handle.getFileHandle('cucubau-library.json')
          const file = await libraryFile.getFile()
          const content = await file.text()
          const library = JSON.parse(content)
          recordingCountEl.textContent = library.recordings?.length || 0
          folderCountEl.textContent = library.folders?.length || 0
        } catch (e) {
          recordingCountEl.textContent = '0'
          folderCountEl.textContent = '0'
        }
      }
    } catch (e) {
      showStatus('Folder access may need to be re-granted.', 'warning')
      fullPathSection.style.display = 'none'
    }
  } else {
    currentFolderName = ''
    folderPathEl.textContent = 'No folder selected'
    folderPathEl.classList.add('not-set')
    changeFolderBtn.style.display = 'none'
    chooseFolderBtn.style.display = 'inline-flex'
    chooseFolderBtn.textContent = 'Choose Folder'
    fullPathSection.style.display = 'none'
    recordingCountEl.textContent = '-'
    folderCountEl.textContent = '-'
  }
}

chooseFolderBtn.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await saveDirHandle(handle)
    showStatus('Folder selected successfully! Restart the extension popup to use it.', 'success')
    await updateUI()
  } catch (err) {
    if (err.name !== 'AbortError') {
      showStatus('Failed to select folder: ' + err.message, 'error')
    }
  }
})

changeFolderBtn.addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
    await saveDirHandle(handle)
    showStatus('Folder changed! Restart the extension popup to use it.', 'success')
    await updateUI()
  } catch (err) {
    if (err.name !== 'AbortError') {
      showStatus('Failed to select folder: ' + err.message, 'error')
    }
  }
})

// Path prefix input change - debounced save
let saveTimeout = null
pathPrefixInput.addEventListener('input', () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(saveCurrentPath, 500)
})

// Initialize
updateUI()

import type { Recording, Folder } from '../types'
import type { StorageResult, LibraryData } from './types'
import { ok, err, buildFolderPath, getRecordingDiskPath, LIBRARY_VERSION } from './types'
import { fileSystemStorage, FileSystemStorage } from './FileSystemStorage'
import { saveDirHandle, getDirHandle, clearDirHandle } from '../lib/db'

/**
 * High-level storage service that manages library data and syncs with file system.
 * This is the main API that the app should use for all storage operations.
 */
export class StorageService {
  private static instance: StorageService | null = null

  private fs: FileSystemStorage
  private library: LibraryData | null = null
  private initialized = false

  private constructor(fs: FileSystemStorage) {
    this.fs = fs
  }

  // ============================================================================
  // Singleton & Initialization
  // ============================================================================

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService(fileSystemStorage)
    }
    return StorageService.instance
  }

  static isInitialized(): boolean {
    return StorageService.instance?.initialized ?? false
  }

  /**
   * Initialize the storage service. Loads directory handle from IndexedDB.
   * Returns error if no folder is selected or permission is denied.
   */
  async initialize(): Promise<StorageResult<void>> {
    // Try to load saved directory handle
    const handleData = await getDirHandle()

    if (!handleData) {
      return err({ type: 'NO_FOLDER_SELECTED' })
    }

    this.fs.initialize(handleData.handle)

    // Check permission - if 'prompt', we need user gesture to request
    // If 'denied', user explicitly denied access
    const permissionStatus = await this.fs.checkPermission()
    if (permissionStatus === 'denied') {
      return err({ type: 'PERMISSION_DENIED' })
    }
    if (permissionStatus === 'prompt') {
      // Permission not yet granted in this session - need user interaction
      return err({ type: 'PERMISSION_PROMPT_NEEDED' })
    }

    // Load library
    const libraryResult = await this.fs.readLibrary()
    if (!libraryResult.success) {
      return libraryResult as StorageResult<void>
    }

    // Initialize empty library if none exists
    if (!libraryResult.data) {
      this.library = {
        version: LIBRARY_VERSION,
        exportedAt: new Date().toISOString(),
        recordings: [],
        folders: []
      }
      await this.saveLibrary()
    } else {
      this.library = libraryResult.data
      // De-duplicate recordings by ID (keep first occurrence)
      const seenIds = new Set<string>()
      const dedupedRecordings: Recording[] = []
      for (const rec of this.library.recordings) {
        if (!seenIds.has(rec.id)) {
          seenIds.add(rec.id)
          dedupedRecordings.push(rec)
        }
      }
      if (dedupedRecordings.length !== this.library.recordings.length) {
        console.warn(`De-duplicated ${this.library.recordings.length - dedupedRecordings.length} recording(s)`)
        this.library.recordings = dedupedRecordings
        await this.saveLibrary()
      }
    }

    this.initialized = true
    return ok(undefined)
  }

  /**
   * Request permission to access the directory.
   */
  async requestPermission(): Promise<StorageResult<void>> {
    const granted = await this.fs.requestPermission()
    if (!granted) {
      return err({ type: 'PERMISSION_DENIED' })
    }

    // Re-initialize after permission granted
    return this.initialize()
  }

  /**
   * Open directory picker and save the selected folder.
   */
  async selectFolder(): Promise<StorageResult<void>> {
    try {
      // This must be called from a user gesture context (popup is fine)
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })

      // Save handle to IndexedDB for persistence
      await saveDirHandle(handle)

      // Initialize with new handle
      this.fs.initialize(handle)

      // Create or load library
      const libraryResult = await this.fs.readLibrary()
      if (!libraryResult.success) {
        return libraryResult as StorageResult<void>
      }

      if (!libraryResult.data) {
        this.library = {
          version: LIBRARY_VERSION,
          exportedAt: new Date().toISOString(),
          recordings: [],
          folders: []
        }
        await this.saveLibrary()
      } else {
        this.library = libraryResult.data
      }

      this.initialized = true
      return ok(undefined)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // User cancelled - not an error
        return err({ type: 'NO_FOLDER_SELECTED' })
      }
      return err({ type: 'WRITE_FAILED', reason: String(e) })
    }
  }

  /**
   * Clear the saved folder and reset state.
   */
  async clearFolder(): Promise<void> {
    await clearDirHandle()
    this.library = null
    this.initialized = false
  }

  /**
   * Get the name of the selected folder.
   */
  async getFolderName(): Promise<string | null> {
    const handleData = await getDirHandle()
    return handleData?.name ?? null
  }

  /**
   * Get the full path to the library folder (user-configured in settings).
   */
  getFullPath(): string | null {
    return this.library?.fullPath ?? null
  }

  // ============================================================================
  // Library Access
  // ============================================================================

  getLibrary(): LibraryData | null {
    return this.library
  }

  getRecordings(): Recording[] {
    return this.library?.recordings ?? []
  }

  getFolders(): Folder[] {
    return this.library?.folders ?? []
  }

  private async saveLibrary(): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'No library loaded' })
    }
    return this.fs.writeLibrary(this.library)
  }

  // ============================================================================
  // Folder Operations
  // ============================================================================

  /**
   * Create a new folder, both in library and on disk.
   */
  async createFolder(name: string, parentId: string | null, color: string): Promise<StorageResult<Folder>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    // Build disk path for new folder
    const parentPath = buildFolderPath(parentId, this.library.folders)
    const folderPath = [...parentPath, name]

    // Create directory on disk
    const dirResult = await this.fs.getOrCreateDirectory(folderPath)
    if (!dirResult.success) {
      return dirResult as StorageResult<Folder>
    }

    // Create folder object
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      color,
      createdAt: Date.now(),
      sortOrder: this.library.folders.filter(f => f.parentId === parentId).length
    }

    // Update library
    this.library.folders.push(newFolder)
    const saveResult = await this.saveLibrary()
    if (!saveResult.success) {
      return saveResult as StorageResult<Folder>
    }

    return ok(newFolder)
  }

  /**
   * Rename a folder, both in library and on disk.
   */
  async renameFolder(id: string, newName: string): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const folder = this.library.folders.find(f => f.id === id)
    if (!folder) {
      return err({ type: 'FOLDER_NOT_FOUND', path: id })
    }

    // Build current disk path
    const folderPath = buildFolderPath(id, this.library.folders)

    // Rename on disk
    const renameResult = await this.fs.renameDirectory(folderPath, newName)
    if (!renameResult.success) {
      return renameResult
    }

    // Update library
    folder.name = newName
    return this.saveLibrary()
  }

  /**
   * Delete a folder.
   * @param deleteChildren If true, delete all contents. If false, move contents to parent folder.
   */
  async deleteFolder(id: string, deleteChildren = false): Promise<StorageResult<{ folders: Folder[]; recordings: Recording[] }>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const folder = this.library.folders.find(f => f.id === id)
    if (!folder) {
      return err({ type: 'FOLDER_NOT_FOUND', path: id })
    }

    const folderPath = buildFolderPath(id, this.library.folders)
    const parentPath = folderPath.slice(0, -1)

    // Get all recordings and child folders
    const recordingsInFolder = this.library.recordings.filter(r => r.folderId === id)
    const childFolders = this.library.folders.filter(f => f.parentId === id)

    if (deleteChildren) {
      // Recursively delete all child folders first
      for (const child of childFolders) {
        await this.deleteFolder(child.id, true)
      }

      // Delete all recordings in this folder (and their crops)
      for (const rec of recordingsInFolder) {
        await this.deleteRecording(rec.id, true)
      }

      // Delete the folder from disk
      const deleteResult = await this.fs.deleteDirectory(folderPath, true)
      if (!deleteResult.success) {
        console.error('Failed to delete folder directory:', deleteResult.error)
      }
    } else {
      // Move all recordings in this folder to parent
      for (const rec of recordingsInFolder) {
        const moveResult = await this.fs.moveFile(folderPath, rec.filename, parentPath)
        if (!moveResult.success) {
          console.error('Failed to move file during folder delete:', rec.filename, moveResult.error)
        }
        // Update recording's folderId
        rec.folderId = folder.parentId || 'uncategorized'
      }

      // Move child folders to parent
      for (const child of childFolders) {
        const childPath = buildFolderPath(child.id, this.library.folders)
        const moveResult = await this.fs.moveDirectory(childPath, parentPath)
        if (!moveResult.success) {
          console.error('Failed to move child folder:', child.name, moveResult.error)
        }
        child.parentId = folder.parentId
      }

      // Delete the now-empty folder from disk
      const deleteResult = await this.fs.deleteDirectory(folderPath, true)
      if (!deleteResult.success) {
        console.error('Failed to delete folder directory:', deleteResult.error)
      }
    }

    // Remove folder from library
    this.library.folders = this.library.folders.filter(f => f.id !== id)

    // Save library
    const saveResult = await this.saveLibrary()
    if (!saveResult.success) {
      return saveResult as StorageResult<{ folders: Folder[]; recordings: Recording[] }>
    }

    return ok({
      folders: this.library.folders,
      recordings: this.library.recordings
    })
  }

  /**
   * Move a folder to a new parent.
   */
  async moveFolder(id: string, newParentId: string | null): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const folder = this.library.folders.find(f => f.id === id)
    if (!folder) {
      return err({ type: 'FOLDER_NOT_FOUND', path: id })
    }

    // Prevent moving to self or descendant (cycle check)
    let current = newParentId
    while (current) {
      if (current === id) {
        return err({ type: 'INVALID_OPERATION', reason: 'Cannot move folder into itself or descendant' })
      }
      const parent = this.library.folders.find(f => f.id === current)
      current = parent?.parentId ?? null
    }

    // Build paths
    const oldPath = buildFolderPath(id, this.library.folders)
    const newParentPath = buildFolderPath(newParentId, this.library.folders)

    // Move on disk
    const moveResult = await this.fs.moveDirectory(oldPath, newParentPath)
    if (!moveResult.success) {
      return moveResult
    }

    // Update library
    folder.parentId = newParentId
    return this.saveLibrary()
  }

  // ============================================================================
  // Recording Operations
  // ============================================================================

  /**
   * Save a new recording. Writes WAV file and updates library.
   */
  async saveRecording(recording: Recording, wavBlob: Blob): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    // Get disk path for recording
    const diskPath = getRecordingDiskPath(recording, this.library.folders)

    // Write WAV file
    const writeResult = await this.fs.writeFile(diskPath, recording.filename, wavBlob)
    if (!writeResult.success) {
      return writeResult
    }

    // Add to library
    this.library.recordings.push(recording)
    return this.saveLibrary()
  }

  /**
   * Delete a recording. Removes file and updates library.
   */
  async deleteRecording(id: string, deleteChildren = true): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const recording = this.library.recordings.find(r => r.id === id)
    if (!recording) {
      return err({ type: 'FILE_NOT_FOUND', filename: id })
    }

    // Delete file from disk (searches multiple paths)
    await this.deleteRecordingFile(recording)

    const crops = this.library.recordings.filter(r => r.parentId === id)

    if (deleteChildren) {
      // Delete crops and their files
      for (const crop of crops) {
        await this.deleteRecordingFile(crop)
      }
      // Remove recording and its crops from library in one operation
      const idsToRemove = new Set([id, ...crops.map(c => c.id)])
      this.library.recordings = this.library.recordings.filter(r => !idsToRemove.has(r.id))
    } else {
      // Keep crops but make them independent (parentId already removed in App.tsx)
      // Just remove the parent recording
      this.library.recordings = this.library.recordings.filter(r => r.id !== id)
    }

    return this.saveLibrary()
  }

  /**
   * Delete a recording file from disk, searching multiple paths if needed.
   */
  private async deleteRecordingFile(recording: Recording): Promise<void> {
    if (!this.library) return

    // Get expected disk path based on folderId
    const diskPath = getRecordingDiskPath(recording, this.library.folders)

    // Try to find the file - it might not be at the expected path
    // (e.g., if folderId was changed via reorder but file wasn't moved)
    let actualPath = diskPath
    let fileExists = await this.fs.fileExists(diskPath, recording.filename)

    if (!fileExists) {
      // Try root folder
      fileExists = await this.fs.fileExists([], recording.filename)
      if (fileExists) {
        actualPath = []
      } else {
        // Try all folder paths
        for (const folder of this.library.folders) {
          const folderPath = buildFolderPath(folder.id, this.library.folders)
          fileExists = await this.fs.fileExists(folderPath, recording.filename)
          if (fileExists) {
            actualPath = folderPath
            break
          }
        }
      }
    }

    // Delete file from disk if found
    if (fileExists) {
      await this.fs.deleteFile(actualPath, recording.filename)
    }
  }

  /**
   * Move a recording to a different folder.
   */
  async moveRecording(id: string, newFolderId: string): Promise<StorageResult<Recording>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const recording = this.library.recordings.find(r => r.id === id)
    if (!recording) {
      return err({ type: 'FILE_NOT_FOUND', filename: id })
    }

    // Check for name conflict in destination folder
    const existingInFolder = this.library.recordings.find(r =>
      r.id !== id &&
      r.folderId === newFolderId &&
      r.tabTitle === recording.tabTitle
    )
    if (existingInFolder) {
      return err({ type: 'NAME_CONFLICT', existingName: recording.tabTitle })
    }

    const oldPath = getRecordingDiskPath(recording, this.library.folders)
    const newPath = buildFolderPath(newFolderId, this.library.folders)

    // Try to find the file - it might not be at the expected path
    let actualOldPath = oldPath
    let fileExists = await this.fs.fileExists(oldPath, recording.filename)

    if (!fileExists) {
      // Try root folder
      fileExists = await this.fs.fileExists([], recording.filename)
      if (fileExists) {
        actualOldPath = []
      } else {
        // Try all folder paths
        for (const folder of this.library.folders) {
          const folderPath = buildFolderPath(folder.id, this.library.folders)
          fileExists = await this.fs.fileExists(folderPath, recording.filename)
          if (fileExists) {
            actualOldPath = folderPath
            break
          }
        }
      }
    }

    if (!fileExists) {
      // File doesn't exist anywhere - just update metadata
      recording.folderId = newFolderId
      if (recording.parentId) {
        delete recording.parentId
      }
      const saveResult = await this.saveLibrary()
      if (!saveResult.success) {
        return saveResult as StorageResult<Recording>
      }
      return ok(recording)
    }

    // Move file on disk
    const moveResult = await this.fs.moveFile(actualOldPath, recording.filename, newPath)
    if (!moveResult.success) {
      return moveResult as StorageResult<Recording>
    }

    // Update recording
    recording.folderId = newFolderId
    // If this was a crop, remove parentId since it's now independent
    if (recording.parentId) {
      delete recording.parentId
    }
    const saveResult = await this.saveLibrary()
    if (!saveResult.success) {
      return saveResult as StorageResult<Recording>
    }

    return ok(recording)
  }

  /**
   * Move recording with a new name (for resolving conflicts).
   */
  async moveRecordingWithRename(id: string, newFolderId: string, newTitle: string): Promise<StorageResult<Recording>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const recording = this.library.recordings.find(r => r.id === id)
    if (!recording) {
      return err({ type: 'FILE_NOT_FOUND', filename: id })
    }

    // Check for name conflict with new title
    const existingInFolder = this.library.recordings.find(r =>
      r.id !== id &&
      r.folderId === newFolderId &&
      r.tabTitle === newTitle
    )
    if (existingInFolder) {
      return err({ type: 'NAME_CONFLICT', existingName: newTitle })
    }

    const oldPath = getRecordingDiskPath(recording, this.library.folders)
    const newPath = buildFolderPath(newFolderId, this.library.folders)

    // Move file on disk
    const moveResult = await this.fs.moveFile(oldPath, recording.filename, newPath)
    if (!moveResult.success) {
      return moveResult as StorageResult<Recording>
    }

    // Update recording
    recording.folderId = newFolderId
    recording.tabTitle = newTitle
    if (recording.parentId) {
      delete recording.parentId
    }

    const saveResult = await this.saveLibrary()
    if (!saveResult.success) {
      return saveResult as StorageResult<Recording>
    }

    return ok(recording)
  }

  /**
   * Update recording metadata (doesn't touch the file).
   */
  async updateRecording(recording: Recording): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const index = this.library.recordings.findIndex(r => r.id === recording.id)
    if (index === -1) {
      return err({ type: 'FILE_NOT_FOUND', filename: recording.id })
    }

    this.library.recordings[index] = recording
    return this.saveLibrary()
  }

  /**
   * Rename a recording (renames file on disk and updates library).
   */
  async renameRecording(id: string, newFilename: string): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const recording = this.library.recordings.find(r => r.id === id)
    if (!recording) {
      return err({ type: 'FILE_NOT_FOUND', filename: id })
    }

    const diskPath = getRecordingDiskPath(recording, this.library.folders)

    // Read old file
    const readResult = await this.fs.readFile(diskPath, recording.filename)
    if (!readResult.success) {
      return readResult as StorageResult<void>
    }

    // Write with new name
    const writeResult = await this.fs.writeFile(diskPath, newFilename, readResult.data)
    if (!writeResult.success) {
      return writeResult
    }

    // Delete old file
    await this.fs.deleteFile(diskPath, recording.filename)

    // Update library
    recording.filename = newFilename
    return this.saveLibrary()
  }

  // ============================================================================
  // Playback
  // ============================================================================

  /**
   * Get audio blob for playback.
   */
  async getRecordingBlob(id: string): Promise<StorageResult<Blob>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    const recording = this.library.recordings.find(r => r.id === id)
    if (!recording) {
      return err({ type: 'FILE_NOT_FOUND', filename: id })
    }

    // Get expected disk path based on folderId
    const diskPath = getRecordingDiskPath(recording, this.library.folders)

    // Try expected path first
    let result = await this.fs.readFile(diskPath, recording.filename)
    if (result.success) return result

    // Try root folder
    result = await this.fs.readFile([], recording.filename)
    if (result.success) return result

    // Try all folder paths
    for (const folder of this.library.folders) {
      const folderPath = buildFolderPath(folder.id, this.library.folders)
      result = await this.fs.readFile(folderPath, recording.filename)
      if (result.success) return result
    }

    // File not found anywhere
    return err({ type: 'FILE_NOT_FOUND', filename: recording.filename })
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Update multiple recordings at once (for reordering, etc).
   */
  async updateRecordings(recordings: Recording[]): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    // De-duplicate by ID (keep first occurrence)
    const seenIds = new Set<string>()
    const deduped: Recording[] = []
    for (const rec of recordings) {
      if (!seenIds.has(rec.id)) {
        seenIds.add(rec.id)
        deduped.push(rec)
      }
    }

    this.library.recordings = deduped
    return this.saveLibrary()
  }

  /**
   * Update multiple folders at once (for reordering, etc).
   */
  async updateFolders(folders: Folder[]): Promise<StorageResult<void>> {
    if (!this.library) {
      return err({ type: 'INVALID_OPERATION', reason: 'Storage not initialized' })
    }

    this.library.folders = folders
    return this.saveLibrary()
  }
}

// Export singleton getter
export const getStorageService = () => StorageService.getInstance()

import type { StorageResult, LibraryData } from './types'
import { ok, err, LIBRARY_FILENAME, LIBRARY_VERSION } from './types'

// Extend FileSystemDirectoryHandle with experimental methods
interface FileSystemDirectoryHandleExtended extends FileSystemDirectoryHandle {
  queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  values(): AsyncIterableIterator<FileSystemHandle>
}

/**
 * Low-level wrapper for File System Access API.
 * Handles all direct interactions with the user's selected directory.
 */
export class FileSystemStorage {
  private rootHandle: FileSystemDirectoryHandleExtended | null = null

  // ============================================================================
  // Initialization & Permissions
  // ============================================================================

  initialize(handle: FileSystemDirectoryHandle): void {
    this.rootHandle = handle as FileSystemDirectoryHandleExtended
  }

  isInitialized(): boolean {
    return this.rootHandle !== null
  }

  getHandle(): FileSystemDirectoryHandle | null {
    return this.rootHandle
  }

  async hasPermission(): Promise<boolean> {
    if (!this.rootHandle) return false
    try {
      const permission = await this.rootHandle.queryPermission({ mode: 'readwrite' })
      return permission === 'granted'
    } catch {
      return false
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.rootHandle) return false
    try {
      const permission = await this.rootHandle.requestPermission({ mode: 'readwrite' })
      return permission === 'granted'
    } catch {
      return false
    }
  }

  async checkPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!this.rootHandle) return 'denied'
    try {
      return await this.rootHandle.queryPermission({ mode: 'readwrite' })
    } catch {
      return 'denied'
    }
  }

  // ============================================================================
  // Directory Operations
  // ============================================================================

  /**
   * Navigate to a directory path, optionally creating directories along the way.
   * @param path Array of directory names, e.g. ["Beats", "Trap", "Hard Trap"]
   * @param create If true, creates directories that don't exist
   */
  async getDirectory(path: string[], create = false): Promise<StorageResult<FileSystemDirectoryHandle>> {
    if (!this.rootHandle) {
      return err({ type: 'NO_FOLDER_SELECTED' })
    }

    try {
      let current: FileSystemDirectoryHandle = this.rootHandle
      for (const name of path) {
        current = await current.getDirectoryHandle(name, { create })
      }
      return ok(current)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        return err({ type: 'FOLDER_NOT_FOUND', path: path.join('/') })
      }
      return err({ type: 'READ_FAILED', reason: String(e) })
    }
  }

  /**
   * Get or create a directory at the given path.
   */
  async getOrCreateDirectory(path: string[]): Promise<StorageResult<FileSystemDirectoryHandle>> {
    return this.getDirectory(path, true)
  }

  /**
   * Check if a directory exists at the given path.
   */
  async directoryExists(path: string[]): Promise<boolean> {
    const result = await this.getDirectory(path, false)
    return result.success
  }

  /**
   * Delete a directory. If recursive is true, deletes all contents.
   */
  async deleteDirectory(path: string[], recursive = false): Promise<StorageResult<void>> {
    if (!this.rootHandle || path.length === 0) {
      return err({ type: 'INVALID_OPERATION', reason: 'Cannot delete root directory' })
    }

    try {
      const parentPath = path.slice(0, -1)
      const dirName = path[path.length - 1]

      const parentResult = await this.getDirectory(parentPath, false)
      if (!parentResult.success) return parentResult as StorageResult<void>

      await parentResult.data.removeEntry(dirName, { recursive })
      return ok(undefined)
    } catch (e) {
      return err({ type: 'DELETE_FAILED', reason: String(e) })
    }
  }

  /**
   * Rename a directory by copying contents to new name and deleting old.
   * File System Access API doesn't support direct rename.
   */
  async renameDirectory(path: string[], newName: string): Promise<StorageResult<void>> {
    if (!this.rootHandle || path.length === 0) {
      return err({ type: 'INVALID_OPERATION', reason: 'Cannot rename root directory' })
    }

    try {
      const parentPath = path.slice(0, -1)
      const oldName = path[path.length - 1]

      // Get parent directory
      const parentResult = await this.getDirectory(parentPath, false)
      if (!parentResult.success) return parentResult as StorageResult<void>
      const parent = parentResult.data

      // Get old directory
      const oldDir = await parent.getDirectoryHandle(oldName)

      // Create new directory
      const newDir = await parent.getDirectoryHandle(newName, { create: true })

      // Copy all contents
      await this.copyDirectoryContents(oldDir, newDir)

      // Delete old directory
      await parent.removeEntry(oldName, { recursive: true })

      return ok(undefined)
    } catch (e) {
      return err({ type: 'WRITE_FAILED', reason: String(e) })
    }
  }

  /**
   * Move a directory from one location to another.
   */
  async moveDirectory(fromPath: string[], toParentPath: string[]): Promise<StorageResult<void>> {
    if (!this.rootHandle || fromPath.length === 0) {
      return err({ type: 'INVALID_OPERATION', reason: 'Cannot move root directory' })
    }

    try {
      const dirName = fromPath[fromPath.length - 1]
      const fromParentPath = fromPath.slice(0, -1)

      // Get source directory
      const sourceResult = await this.getDirectory(fromPath, false)
      if (!sourceResult.success) return sourceResult as StorageResult<void>
      const sourceDir = sourceResult.data

      // Get or create destination parent
      const destParentResult = await this.getOrCreateDirectory(toParentPath)
      if (!destParentResult.success) return destParentResult as StorageResult<void>
      const destParent = destParentResult.data

      // Create new directory in destination
      const newDir = await destParent.getDirectoryHandle(dirName, { create: true })

      // Copy all contents
      await this.copyDirectoryContents(sourceDir, newDir)

      // Delete from source location
      const fromParentResult = await this.getDirectory(fromParentPath, false)
      if (fromParentResult.success) {
        await fromParentResult.data.removeEntry(dirName, { recursive: true })
      }

      return ok(undefined)
    } catch (e) {
      return err({ type: 'WRITE_FAILED', reason: String(e) })
    }
  }

  /**
   * List contents of a directory.
   */
  async listDirectory(path: string[]): Promise<StorageResult<{ files: string[]; directories: string[] }>> {
    try {
      let dir: FileSystemDirectoryHandle

      if (path.length === 0) {
        if (!this.rootHandle) {
          return err({ type: 'NO_FOLDER_SELECTED' })
        }
        dir = this.rootHandle
      } else {
        const dirResult = await this.getDirectory(path, false)
        if (!dirResult.success) {
          return dirResult as StorageResult<{ files: string[]; directories: string[] }>
        }
        dir = dirResult.data
      }

      const files: string[] = []
      const directories: string[] = []

      for await (const entry of (dir as FileSystemDirectoryHandleExtended).values()) {
        if (entry.kind === 'file') {
          files.push(entry.name)
        } else {
          directories.push(entry.name)
        }
      }

      return ok({ files, directories })
    } catch (e) {
      return err({ type: 'READ_FAILED', reason: String(e) })
    }
  }

  // ============================================================================
  // File Operations
  // ============================================================================

  /**
   * Write a file to the specified directory path.
   */
  async writeFile(dirPath: string[], filename: string, blob: Blob): Promise<StorageResult<void>> {
    try {
      const dirResult = await this.getOrCreateDirectory(dirPath)
      if (!dirResult.success) return dirResult as StorageResult<void>

      const fileHandle = await dirResult.data.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(blob)
      await writable.close()

      return ok(undefined)
    } catch (e) {
      return err({ type: 'WRITE_FAILED', reason: String(e) })
    }
  }

  /**
   * Read a file from the specified directory path.
   */
  async readFile(dirPath: string[], filename: string): Promise<StorageResult<Blob>> {
    try {
      const dirResult = await this.getDirectory(dirPath, false)
      if (!dirResult.success) return dirResult as StorageResult<Blob>

      const fileHandle = await dirResult.data.getFileHandle(filename)
      const file = await fileHandle.getFile()
      return ok(file)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        return err({ type: 'FILE_NOT_FOUND', filename })
      }
      return err({ type: 'READ_FAILED', reason: String(e) })
    }
  }

  /**
   * Delete a file from the specified directory path.
   */
  async deleteFile(dirPath: string[], filename: string): Promise<StorageResult<void>> {
    try {
      const dirResult = await this.getDirectory(dirPath, false)
      if (!dirResult.success) return dirResult as StorageResult<void>

      await dirResult.data.removeEntry(filename)
      return ok(undefined)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotFoundError') {
        // File already doesn't exist, that's fine
        return ok(undefined)
      }
      return err({ type: 'DELETE_FAILED', reason: String(e) })
    }
  }

  /**
   * Move a file from one directory to another.
   */
  async moveFile(fromPath: string[], filename: string, toPath: string[]): Promise<StorageResult<void>> {
    try {
      // Read the file
      const readResult = await this.readFile(fromPath, filename)
      if (!readResult.success) return readResult as StorageResult<void>

      // Write to new location
      const writeResult = await this.writeFile(toPath, filename, readResult.data)
      if (!writeResult.success) return writeResult

      // Delete from old location
      const deleteResult = await this.deleteFile(fromPath, filename)
      if (!deleteResult.success) return deleteResult

      return ok(undefined)
    } catch (e) {
      return err({ type: 'WRITE_FAILED', reason: String(e) })
    }
  }

  /**
   * Check if a file exists.
   */
  async fileExists(dirPath: string[], filename: string): Promise<boolean> {
    try {
      const dirResult = await this.getDirectory(dirPath, false)
      if (!dirResult.success) return false

      await dirResult.data.getFileHandle(filename)
      return true
    } catch {
      return false
    }
  }

  // ============================================================================
  // Library JSON Operations
  // ============================================================================

  /**
   * Read the library JSON file from root directory.
   */
  async readLibrary(): Promise<StorageResult<LibraryData | null>> {
    const readResult = await this.readFile([], LIBRARY_FILENAME)
    if (!readResult.success) {
      if (readResult.error.type === 'FILE_NOT_FOUND') {
        return ok(null)
      }
      return readResult as StorageResult<LibraryData | null>
    }

    try {
      const text = await readResult.data.text()
      const data = JSON.parse(text) as LibraryData
      return ok(data)
    } catch (e) {
      return err({ type: 'READ_FAILED', reason: 'Invalid JSON: ' + String(e) })
    }
  }

  /**
   * Write the library JSON file to root directory.
   */
  async writeLibrary(data: LibraryData): Promise<StorageResult<void>> {
    const jsonData: LibraryData = {
      ...data,
      version: LIBRARY_VERSION,
      exportedAt: new Date().toISOString()
    }

    const json = JSON.stringify(jsonData, null, 2)
    const blob = new Blob([json], { type: 'application/json' })

    return this.writeFile([], LIBRARY_FILENAME, blob)
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Recursively copy contents from one directory to another.
   */
  private async copyDirectoryContents(
    source: FileSystemDirectoryHandle,
    dest: FileSystemDirectoryHandle
  ): Promise<void> {
    for await (const entry of (source as FileSystemDirectoryHandleExtended).values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const destFile = await dest.getFileHandle(entry.name, { create: true })
        const writable = await destFile.createWritable()
        await writable.write(file)
        await writable.close()
      } else {
        const subSource = await source.getDirectoryHandle(entry.name)
        const subDest = await dest.getDirectoryHandle(entry.name, { create: true })
        await this.copyDirectoryContents(subSource, subDest)
      }
    }
  }
}

// Singleton instance
export const fileSystemStorage = new FileSystemStorage()

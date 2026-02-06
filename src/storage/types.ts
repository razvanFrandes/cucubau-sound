import type { Recording, Folder } from '../types'

// Result pattern for error handling (no throwing)
export type StorageResult<T> =
  | { success: true; data: T }
  | { success: false; error: StorageError }

export type StorageError =
  | { type: 'NO_FOLDER_SELECTED' }
  | { type: 'PERMISSION_DENIED' }
  | { type: 'PERMISSION_PROMPT_NEEDED' }
  | { type: 'FOLDER_NOT_FOUND'; path: string }
  | { type: 'FILE_NOT_FOUND'; filename: string }
  | { type: 'WRITE_FAILED'; reason: string }
  | { type: 'READ_FAILED'; reason: string }
  | { type: 'DELETE_FAILED'; reason: string }
  | { type: 'INVALID_OPERATION'; reason: string }
  | { type: 'NAME_CONFLICT'; existingName: string }

export interface LibraryData {
  version: number
  exportedAt: string
  recordings: Recording[]
  folders: Folder[]
  fullPath?: string  // User-configured full path to the folder (for copy path feature)
}

export const LIBRARY_VERSION = 1
export const LIBRARY_FILENAME = 'cucubau-library.json'

// Helper to create success result
export function ok<T>(data: T): StorageResult<T> {
  return { success: true, data }
}

// Helper to create error result
export function err<T>(error: StorageError): StorageResult<T> {
  return { success: false, error }
}

// Build folder path array from folder id by walking up the parent chain
export function buildFolderPath(folderId: string | null, folders: Folder[]): string[] {
  if (!folderId || folderId === 'uncategorized') return []

  const path: string[] = []
  let currentId: string | null = folderId

  while (currentId) {
    const folder = folders.find(f => f.id === currentId)
    if (!folder) break
    path.unshift(folder.name)
    currentId = folder.parentId
  }

  return path
}

// Get the disk path for a recording (folder path where it should be stored)
export function getRecordingDiskPath(recording: Recording, folders: Folder[]): string[] {
  return buildFolderPath(recording.folderId, folders)
}

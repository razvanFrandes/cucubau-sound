import type { Recording, Folder } from '../types'
import type { StorageResult } from './types'
import { ok, err, LIBRARY_VERSION } from './types'
import { StorageService } from './StorageService'
import { getAudioBlob, getAllAudioIds, clearAllAudio } from '../lib/db'

/**
 * Migration service for moving data from old storage (chrome.storage.local + IndexedDB)
 * to the new file system based storage.
 */
export class MigrationService {
  /**
   * Check if there's old data that needs migration.
   */
  static async needsMigration(): Promise<boolean> {
    try {
      // Check if there are recordings in chrome.storage.local
      const result = await chrome.storage.local.get(['recordings', 'folders'])
      const recordings = (result.recordings || []) as Recording[]
      const folders = (result.folders || []) as Folder[]

      // Check if there are audio blobs in IndexedDB
      const audioIds = await getAllAudioIds()

      return recordings.length > 0 || folders.length > 0 || audioIds.length > 0
    } catch {
      return false
    }
  }

  /**
   * Get count of items to migrate (for progress display).
   */
  static async getMigrationCount(): Promise<{ recordings: number; folders: number; blobs: number }> {
    try {
      const result = await chrome.storage.local.get(['recordings', 'folders'])
      const recordings = (result.recordings || []) as Recording[]
      const folders = (result.folders || []) as Folder[]
      const audioIds = await getAllAudioIds()

      return {
        recordings: recordings.length,
        folders: folders.length,
        blobs: audioIds.length
      }
    } catch {
      return { recordings: 0, folders: 0, blobs: 0 }
    }
  }

  /**
   * Migrate all data from old storage to new file system storage.
   *
   * @param storageService - Initialized StorageService with folder selected
   * @param onProgress - Optional callback for progress updates
   */
  static async migrate(
    storageService: StorageService,
    onProgress?: (message: string, current: number, total: number) => void
  ): Promise<StorageResult<void>> {
    try {
      // Get old data
      const result = await chrome.storage.local.get(['recordings', 'folders'])
      const oldRecordings = (result.recordings || []) as Recording[]
      const oldFolders = (result.folders || []) as Folder[]

      const totalSteps = oldFolders.length + oldRecordings.length + 1 // +1 for cleanup
      let currentStep = 0

      // Step 1: Create folder structure on disk
      // Sort folders by depth (parents first) to create in correct order
      const sortedFolders = this.sortFoldersByDepth(oldFolders)

      for (const folder of sortedFolders) {
        currentStep++
        onProgress?.(`Creating folder: ${folder.name}`, currentStep, totalSteps)

        const createResult = await storageService.createFolder(
          folder.name,
          folder.parentId,
          folder.color
        )

        if (!createResult.success) {
          console.warn(`Failed to create folder ${folder.name}:`, createResult.error)
          // Continue with other folders - non-fatal
        }
      }

      // Build a map from old folder IDs to new folder IDs
      const newFolders = storageService.getFolders()
      const folderIdMap = this.buildFolderIdMap(oldFolders, newFolders)

      // Step 2: Migrate recordings
      for (const rec of oldRecordings) {
        currentStep++
        onProgress?.(`Migrating: ${rec.tabTitle || rec.filename}`, currentStep, totalSteps)

        // Get audio blob from IndexedDB
        const blob = await getAudioBlob(rec.id)

        if (!blob) {
          console.warn(`No audio blob found for recording ${rec.id}, skipping`)
          continue
        }

        // Convert webm to WAV if needed
        const wavBlob = await this.ensureWavFormat(blob, rec.filename)

        // Map old folderId to new folderId
        const newFolderId = rec.folderId === 'uncategorized'
          ? 'uncategorized'
          : folderIdMap.get(rec.folderId) || 'uncategorized'

        // Create new recording object with updated folderId
        const newRecording: Recording = {
          ...rec,
          folderId: newFolderId,
          // Ensure filename has .wav extension
          filename: rec.filename.replace(/\.(webm|wav)$/i, '.wav')
        }

        // Save to new storage
        const saveResult = await storageService.saveRecording(newRecording, wavBlob)

        if (!saveResult.success) {
          console.warn(`Failed to migrate recording ${rec.id}:`, saveResult.error)
          // Continue with other recordings - non-fatal
        }
      }

      // Step 3: Clean up old storage
      currentStep++
      onProgress?.('Cleaning up old storage...', currentStep, totalSteps)

      await this.cleanupOldStorage()

      return ok(undefined)
    } catch (e) {
      return err({ type: 'WRITE_FAILED', reason: `Migration failed: ${String(e)}` })
    }
  }

  /**
   * Sort folders so parents come before children.
   */
  private static sortFoldersByDepth(folders: Folder[]): Folder[] {
    const getDepth = (folder: Folder): number => {
      let depth = 0
      let currentId = folder.parentId
      while (currentId) {
        depth++
        const parent = folders.find(f => f.id === currentId)
        currentId = parent?.parentId ?? null
      }
      return depth
    }

    return [...folders].sort((a, b) => getDepth(a) - getDepth(b))
  }

  /**
   * Build a map from old folder IDs to new folder IDs.
   * Matches by name and parent structure.
   */
  private static buildFolderIdMap(oldFolders: Folder[], newFolders: Folder[]): Map<string, string> {
    const map = new Map<string, string>()

    // Build path for each folder
    const getPath = (folder: Folder, folders: Folder[]): string => {
      const parts: string[] = [folder.name]
      let currentId = folder.parentId
      while (currentId) {
        const parent = folders.find(f => f.id === currentId)
        if (parent) {
          parts.unshift(parent.name)
          currentId = parent.parentId
        } else {
          break
        }
      }
      return parts.join('/')
    }

    // Map old paths to new folder IDs
    const newPathMap = new Map<string, string>()
    for (const folder of newFolders) {
      newPathMap.set(getPath(folder, newFolders), folder.id)
    }

    for (const oldFolder of oldFolders) {
      const path = getPath(oldFolder, oldFolders)
      const newId = newPathMap.get(path)
      if (newId) {
        map.set(oldFolder.id, newId)
      }
    }

    return map
  }

  /**
   * Ensure blob is in WAV format. If it's webm, convert it.
   */
  private static async ensureWavFormat(blob: Blob, filename: string): Promise<Blob> {
    // If already WAV, return as-is
    if (blob.type === 'audio/wav' || blob.type === 'audio/wave' || filename.endsWith('.wav')) {
      return blob
    }

    // For webm, we need to decode and re-encode as WAV
    // This uses the Web Audio API
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioContext = new AudioContext()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      // Convert AudioBuffer to WAV blob
      const wavBlob = this.audioBufferToWav(audioBuffer)
      await audioContext.close()

      return wavBlob
    } catch (e) {
      console.warn('Failed to convert audio to WAV, using original:', e)
      return blob
    }
  }

  /**
   * Convert AudioBuffer to WAV Blob.
   */
  private static audioBufferToWav(audioBuffer: AudioBuffer): Blob {
    const numChannels = audioBuffer.numberOfChannels
    const sampleRate = audioBuffer.sampleRate
    const format = 1 // PCM
    const bitDepth = 16

    // Interleave channels
    const length = audioBuffer.length * numChannels * (bitDepth / 8)
    const buffer = new ArrayBuffer(44 + length)
    const view = new DataView(buffer)

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, format, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true)
    view.setUint16(32, numChannels * (bitDepth / 8), true)
    view.setUint16(34, bitDepth, true)
    writeString(36, 'data')
    view.setUint32(40, length, true)

    // Write audio data
    const channels: Float32Array[] = []
    for (let i = 0; i < numChannels; i++) {
      channels.push(audioBuffer.getChannelData(i))
    }

    let offset = 44
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i]))
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        view.setInt16(offset, intSample, true)
        offset += 2
      }
    }

    return new Blob([buffer], { type: 'audio/wav' })
  }

  /**
   * Clean up old storage after successful migration.
   */
  private static async cleanupOldStorage(): Promise<void> {
    try {
      // Clear audio blobs from IndexedDB
      await clearAllAudio()

      // Clear recordings and folders from chrome.storage.local
      // Keep settings like theme preferences
      await chrome.storage.local.remove(['recordings', 'folders', 'expandedFolders'])

      // Mark migration as complete
      await chrome.storage.local.set({ migrationCompleted: true, migrationVersion: LIBRARY_VERSION })
    } catch (e) {
      console.warn('Failed to cleanup old storage:', e)
      // Non-fatal - old data remains but new data is already migrated
    }
  }

  /**
   * Check if migration was already completed.
   */
  static async wasMigrationCompleted(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(['migrationCompleted'])
      return result.migrationCompleted === true
    } catch {
      return false
    }
  }
}

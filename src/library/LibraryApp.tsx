import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Recording, Folder, RECORDING_COLORS, MUSICAL_KEYS, PRESET_TAGS } from '../types'
import { getStorageService, StorageService } from '../storage/StorageService'

// Icons
const Icons = {
  Folder: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4a1 1 0 0 1 1-1h3.5l2 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/>
    </svg>
  ),
  FolderOpen: () => (
    <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 12a3 3 0 0 1 3-3h10.5l6 6H39a3 3 0 0 1 3 3v18a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V12z"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="5 2 11 7 5 12"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="11 2 5 8 11 14"/>
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4"/><line x1="14" y1="14" x2="9" y2="9"/>
    </svg>
  ),
  Music: () => (
    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11V3l-6 2v6"/><circle cx="3" cy="11" r="2"/><circle cx="9" cy="9" r="2"/>
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2 4 12 4"/><path d="M10 4v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4"/><path d="M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1"/>
    </svg>
  ),
  Edit: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 1.5a2.121 2.121 0 1 1 3 3L5 13l-4 1 1-4 8.5-8.5z"/>
    </svg>
  ),
  Scissors: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="4" r="2"/><circle cx="4" cy="10" r="2"/><path d="M12 4L5.5 7.5M5.5 6.5L12 10"/>
    </svg>
  ),
  Star: () => (
    <svg width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1">
      <polygon points="7 1 8.8 5.2 13.5 5.6 10 8.7 11 13.3 7 10.8 3 13.3 4 8.7 0.5 5.6 5.2 5.2"/>
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M8 10l-3-3M8 10l3-3"/><path d="M2 12v2h12v-2"/>
    </svg>
  ),
}

// Helper functions
const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

const formatDate = (timestamp: number): string => {
  const d = new Date(timestamp)
  const day = d.getDate().toString().padStart(2, '0')
  const months = ['jan.', 'feb.', 'mar.', 'apr.', 'may', 'jun.', 'jul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.']
  const month = months[d.getMonth()]
  const hours = d.getHours().toString().padStart(2, '0')
  const minutes = d.getMinutes().toString().padStart(2, '0')
  return `${day} ${month}, ${hours}:${minutes}`
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FOLDER_COLORS = ['#00ff88', '#ff3b5c', '#00d4ff', '#ff9500', '#a855f7', '#ec4899', '#facc15', '#64748b']

export default function LibraryApp() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [needsFolder, setNeedsFolder] = useState(false)
  const [isSelecting, setIsSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [folders, setFolders] = useState<Folder[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['uncategorized']))
  const [searchQuery, setSearchQuery] = useState('')
  const [filterRating, setFilterRating] = useState(0)
  const [filterSite, setFilterSite] = useState('')

  // Initialize storage
  useEffect(() => {
    async function init() {
      const storage = getStorageService()
      const result = await storage.initialize()
      if (!result.success) {
        if (result.error.type === 'NO_FOLDER_SELECTED') {
          setNeedsFolder(true)
        } else if (result.error.type === 'PERMISSION_PROMPT_NEEDED') {
          setNeedsFolder(true)
        } else {
          setError(`Storage error: ${result.error.type}`)
        }
        return
      }
      loadLibrary()
      setIsInitialized(true)
    }
    init()
  }, [])

  const loadLibrary = useCallback(async () => {
    const storage = getStorageService()
    setFolders(storage.getFolders())
    setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))

    // Load expanded folders from storage
    const stored = await chrome.storage.local.get('expandedFolders') as { expandedFolders?: string[] }
    if (stored.expandedFolders) {
      setExpandedFolders(new Set(stored.expandedFolders))
    }
  }, [])

  const handleSelectFolder = async () => {
    setIsSelecting(true)
    setError(null)
    try {
      const storage = getStorageService()
      const result = await storage.initialize()
      if (result.success) {
        setNeedsFolder(false)
        loadLibrary()
        setIsInitialized(true)
      } else {
        setError(`Failed: ${result.error.type}`)
      }
    } catch (e) {
      setError('Failed to select folder')
    } finally {
      setIsSelecting(false)
    }
  }

  // Folder selection screen
  if (needsFolder) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-6 text-[var(--accent-cyan)]">
            <Icons.FolderOpen />
          </div>
          <h2 className="text-xl font-bold mb-3">CucuBau Library</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-[320px]">
            Select your recordings folder to view and manage your library.
          </p>
          <button
            onClick={handleSelectFolder}
            disabled={isSelecting}
            className="btn bg-[var(--accent-cyan)] text-[var(--bg-primary)] px-6 py-3 text-sm font-semibold rounded-lg"
          >
            {isSelecting ? 'Selecting...' : 'Choose Folder'}
          </button>
          {error && <p className="mt-4 text-xs text-[var(--accent-red)]">{error}</p>}
        </div>
      </div>
    )
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[var(--text-muted)]">Loading library...</p>
        </div>
      </div>
    )
  }

  // Get unique sites for filter
  const uniqueSites = [...new Set(recordings.map(r => r.hostname).filter(Boolean))]

  // Filter recordings
  const filteredRecordings = recordings.filter(r => {
    if (r.parentId) return false // Exclude crops from main list
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q || (
      (r.tabTitle || '').toLowerCase().includes(q) ||
      (r.hostname || '').toLowerCase().includes(q) ||
      (r.tags || []).some(t => t.toLowerCase().includes(q))
    )
    const matchesRating = filterRating === 0 || (r.rating || 0) === filterRating
    const matchesSite = !filterSite || r.hostname === filterSite
    return matchesSearch && matchesRating && matchesSite
  })

  const getRecordingsForFolder = (folderId: string) =>
    filteredRecordings.filter(r => r.folderId === folderId)

  const getCropsForRecording = (recordingId: string) =>
    recordings.filter(r => r.parentId === recordingId)

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      chrome.storage.local.set({ expandedFolders: Array.from(next) })
      return next
    })
  }

  const totalSize = recordings.reduce((acc, r) => acc + (r.size || 0), 0)

  const renderRecording = (recording: Recording, isCrop = false) => {
    const crops = getCropsForRecording(recording.id)
    const hasCrops = crops.length > 0

    return (
      <div key={recording.id} className={`${isCrop ? 'ml-6 border-l-2 border-[var(--border-color)]' : ''}`}>
        <div className="group flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-tertiary)] cursor-pointer transition-all">
          {hasCrops && (
            <button className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Icons.ChevronRight />
            </button>
          )}
          {recording.color && (
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: recording.color }} />
          )}
          {isCrop && (
            <span className="text-[var(--text-muted)]"><Icons.Scissors /></span>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate text-[var(--text-primary)] flex items-center gap-2">
              {recording.tabTitle || 'Untitled'}
              {recording.rating && recording.rating > 0 && (
                <span className="text-[#facc15] text-[10px]">{'★'.repeat(recording.rating)}</span>
              )}
              {hasCrops && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-cyan)]">
                  {crops.length} crop{crops.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
              <Icons.Music />
              {recording.duration > 0 && <span>{formatTime(recording.duration)}</span>}
              <span className="opacity-50">•</span>
              <span>{formatDate(recording.timestamp)}</span>
              <span className="opacity-50">•</span>
              <span>{formatFileSize(recording.size)}</span>
              {recording.bpm && <span className="text-[var(--accent-cyan)]">{recording.bpm} BPM</span>}
              {recording.key && <span className="text-[var(--accent-purple)]">{recording.key}</span>}
            </div>
          </div>
          <button className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent-cyan)]">
            <Icons.Edit />
          </button>
          <button className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent-red)]">
            <Icons.Trash />
          </button>
        </div>
      </div>
    )
  }

  const renderFolder = (folder: Folder, depth = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const folderRecordings = getRecordingsForFolder(folder.id)
    const childFolders = folders.filter(f => f.parentId === folder.id)

    return (
      <div key={folder.id}>
        <div
          onClick={() => toggleFolder(folder.id)}
          className="group flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-tertiary)] cursor-pointer"
          style={{ paddingLeft: `${16 + depth * 16}px` }}
        >
          <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
            <Icons.ChevronRight />
          </span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: folder.color }} />
          <span className="text-[var(--text-muted)]"><Icons.Folder /></span>
          <span className="flex-1 text-sm font-medium truncate">{folder.name}</span>
          <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
            {folderRecordings.length}
          </span>
        </div>
        {isExpanded && (
          <div>
            {childFolders.map(cf => renderFolder(cf, depth + 1))}
            {folderRecordings.map(r => renderRecording(r))}
          </div>
        )}
      </div>
    )
  }

  const rootFolders = folders.filter(f => f.parentId === null)
  const uncategorizedRecordings = getRecordingsForFolder('uncategorized')

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="noise-overlay" />

      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--bg-primary)] border-b border-[var(--border-color)]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--accent-red)] flex items-center justify-center shadow-[0_0_12px_rgba(255,59,92,0.5)]">
                <div className="w-3 h-3 rounded-full bg-white"></div>
              </div>
              <h1 className="text-lg font-bold">CucuBau Library</h1>
            </div>
            <div className="text-sm text-[var(--text-muted)]">
              {recordings.length} recordings • {formatFileSize(totalSize)}
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                <Icons.Search />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search recordings..."
                className="w-full pl-9 pr-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none focus:border-[var(--accent-cyan)]"
              />
            </div>
            <select
              value={filterSite}
              onChange={(e) => setFilterSite(e.target.value)}
              className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm focus:outline-none"
            >
              <option value="">All sites</option>
              {uniqueSites.map(site => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setFilterRating(filterRating === star ? 0 : star)}
                  className={`text-lg ${filterRating === star ? 'text-[#facc15]' : 'text-[var(--text-muted)] hover:text-[#facc15]'}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Folders */}
        <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          {rootFolders.map(f => renderFolder(f))}

          {/* Uncategorized */}
          <div>
            <div
              onClick={() => toggleFolder('uncategorized')}
              className="group flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-tertiary)] cursor-pointer"
            >
              <span className={`transition-transform ${expandedFolders.has('uncategorized') ? 'rotate-90' : ''}`}>
                <Icons.ChevronRight />
              </span>
              <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
              <span className="text-[var(--text-muted)]"><Icons.Folder /></span>
              <span className="flex-1 text-sm font-medium truncate">Uncategorized</span>
              <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                {uncategorizedRecordings.length}
              </span>
            </div>
            {expandedFolders.has('uncategorized') && (
              <div>
                {uncategorizedRecordings.map(r => renderRecording(r))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

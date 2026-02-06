import { useState, useEffect, useCallback, useRef } from 'react'
import type { Recording, Folder } from '../types'
import { PRESET_TAGS, RECORDING_COLORS, MUSICAL_KEYS } from '../types'
import { detectBPM, normalizeAudio, trimAudio, audioBufferToWav, blobToAudioBuffer } from '../lib/audio'
import { StorageService, getStorageService } from '../storage/StorageService'
import { MigrationService } from '../storage/MigrationService'
import type { StorageError } from '../storage/types'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'

// ============================================================================
// UTILITIES
// ============================================================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatTimeMs(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FOLDER_COLORS = [
  '#00ffd5', '#ff3b5c', '#ff9f43', '#a855f7',
  '#ec4899', '#fbbf24', '#3b82f6', '#64748b',
]

function getSiteName(hostname: string): string {
  const clean = hostname.replace(/^www\./, '').replace(/\.(com|org|net|io|co|tv|me)$/, '')
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

function getUniqueTitle(baseTitle: string, existingRecordings: Recording[]): string {
  const existingTitles = existingRecordings.map(r => r.tabTitle)
  if (!existingTitles.includes(baseTitle)) return baseTitle
  let counter = 2
  while (existingTitles.includes(`${baseTitle} ${counter}`)) counter++
  return `${baseTitle} ${counter}`
}

// ============================================================================
// ICONS
// ============================================================================

const Icons = {
  Mic: () => (
    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" x2="12" y1="19" y2="22"/>
    </svg>
  ),
  Stop: () => (
    <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>
  ),
  Play: ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  Pause: () => (
    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  ),
  Folder: ({ color }: { color?: string }) => (
    <svg width="18" height="18" fill={color || 'currentColor'} viewBox="0 0 24 24" opacity={color ? 1 : 0.5}>
      <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>
    </svg>
  ),
  FolderPlus: () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>
      <path d="M12 11v4M10 13h4"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 4 4 4-4 4"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10 4-4 4 4 4"/>
    </svg>
  ),
  Music: () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="18" r="4"/>
      <path d="M12 18V2l7 4"/>
    </svg>
  ),
  Trash: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h12M8 6V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M17 6v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="6"/>
      <path d="m20 20-4-4"/>
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  SkipBack: () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20"/>
      <line x1="5" x2="5" y1="19" y2="5"/>
    </svg>
  ),
  SkipForward: () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4"/>
      <line x1="19" x2="19" y1="5" y2="19"/>
    </svg>
  ),
  Loop: () => (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m17 2 4 4-4 4"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <path d="m7 22-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  ),
  Scissors: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/>
      <circle cx="6" cy="18" r="3"/>
      <line x1="20" x2="8.12" y1="4" y2="15.88"/>
      <line x1="14.47" x2="20" y1="14.48" y2="20"/>
      <line x1="8.12" x2="12" y1="8.12" y2="12"/>
    </svg>
  ),
  Volume: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" x2="12" y1="15" y2="3"/>
    </svg>
  ),
  Bpm: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l3-9 4 18 3-9h4"/>
    </svg>
  ),
  Star: ({ filled }: { filled?: boolean }) => (
    <svg width="14" height="14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  FolderOpen: () => (
    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>
    </svg>
  ),
}

// ============================================================================
// WAVEFORM ANIMATION
// ============================================================================

function WaveformAnimation({ isActive, barCount = 24 }: { isActive: boolean; barCount?: number }) {
  return (
    <div className="waveform-container">
      {Array.from({ length: barCount }).map((_, i) => {
        const baseHeight = 20 + Math.sin(i * 0.5) * 15
        const activeHeight = 20 + Math.random() * 50
        return (
          <div
            key={i}
            className={`wave-bar ${isActive ? 'active' : ''}`}
            style={{
              height: isActive ? `${activeHeight}px` : `${baseHeight}px`,
              animationDelay: `${i * 0.05}s`,
            }}
          />
        )
      })}
    </div>
  )
}

// ============================================================================
// STAR RATING
// ============================================================================

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange?.(rating === star ? 0 : star)}
          className={`star ${star <= rating ? 'filled' : ''}`}
          disabled={!onChange}
        >
          <Icons.Star filled={star <= rating} />
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// SETUP SCREENS
// ============================================================================

function LoadingScreen() {
  return (
    <div className="app-container">
      <div className="scanlines" />
      <div className="noise" />
      <div className="loading-screen">
        <div className="loading-bars">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="loading-bar" />
          ))}
        </div>
        <div className="loading-text">Loading...</div>
      </div>
    </div>
  )
}

function FolderSelectionScreen({ onSelect }: { onSelect: () => void }) {
  const [isSelecting, setIsSelecting] = useState(false)

  const handleSelect = async () => {
    setIsSelecting(true)
    try {
      const storage = getStorageService()
      const result = await storage.selectFolder()
      if (result.success) onSelect()
    } finally {
      setIsSelecting(false)
    }
  }

  return (
    <div className="app-container">
      <div className="scanlines" />
      <div className="noise" />
      <div className="setup-screen animate-in">
        <div className="setup-icon">
          <Icons.FolderOpen />
        </div>
        <h1 className="setup-title">Welcome to CucuBau</h1>
        <p className="setup-description">
          Choose a folder to store your recordings. All audio files and metadata will be saved there.
        </p>
        <button onClick={handleSelect} disabled={isSelecting} className="setup-btn">
          <Icons.FolderOpen />
          {isSelecting ? 'Selecting...' : 'Choose Folder'}
        </button>
        <p className="setup-note">
          Your recordings stay on your computer. No data is sent anywhere.
        </p>
      </div>
    </div>
  )
}

function PermissionScreen({ onGranted, folderName }: { onGranted: () => void; folderName: string | null }) {
  const [isRequesting, setIsRequesting] = useState(false)

  const handleRequest = async () => {
    setIsRequesting(true)
    try {
      const storage = getStorageService()
      const result = await storage.requestPermission()
      if (result.success) onGranted()
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <div className="app-container">
      <div className="scanlines" />
      <div className="noise" />
      <div className="permission-screen animate-in">
        <div className="permission-icon">
          <Icons.FolderOpen />
        </div>
        <h2 className="permission-title">Continue to Library</h2>
        <p className="permission-folder">{folderName || 'your folder'}</p>
        <button onClick={handleRequest} disabled={isRequesting} className="permission-btn">
          {isRequesting ? 'Opening...' : 'Open Library'}
        </button>
        <p className="permission-hint">
          Browser requires confirmation after restart for security.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// RECORD TAB
// ============================================================================

interface RecordTabProps {
  isRecording: boolean
  elapsed: number
  tabTitle: string
  onToggleRecording: () => void
}

function RecordTab({ isRecording, elapsed, tabTitle, onToggleRecording }: RecordTabProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onToggleRecording()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onToggleRecording])

  return (
    <div className="record-section animate-in">
      <div className={`record-status ${isRecording ? 'recording' : ''}`}>
        <div className={`status-dot ${isRecording ? 'recording' : ''}`} />
        <span className={`status-text ${isRecording ? 'recording' : ''}`}>
          {isRecording ? 'Recording' : 'Ready'}
        </span>
      </div>

      <WaveformAnimation isActive={isRecording} />

      <div className={`timer-display ${isRecording ? 'recording' : ''}`}>
        {formatTime(elapsed)}
      </div>

      {tabTitle && (
        <div className="tab-title">{tabTitle}</div>
      )}

      <div className={`record-btn-wrapper ${isRecording ? 'recording' : ''}`}>
        <div className="record-btn-ring" />
        <button onClick={() => { console.log('BUTTON CLICKED!'); onToggleRecording(); }} className={`record-btn ${isRecording ? 'recording' : ''}`}>
          <span className="icon">
            {isRecording ? <Icons.Stop /> : <Icons.Mic />}
          </span>
        </button>
      </div>

      <div className="keyboard-hint">
        Press <span className="key">R</span> to {isRecording ? 'stop' : 'record'}
      </div>
    </div>
  )
}

// ============================================================================
// LIBRARY TAB
// ============================================================================

interface LibraryTabProps {
  folders: Folder[]
  recordings: Recording[]
  searchQuery: string
  onSearchChange: (q: string) => void
  onSelectRecording: (r: Recording) => void
  onCreateFolder: (name: string, parentId: string | null) => void
  onDeleteRecording: (id: string) => void
  onMoveRecording: (recordingId: string, folderId: string) => void
  expandedFolders: Set<string>
  onToggleFolder: (id: string) => void
}

function LibraryTab({
  folders,
  recordings,
  searchQuery,
  onSearchChange,
  onSelectRecording,
  onCreateFolder,
  onDeleteRecording,
  onMoveRecording,
  expandedFolders,
  onToggleFolder,
}: LibraryTabProps) {
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')

  const filteredRecordings = recordings.filter(r =>
    r.tabTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const getRecordingsInFolder = (folderId: string) =>
    filteredRecordings.filter(r => r.folderId === folderId)

  const getChildFolders = (parentId: string | null) =>
    folders.filter(f => f.parentId === parentId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

  const countRecordingsRecursive = (folderId: string): number => {
    const direct = getRecordingsInFolder(folderId).length
    const children = getChildFolders(folderId)
    return direct + children.reduce((sum, child) => sum + countRecordingsRecursive(child.id), 0)
  }

  const renderFolder = (folder: Folder, depth = 0) => {
    const isExpanded = expandedFolders.has(folder.id)
    const childFolders = getChildFolders(folder.id)
    const folderRecordings = getRecordingsInFolder(folder.id)
    const totalCount = countRecordingsRecursive(folder.id)

    return (
      <div key={folder.id} className="folder-item" style={{ marginLeft: depth * 8 }}>
        <div
          className="folder-header"
          onClick={() => onToggleFolder(folder.id)}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
          onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
          onDrop={(e) => {
            e.preventDefault()
            e.currentTarget.classList.remove('drag-over')
            const recordingId = e.dataTransfer.getData('recordingId')
            if (recordingId) onMoveRecording(recordingId, folder.id)
          }}
        >
          <div className={`folder-chevron ${isExpanded ? 'expanded' : ''}`}>
            <Icons.ChevronRight />
          </div>
          <div className="folder-icon">
            <Icons.Folder color={folder.color} />
          </div>
          <span className="folder-name">{folder.name}</span>
          {totalCount > 0 && <span className="folder-count">{totalCount}</span>}
        </div>
        {isExpanded && (
          <div className="folder-children">
            {childFolders.map(child => renderFolder(child, depth + 1))}
            {folderRecordings.map(rec => (
              <div
                key={rec.id}
                className="recording-item"
                onClick={() => onSelectRecording(rec)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('recordingId', rec.id)
                  e.currentTarget.classList.add('dragging')
                }}
                onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
              >
                <div className="recording-artwork">
                  <span className="icon"><Icons.Music /></span>
                </div>
                <div className="recording-info">
                  <div className="recording-title">{rec.tabTitle}</div>
                  <div className="recording-meta">
                    <span>{formatDate(rec.timestamp)}</span>
                    <span className="dot" />
                    <span>{formatSize(rec.size)}</span>
                  </div>
                </div>
                <div className="recording-duration">{formatTime(rec.duration)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const uncategorizedRecordings = getRecordingsInFolder('uncategorized')
  const rootFolders = getChildFolders(null)

  return (
    <div className="library-section">
      <div className="library-header">
        <div className="search-box">
          <span className="icon"><Icons.Search /></span>
          <input
            type="text"
            placeholder="Search recordings..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <button className="icon-btn" onClick={() => setNewFolderParent('')}>
          <Icons.FolderPlus />
        </button>
      </div>

      <div className="folder-tree">
        {rootFolders.map(folder => renderFolder(folder))}

        {/* Uncategorized */}
        <div className="folder-item">
          <div
            className="folder-header"
            onClick={() => onToggleFolder('uncategorized')}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over') }}
            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove('drag-over')
              const recordingId = e.dataTransfer.getData('recordingId')
              if (recordingId) onMoveRecording(recordingId, 'uncategorized')
            }}
          >
            <div className={`folder-chevron ${expandedFolders.has('uncategorized') ? 'expanded' : ''}`}>
              <Icons.ChevronRight />
            </div>
            <div className="folder-icon">
              <Icons.Folder />
            </div>
            <span className="folder-name">Uncategorized</span>
            {uncategorizedRecordings.length > 0 && (
              <span className="folder-count">{uncategorizedRecordings.length}</span>
            )}
          </div>
          {expandedFolders.has('uncategorized') && uncategorizedRecordings.length > 0 && (
            <div className="folder-children">
              {uncategorizedRecordings.map(rec => (
                <div
                  key={rec.id}
                  className="recording-item"
                  onClick={() => onSelectRecording(rec)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('recordingId', rec.id)
                    e.currentTarget.classList.add('dragging')
                  }}
                  onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
                >
                  <div className="recording-artwork">
                    <span className="icon"><Icons.Music /></span>
                  </div>
                  <div className="recording-info">
                    <div className="recording-title">{rec.tabTitle}</div>
                    <div className="recording-meta">
                      <span>{formatDate(rec.timestamp)}</span>
                      <span className="dot" />
                      <span>{formatSize(rec.size)}</span>
                    </div>
                  </div>
                  <div className="recording-duration">{formatTime(rec.duration)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {filteredRecordings.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <Icons.Music />
            </div>
            <div className="empty-title">
              {searchQuery ? 'No matches found' : 'No recordings yet'}
            </div>
            <div className="empty-description">
              {searchQuery ? 'Try a different search term' : 'Start recording audio from any browser tab'}
            </div>
          </div>
        )}
      </div>

      <div className="stats-footer">
        <span>{recordings.length} recordings</span>
        <span>{formatSize(recordings.reduce((acc, r) => acc + r.size, 0))}</span>
      </div>
    </div>
  )
}

// ============================================================================
// PLAYER TAB
// ============================================================================

interface PlayerTabProps {
  recording: Recording
  onClose: () => void
  onDelete: () => void
  onUpdate: (recording: Recording) => void
}

function PlayerTab({ recording, onClose, onDelete, onUpdate }: PlayerTabProps) {
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoop, setIsLoop] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(recording.duration)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isCropping, setIsCropping] = useState(false)

  // Load audio
  useEffect(() => {
    let url: string | null = null
    const loadAudio = async () => {
      const storage = getStorageService()
      const result = await storage.getRecordingBlob(recording.id)
      if (result.success) {
        url = URL.createObjectURL(result.data)
        setAudioUrl(url)
        setAudioBlob(result.data)
      }
    }
    loadAudio()
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [recording.id])

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(0, 255, 213, 0.3)',
      progressColor: '#00ffd5',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      height: 80,
      normalize: true,
    })

    ws.load(audioUrl)
    wavesurferRef.current = ws

    ws.on('ready', () => {
      setIsReady(true)
      setDuration(ws.getDuration())
    })
    ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()))
    ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()))
    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => {
      if (isLoop) {
        ws.seekTo(0)
        ws.play()
      } else {
        setIsPlaying(false)
      }
    })

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      setIsReady(false)
    }
  }, [audioUrl])

  const togglePlay = () => wavesurferRef.current?.playPause()
  const skip = (seconds: number) => {
    if (wavesurferRef.current && duration > 0) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
      wavesurferRef.current.seekTo(newTime / duration)
    }
  }

  const handleDetectBPM = async () => {
    if (!audioBlob) return
    setIsProcessing(true)
    try {
      const audioBuffer = await blobToAudioBuffer(audioBlob)
      const bpm = await detectBPM(audioBuffer)
      onUpdate({ ...recording, bpm })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleNormalize = async () => {
    if (!audioBlob) return
    setIsProcessing(true)
    try {
      const audioBuffer = await blobToAudioBuffer(audioBlob)
      const normalized = normalizeAudio(audioBuffer)
      const newBlob = audioBufferToWav(normalized)
      const storage = getStorageService()
      await storage.saveRecording(recording, newBlob)
      setAudioBlob(newBlob)
      const newUrl = URL.createObjectURL(newBlob)
      setAudioUrl(newUrl)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExport = async () => {
    if (!audioBlob) return
    const url = URL.createObjectURL(audioBlob)
    await chrome.downloads.download({ url, filename: recording.filename, saveAs: true })
    URL.revokeObjectURL(url)
  }

  return (
    <div className="player-section animate-in">
      <div className="player-header">
        <button className="back-btn" onClick={onClose}>
          <Icons.ChevronLeft />
        </button>
        <div className="player-title-section">
          <div className="player-title">{recording.tabTitle}</div>
          <div className="player-subtitle">
            {formatDate(recording.timestamp)} • {formatSize(recording.size)}
          </div>
        </div>
        <StarRating
          rating={recording.rating || 0}
          onChange={(r) => onUpdate({ ...recording, rating: r })}
        />
      </div>

      <div className="player-waveform">
        <div className="waveform-display" ref={waveformRef} />
        <div className="time-display">
          <span>{formatTimeMs(currentTime)}</span>
          <span>{formatTimeMs(duration)}</span>
        </div>
      </div>

      <div className="player-controls">
        <button className="control-btn" onClick={() => skip(-5)}>
          <Icons.SkipBack />
        </button>
        <button className={`control-btn play-btn`} onClick={togglePlay} disabled={!isReady}>
          {isPlaying ? <Icons.Pause /> : <Icons.Play size={24} />}
        </button>
        <button className="control-btn" onClick={() => skip(5)}>
          <Icons.SkipForward />
        </button>
        <button
          className={`control-btn ${isLoop ? 'active' : ''}`}
          onClick={() => setIsLoop(!isLoop)}
        >
          <Icons.Loop />
        </button>
      </div>

      <div className="player-tools">
        <button className="tool-btn" onClick={handleDetectBPM} disabled={isProcessing}>
          <Icons.Bpm /> Detect BPM
        </button>
        <button className="tool-btn" onClick={handleNormalize} disabled={isProcessing}>
          <Icons.Volume /> Normalize
        </button>
        <button className={`tool-btn ${isCropping ? 'active' : ''}`} onClick={() => setIsCropping(!isCropping)}>
          <Icons.Scissors /> Crop
        </button>
        <button className="tool-btn" onClick={handleExport}>
          <Icons.Download /> Export
        </button>
      </div>

      <div className="player-metadata">
        {recording.bpm && (
          <div className="metadata-section">
            <div className="metadata-label">BPM</div>
            <div className="metadata-value">{recording.bpm}</div>
          </div>
        )}

        <div className="metadata-section">
          <div className="metadata-label">Tags</div>
          <div className="tags-container">
            {PRESET_TAGS.slice(0, 8).map(tag => (
              <button
                key={tag}
                className={`tag ${(recording.tags || []).includes(tag) ? 'active' : ''}`}
                onClick={() => {
                  const tags = recording.tags || []
                  const newTags = tags.includes(tag)
                    ? tags.filter(t => t !== tag)
                    : [...tags, tag]
                  onUpdate({ ...recording, tags: newTags })
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="metadata-section">
          <div className="metadata-label">Source</div>
          <div className="metadata-value">{recording.hostname || 'Unknown'}</div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN APP
// ============================================================================

function MainApp() {
  const [activeTab, setActiveTab] = useState<'record' | 'library'>('record')
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [tabTitle, setTabTitle] = useState('')
  const [folders, setFolders] = useState<Folder[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['uncategorized']))

  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const elapsedRef = useRef<number>(0)

  const loadLibrary = useCallback(async () => {
    const storage = getStorageService()
    setFolders(storage.getFolders())
    const recs = storage.getRecordings().map(r => ({ ...r, folderId: r.folderId || 'uncategorized' }))
    setRecordings(recs.sort((a, b) => b.timestamp - a.timestamp))
    const result = await chrome.storage.local.get(['expandedFolders'])
    if (result.expandedFolders) setExpandedFolders(new Set(result.expandedFolders as string[]))
  }, [])

  useEffect(() => {
    loadLibrary()
  }, [loadLibrary])

  // Listen for recording complete message from background
  useEffect(() => {
    const handleMessage = async (message: any) => {
      if (message.type === 'RECORDING_COMPLETE' && message.data) {
        const { base64, mimeType, duration, timestamp, tabTitle: recTitle, tabUrl, hostname, size } = message.data

        // Convert base64 back to blob
        const response = await fetch(base64)
        const webmBlob = await response.blob()

        const timeStr = new Date(timestamp).toTimeString().slice(0, 8).replace(/:/g, '-')
        const safeTitle = recTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
        const recordingId = crypto.randomUUID()
        const wavFilename = `${safeTitle}_${timeStr}.wav`

        const storage = getStorageService()
        const existingRecordings = storage.getRecordings()
        const uniqueTitle = getUniqueTitle(`${getSiteName(hostname)} - ${recTitle}`, existingRecordings)

        // Convert webm to wav
        const convertContext = new AudioContext()
        const arrayBuffer = await webmBlob.arrayBuffer()
        const audioBuffer = await convertContext.decodeAudioData(arrayBuffer)
        const wavBlob = audioBufferToWav(audioBuffer)
        convertContext.close()

        const recording: Recording = {
          id: recordingId,
          filename: wavFilename,
          duration,
          timestamp,
          tabTitle: uniqueTitle,
          tabUrl,
          hostname,
          size: wavBlob.size,
          folderId: 'uncategorized'
        }

        await storage.saveRecording(recording, wavBlob)
        loadLibrary()
      } else if (message.type === 'STATE_UPDATE') {
        setIsRecording(message.state.isRecording)
        if (message.state.isRecording && message.state.startTime) {
          startTimeRef.current = message.state.startTime
          setTabTitle(message.state.tabTitle)
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [loadLibrary])

  // Recording functions
  const startRecording = async () => {
    try {
      console.log('startRecording called')
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      console.log('Got tab:', tab)
      if (!tab?.id) {
        console.error('No tab id!')
        return
      }

      // Send message to background to start recording via offscreen
      console.log('Sending START_RECORDING to background...')
      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        tabId: tab.id,
        tabTitle: tab.title || 'Unknown',
        tabUrl: tab.url || ''
      })
      console.log('Got response:', response)

      if (response?.success) {
        setIsRecording(true)
        setTabTitle(tab.title || 'Unknown')
        startTimeRef.current = Date.now()

        timerRef.current = window.setInterval(() => {
          if (startTimeRef.current) {
            const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
            setElapsed(currentElapsed)
            elapsedRef.current = currentElapsed
          }
        }, 1000)
      } else {
        console.error('Failed to start recording:', response?.error)
      }
    } catch (err) {
      console.error('Recording error:', err)
    }
  }

  const stopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

    // Send message to background to stop recording
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })

    setIsRecording(false)
    setElapsed(0)
    elapsedRef.current = 0
    startTimeRef.current = null
  }

  const toggleRecording = () => isRecording ? stopRecording() : startRecording()

  // Folder operations
  const createFolder = async (name: string, parentId: string | null) => {
    const storage = getStorageService()
    await storage.createFolder(name, parentId, FOLDER_COLORS[folders.length % FOLDER_COLORS.length])
    setFolders(storage.getFolders())
  }

  const moveRecording = async (recordingId: string, folderId: string) => {
    const storage = getStorageService()
    await storage.moveRecording(recordingId, folderId)
    setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
  }

  const deleteRecording = async (id: string) => {
    const storage = getStorageService()
    await storage.deleteRecording(id)
    setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
    if (selectedRecording?.id === id) setSelectedRecording(null)
  }

  const updateRecording = async (recording: Recording) => {
    const storage = getStorageService()
    await storage.updateRecording(recording)
    setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
    if (selectedRecording?.id === recording.id) setSelectedRecording(recording)
  }

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      chrome.storage.local.set({ expandedFolders: Array.from(next) })
      return next
    })
  }

  const handleSelectRecording = (recording: Recording) => {
    setSelectedRecording(recording)
  }

  const handleClosePlayer = () => {
    setSelectedRecording(null)
  }

  return (
    <div className="app-container">
      <div className="scanlines" />
      <div className="noise" />

      <div className="header">
        <div className="logo">
          <div className="logo-icon" />
          <span className="logo-text">CucuBau</span>
        </div>
        <div className="header-actions">
          {isRecording && (
            <div className="record-status recording" style={{ padding: '4px 10px', marginRight: 8 }}>
              <div className="status-dot recording" />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatTime(elapsed)}</span>
            </div>
          )}
          <button className="icon-btn" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })}>
            <Icons.Settings />
          </button>
        </div>
      </div>

      {!selectedRecording ? (
        <>
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'record' ? 'active' : ''}`}
              onClick={() => setActiveTab('record')}
            >
              Record
            </button>
            <button
              className={`nav-tab ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              Library
              <span className="badge">{recordings.length}</span>
            </button>
          </div>

          <div className="main-content">
            {activeTab === 'record' ? (
              <RecordTab
                isRecording={isRecording}
                elapsed={elapsed}
                tabTitle={tabTitle}
                onToggleRecording={toggleRecording}
              />
            ) : (
              <LibraryTab
                folders={folders}
                recordings={recordings}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSelectRecording={handleSelectRecording}
                onCreateFolder={createFolder}
                onDeleteRecording={deleteRecording}
                onMoveRecording={moveRecording}
                expandedFolders={expandedFolders}
                onToggleFolder={toggleFolder}
              />
            )}
          </div>
        </>
      ) : (
        <PlayerTab
          recording={selectedRecording}
          onClose={handleClosePlayer}
          onDelete={() => { deleteRecording(selectedRecording.id); handleClosePlayer() }}
          onUpdate={updateRecording}
        />
      )}
    </div>
  )
}

// ============================================================================
// APP WRAPPER
// ============================================================================

export default function App() {
  const [appState, setAppState] = useState<'loading' | 'needsFolder' | 'needsPermission' | 'ready'>('loading')
  const [folderName, setFolderName] = useState<string | null>(null)

  useEffect(() => {
    const initStorage = async () => {
      const storage = getStorageService()
      const result = await storage.initialize()

      if (result.success) {
        setAppState('ready')
      } else {
        const error = result.error as StorageError
        if (error.type === 'NO_FOLDER_SELECTED') {
          setAppState('needsFolder')
        } else if (error.type === 'PERMISSION_PROMPT_NEEDED' || error.type === 'PERMISSION_DENIED') {
          const name = await storage.getFolderName()
          setFolderName(name)
          setAppState('needsPermission')
        } else {
          setAppState('needsFolder')
        }
      }
    }
    initStorage()
  }, [])

  switch (appState) {
    case 'loading':
      return <LoadingScreen />
    case 'needsFolder':
      return <FolderSelectionScreen onSelect={() => setAppState('ready')} />
    case 'needsPermission':
      return <PermissionScreen onGranted={() => setAppState('ready')} folderName={folderName} />
    case 'ready':
      return <MainApp />
  }
}

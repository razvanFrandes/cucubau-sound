import { useState, useEffect, useCallback, useRef } from 'react'
import type { Recording, Folder } from '../types'
import { PRESET_TAGS, RECORDING_COLORS, MUSICAL_KEYS } from '../types'
import { saveAudioBlob, getAudioBlob, deleteAudioBlob } from '../lib/db'
import { detectBPM, normalizeAudio, trimAudio, audioBufferToWav, blobToAudioBuffer } from '../lib/audio'
import WaveSurfer from 'wavesurfer.js'

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
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('ro-RO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const FOLDER_COLORS = [
  '#00ff88', '#ff3b5c', '#00d4ff', '#ff9500',
  '#a855f7', '#ec4899', '#facc15', '#64748b',
]

// Extract pretty site name from hostname
function getSiteName(hostname: string): string {
  // Remove www. and common TLDs to get clean name
  const clean = hostname.replace(/^www\./, '').replace(/\.(com|org|net|io|co|tv|me)$/, '')
  // Capitalize first letter
  return clean.charAt(0).toUpperCase() + clean.slice(1)
}

// Generate unique title to avoid duplicates like "YouTube, YouTube, YouTube"
function getUniqueTitle(baseTitle: string, existingRecordings: Recording[]): string {
  const existingTitles = existingRecordings.map(r => r.tabTitle)

  if (!existingTitles.includes(baseTitle)) {
    return baseTitle
  }

  // Find the next available number
  let counter = 2
  while (existingTitles.includes(`${baseTitle} ${counter}`)) {
    counter++
  }

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
  Play: ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  Pause: () => (
    <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  ),
  Folder: ({ open }: { open?: boolean }) => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {open ? (
        <path d="M2 7.5V4a1 1 0 0 1 1-1h3.5l2 2H13a1 1 0 0 1 1 1v1.5M2 7.5l1.4 5.6a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L14 7.5M2 7.5h12"/>
      ) : (
        <path d="M2 5a1 1 0 0 1 1-1h3.5l2 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Z"/>
      )}
    </svg>
  ),
  FolderPlus: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5a1 1 0 0 1 1-1h3.5l2 2H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5Z"/>
      <path d="M8 8v4M6 10h4"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 3 5 4-5 4"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m11 5-5 4 5 4"/>
    </svg>
  ),
  Music: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4.5" cy="11.5" r="2.5"/>
      <path d="M7 11.5V2l6 2v7.5"/>
      <circle cx="10.5" cy="11.5" r="2.5"/>
    </svg>
  ),
  Trash: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h8M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M10 4v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4"/>
    </svg>
  ),
  Edit: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5a1.5 1.5 0 0 1 2 2L5 11l-3 1 1-3 6.5-6.5Z"/>
    </svg>
  ),
  Download: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2v8M4 7l3 3 3-3M2 12h10"/>
    </svg>
  ),
  FolderOpen: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4a1 1 0 0 1 1-1h4l2 2h5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4Z"/>
    </svg>
  ),
  SkipBack: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5v6M6 8l6-4v8z"/>
    </svg>
  ),
  SkipForward: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v6M10 8l-6-4v8z"/>
    </svg>
  ),
  Loop: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 1l4 4-4 4"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14" transform="scale(0.67)"/>
      <path d="M7 23l-4-4 4-4"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3" transform="scale(0.67)"/>
    </svg>
  ),
  Star: ({ filled }: { filled?: boolean }) => (
    <svg width="14" height="14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 1l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z"/>
    </svg>
  ),
  Tag: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5A2.5 2.5 0 0 1 4.5 2h3.879a2 2 0 0 1 1.414.586l4.621 4.621a2 2 0 0 1 0 2.828l-3.879 3.879a2 2 0 0 1-2.828 0L3.086 9.293A2 2 0 0 1 2.5 7.879V4.5Z" transform="scale(0.58) translate(0, 0)"/>
      <circle cx="4" cy="4" r="0.5" transform="scale(0.58) translate(5, 5)"/>
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4"/>
      <path d="m13 13-3-3"/>
    </svg>
  ),
  Scissors: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="4" cy="4" r="2"/>
      <circle cx="4" cy="10" r="2"/>
      <path d="M5.5 5.5L12 12M5.5 8.5L12 2"/>
    </svg>
  ),
  Volume: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5.5v3h2.5l3 3v-9l-3 3H2z"/>
      <path d="M10 4.5a3 3 0 0 1 0 5"/>
    </svg>
  ),
  ZoomIn: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4"/>
      <path d="M13 13l-3-3M6 4v4M4 6h4"/>
    </svg>
  ),
  ZoomOut: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="4"/>
      <path d="M13 13l-3-3M4 6h4"/>
    </svg>
  ),
  Export: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 2v7M4 5l3-3 3 3M2 9v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9"/>
    </svg>
  ),
  Bpm: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7h3l2-4 2 8 2-4h3"/>
    </svg>
  ),
  DragHandle: () => (
    <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="8" cy="6" r="2"/>
      <circle cx="16" cy="6" r="2"/>
      <circle cx="8" cy="12" r="2"/>
      <circle cx="16" cy="12" r="2"/>
      <circle cx="8" cy="18" r="2"/>
      <circle cx="16" cy="18" r="2"/>
    </svg>
  ),
}

// ============================================================================
// WAVEFORM ANIMATION COMPONENT (for recording)
// ============================================================================

function Waveform({ isActive }: { isActive: boolean }) {
  const bars = 16
  return (
    <div className="flex items-center justify-center gap-[3px] h-10">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className={`w-[3px] rounded-full transition-all duration-300 ${
            isActive ? 'bg-[var(--accent-red)]' : 'bg-[var(--text-muted)]'
          }`}
          style={{
            height: isActive ? '100%' : '30%',
            animation: isActive ? `wave 0.8s ease-in-out infinite` : 'none',
            animationDelay: `${i * 0.05}s`,
          }}
        />
      ))}
    </div>
  )
}

// ============================================================================
// STAR RATING COMPONENT
// ============================================================================

function StarRating({ rating, onChange, size = 'sm' }: { rating: number; onChange?: (r: number) => void; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'md' ? 'w-5 h-5' : 'w-4 h-4'
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange?.(rating === star ? 0 : star)}
          className={`${sizeClass} transition-colors ${
            star <= rating ? 'text-[#facc15]' : 'text-[var(--text-muted)]'
          } ${onChange ? 'hover:text-[#facc15] cursor-pointer' : 'cursor-default'}`}
          disabled={!onChange}
        >
          <Icons.Star filled={star <= rating} />
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// TAG SELECTOR COMPONENT
// ============================================================================

function TagSelector({
  tags,
  onChange,
  compact = false
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  compact?: boolean
}) {
  const [showAll, setShowAll] = useState(false)

  const toggleTag = (tag: string) => {
    if (tags.includes(tag)) {
      onChange(tags.filter(t => t !== tag))
    } else {
      onChange([...tags, tag])
    }
  }

  const displayTags = showAll ? PRESET_TAGS : PRESET_TAGS.slice(0, 8)

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayTags.map(tag => (
        <button
          key={tag}
          onClick={() => toggleTag(tag)}
          className={`px-2 py-0.5 text-[10px] rounded-full transition-all ${
            tags.includes(tag)
              ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
              : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
          }`}
        >
          {tag}
        </button>
      ))}
      {!compact && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {showAll ? 'less' : `+${PRESET_TAGS.length - 8}`}
        </button>
      )}
    </div>
  )
}

// ============================================================================
// COLOR PICKER COMPONENT
// ============================================================================

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {RECORDING_COLORS.map(c => (
        <button
          key={c.name}
          onClick={() => onChange(c.value)}
          className={`w-5 h-5 rounded-full border-2 transition-all ${
            color === c.value ? 'border-white scale-110' : 'border-transparent'
          } ${c.value === '' ? 'bg-[var(--bg-tertiary)]' : ''}`}
          style={{ backgroundColor: c.value || undefined }}
          title={c.name}
        />
      ))}
    </div>
  )
}

// ============================================================================
// WAVESURFER HOOK
// ============================================================================

function useWaveSurfer(
  containerRef: React.RefObject<HTMLDivElement | null>,
  audioUrl: string | null,
  options?: { loop?: boolean }
) {
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(255, 255, 255, 0.25)',
      progressColor: '#00ff88',
      cursorColor: '#00ff88',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 120,
      normalize: true,
      backend: 'WebAudio',
      dragToSeek: true,
      minPxPerSec: 1, // Start with full view
    })

    ws.load(audioUrl)

    ws.on('ready', () => {
      setIsReady(true)
      setDuration(ws.getDuration())
    })

    ws.on('audioprocess', () => {
      setCurrentTime(ws.getCurrentTime())
    })

    ws.on('seeking', () => {
      setCurrentTime(ws.getCurrentTime())
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => {
      if (options?.loop) {
        ws.seekTo(0)
        ws.play()
      } else {
        setIsPlaying(false)
      }
    })

    wavesurferRef.current = ws

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      setIsReady(false)
      setIsPlaying(false)
    }
  }, [audioUrl, containerRef, options?.loop])

  const play = useCallback(() => wavesurferRef.current?.play(), [])
  const pause = useCallback(() => wavesurferRef.current?.pause(), [])
  const stop = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.pause()
      wavesurferRef.current.seekTo(0)
      setCurrentTime(0)
    }
  }, [])
  const togglePlay = useCallback(() => wavesurferRef.current?.playPause(), [])
  const seek = useCallback((time: number) => {
    if (wavesurferRef.current && duration > 0) {
      wavesurferRef.current.seekTo(time / duration)
    }
  }, [duration])
  const skip = useCallback((seconds: number) => {
    if (wavesurferRef.current && duration > 0) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
      wavesurferRef.current.seekTo(newTime / duration)
    }
  }, [currentTime, duration])
  const setZoom = useCallback((pxPerSec: number) => {
    if (wavesurferRef.current) {
      try {
        wavesurferRef.current.zoom(pxPerSec)
      } catch (e) {
        // Ignore zoom errors
      }
    }
  }, [])
  const getAudioBuffer = useCallback(async (): Promise<AudioBuffer | null> => {
    // @ts-ignore - getDecodedData exists
    return wavesurferRef.current?.getDecodedData() || null
  }, [])

  return {
    wavesurfer: wavesurferRef.current,
    isReady,
    isPlaying,
    currentTime,
    duration,
    play,
    pause,
    stop,
    togglePlay,
    seek,
    skip,
    setZoom,
    getAudioBuffer,
  }
}

// ============================================================================
// AUDIO PLAYER COMPONENT
// ============================================================================

interface AudioPlayerProps {
  recording: Recording
  onClose: () => void
  onDelete: () => void
  onUpdate: (recording: Recording) => void
}

function AudioPlayer({ recording, onClose, onDelete, onUpdate }: AudioPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(true)
  const [isLoop, setIsLoop] = useState(recording.isLooped || false)
  const [zoom, setZoomLevel] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(recording.tabTitle)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const {
    isReady,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    skip,
    stop,
    setZoom,
    getAudioBuffer,
  } = useWaveSurfer(waveformRef, audioUrl, { loop: isLoop })

  // Load audio from IndexedDB
  useEffect(() => {
    let url: string | null = null

    const loadAudio = async () => {
      setIsLoadingFile(true)
      setError(null)

      try {
        const blob = await getAudioBlob(recording.id)
        if (blob) {
          url = URL.createObjectURL(blob)
          setAudioUrl(url)
          setAudioBlob(blob)
        } else {
          setError('Audio nu e în cache')
        }
      } catch (err) {
        setError('Eroare la încărcare')
        console.error(err)
      } finally {
        setIsLoadingFile(false)
      }
    }

    loadAudio()

    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [recording.id])

  // Update duration from wavesurfer when it detects actual duration
  useEffect(() => {
    if (duration > 0 && duration !== recording.duration) {
      // Update recording with correct duration detected from audio
      onUpdate({ ...recording, duration: Math.round(duration) })
    }
  }, [duration])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          skip(-5)
          break
        case 'ArrowRight':
          skip(5)
          break
        case 'KeyL':
          setIsLoop(l => !l)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePlay, skip])

  const handleClose = () => {
    stop()
    onClose()
  }

  const handleDelete = () => {
    stop()
    onDelete()
  }

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(1, Math.min(100, zoom + delta))
    setZoomLevel(newZoom)
    setZoom(newZoom)
  }

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== recording.tabTitle) {
      onUpdate({ ...recording, tabTitle: editTitle.trim() })
    }
    setIsEditingTitle(false)
  }

  const openFileLocation = async () => {
    try {
      // Search for the file in downloads and show it
      const downloads = await chrome.downloads.search({ query: [recording.filename.split('/').pop() || ''] })
      if (downloads.length > 0 && downloads[0].id) {
        chrome.downloads.show(downloads[0].id)
      } else {
        // Fallback to showing downloads folder
        chrome.downloads.showDefaultFolder()
      }
    } catch (e) {
      console.error('Could not open folder:', e)
      chrome.downloads.showDefaultFolder()
    }
  }

  const handleDetectBPM = async () => {
    if (!audioBlob) return
    setIsProcessing(true)
    try {
      const audioBuffer = await blobToAudioBuffer(audioBlob)
      const bpm = await detectBPM(audioBuffer)
      onUpdate({ ...recording, bpm })
    } catch (err) {
      console.error('BPM detection failed:', err)
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
      await saveAudioBlob(recording.id, newBlob)
      setAudioBlob(newBlob)
      const newUrl = URL.createObjectURL(newBlob)
      setAudioUrl(newUrl)
    } catch (err) {
      console.error('Normalize failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExportWav = async () => {
    if (!audioBlob) return
    setIsProcessing(true)
    try {
      const audioBuffer = await blobToAudioBuffer(audioBlob)
      const wavBlob = audioBufferToWav(audioBuffer)
      const url = URL.createObjectURL(wavBlob)
      // Save in the same folder as original, just change extension
      const wavFilename = recording.filename.replace('.webm', '.wav')
      await chrome.downloads.download({ url, filename: wavFilename, saveAs: false })
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const displayDuration = duration > 0 ? duration : recording.duration

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header - sticky */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-primary)]">
        <button
          onClick={handleClose}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Icons.ChevronLeft />
        </button>
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle()
                if (e.key === 'Escape') { setEditTitle(recording.tabTitle); setIsEditingTitle(false) }
              }}
              className="text-sm font-medium w-full bg-transparent border-b border-[var(--accent-cyan)] focus:outline-none"
              autoFocus
            />
          ) : (
            <div
              className="text-sm font-medium truncate flex items-center gap-2 cursor-pointer hover:text-[var(--accent-cyan)] group"
              onClick={() => { setIsEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0) }}
            >
              {recording.color && (
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: recording.color }} />
              )}
              {recording.tabTitle}
              <span className="opacity-0 group-hover:opacity-100 text-[var(--text-muted)]">
                <Icons.Edit />
              </span>
            </div>
          )}
          <div className="text-[10px] text-[var(--text-muted)] mono flex items-center gap-2">
            {formatDate(recording.timestamp)}
            {recording.bpm && <span className="text-[var(--accent-cyan)]">{recording.bpm} BPM</span>}
            {recording.key && <span className="text-[var(--accent-purple)]">{recording.key}</span>}
          </div>
        </div>
        <StarRating
          rating={recording.rating || 0}
          onChange={(r) => onUpdate({ ...recording, rating: r })}
        />
        <button
          onClick={handleDelete}
          className="p-1.5 rounded-lg hover:bg-[var(--accent-red-dim)] text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-colors"
        >
          <Icons.Trash />
        </button>
      </div>

      {/* Main content */}
      <div className="p-4 space-y-4">
        {/* Waveform */}
        <div className="bg-[var(--bg-tertiary)] rounded-lg p-3 relative">
          {(isLoadingFile || !isReady) && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)] rounded-lg z-10">
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="w-1 h-10 bg-[var(--accent-cyan)] rounded-full animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={waveformRef} className="w-full cursor-pointer" style={{ userSelect: 'none' }} />
          {isPlaying && isReady && (
            <div className="absolute bottom-4 right-4 flex items-center gap-1 px-2 py-1 rounded bg-[var(--accent-cyan-dim)]">
              <span className="w-1.5 h-1.5 bg-[var(--accent-cyan)] rounded-full animate-pulse" />
              <span className="text-[10px] text-[var(--accent-cyan)] mono">PLAYING</span>
            </div>
          )}
          {isLoop && (
            <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-1 rounded bg-[var(--accent-purple)]/20">
              <Icons.Loop />
              <span className="text-[10px] text-[var(--accent-purple)] mono">LOOP</span>
            </div>
          )}
        </div>

        {/* Time + Zoom */}
        <div className="flex items-center justify-between">
          <span className="text-sm mono text-[var(--text-primary)]">{formatTimeMs(currentTime)}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => handleZoom(-10)} className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Icons.ZoomOut />
            </button>
            <span className="text-[10px] text-[var(--text-muted)] w-10 text-center">{zoom}x</span>
            <button onClick={() => handleZoom(10)} className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Icons.ZoomIn />
            </button>
          </div>
          <span className="text-sm mono text-[var(--text-muted)]">{formatTimeMs(displayDuration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => skip(-5)}
            className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="-5s"
          >
            <Icons.SkipBack />
          </button>

          <button
            onClick={togglePlay}
            disabled={!isReady}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isReady ? 'bg-[var(--accent-cyan)] hover:shadow-[var(--glow-cyan)] text-[var(--bg-primary)]' : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
            }`}
          >
            {isPlaying ? <Icons.Pause /> : <Icons.Play size={20} />}
          </button>

          <button
            onClick={() => skip(5)}
            className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            title="+5s"
          >
            <Icons.SkipForward />
          </button>

          <button
            onClick={() => setIsLoop(!isLoop)}
            className={`p-2 rounded-full transition-all ${isLoop ? 'bg-[var(--accent-purple)]/20 text-[var(--accent-purple)]' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}
            title="Loop (L)"
          >
            <Icons.Loop />
          </button>
        </div>

        {/* Tools */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={handleDetectBPM}
            disabled={isProcessing}
            className="btn btn-ghost text-xs"
          >
            <Icons.Bpm />
            Detect BPM
          </button>
          <button
            onClick={handleNormalize}
            disabled={isProcessing}
            className="btn btn-ghost text-xs"
          >
            <Icons.Volume />
            Normalize
          </button>
          <button
            onClick={handleExportWav}
            disabled={isProcessing}
            className="btn btn-ghost text-xs"
          >
            <Icons.Export />
            Export WAV
          </button>
        </div>

        {/* Tags */}
        <div className="glass-panel p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[var(--text-muted)]">TAGS</span>
            <button onClick={() => setShowTags(!showTags)} className="text-[10px] text-[var(--accent-cyan)]">
              {showTags ? 'hide' : 'edit'}
            </button>
          </div>
          {showTags ? (
            <TagSelector tags={recording.tags || []} onChange={(tags) => onUpdate({ ...recording, tags })} />
          ) : (
            <div className="flex flex-wrap gap-1">
              {(recording.tags || []).length > 0 ? (
                recording.tags!.map(tag => (
                  <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-[var(--accent-cyan)] text-[var(--bg-primary)]">
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-[10px] text-[var(--text-muted)]">No tags</span>
              )}
            </div>
          )}
        </div>

        {/* Color + Key */}
        <div className="flex items-center gap-4">
          <div className="flex-1 glass-panel p-3">
            <span className="text-[10px] text-[var(--text-muted)] block mb-2">COLOR</span>
            <ColorPicker color={recording.color || ''} onChange={(c) => onUpdate({ ...recording, color: c })} />
          </div>
          <div className="glass-panel p-3">
            <span className="text-[10px] text-[var(--text-muted)] block mb-2">KEY</span>
            <select
              value={recording.key || ''}
              onChange={(e) => onUpdate({ ...recording, key: e.target.value })}
              className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs"
            >
              <option value="">-</option>
              {MUSICAL_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div className="glass-panel p-3">
          <span className="text-[10px] text-[var(--text-muted)] block mb-2">NOTES</span>
          <textarea
            value={recording.notes || ''}
            onChange={(e) => onUpdate({ ...recording, notes: e.target.value })}
            placeholder="Add notes..."
            className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded p-2 text-xs resize-none h-16"
          />
        </div>

        {/* File Info */}
        <div className="glass-panel p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[var(--text-muted)]">FILE</span>
            <button
              onClick={openFileLocation}
              className="text-[10px] text-[var(--accent-cyan)] hover:underline flex items-center gap-1"
            >
              <Icons.FolderOpen />
              Open folder
            </button>
          </div>
          <div className="text-xs text-[var(--text-secondary)] truncate mono">{recording.filename}</div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-muted)]">
            <span>{formatSize(recording.size)}</span>
            <span>•</span>
            <span>{formatTime(recording.duration)}</span>
            <span>•</span>
            <span>WebM/Opus</span>
          </div>
        </div>

        {error && (
          <div className="text-center text-xs text-[var(--accent-red)]">{error}</div>
        )}
      </div>

      {/* Keyboard hints */}
      <div className="sticky bottom-0 px-4 py-2 border-t border-[var(--border-color)] flex items-center justify-center gap-4 text-[10px] text-[var(--text-muted)] bg-[var(--bg-primary)]">
        <span><kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">Space</kbd> Play</span>
        <span><kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">←→</kbd> Seek</span>
        <span><kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">L</kbd> Loop</span>
      </div>
    </div>
  )
}

// ============================================================================
// RECORD TAB COMPONENT
// ============================================================================

interface RecordTabProps {
  isRecording: boolean
  elapsed: number
  tabTitle: string
  error: string | null
  onToggleRecording: () => void
  onOpenDownloads: () => void
}

function RecordTab({ isRecording, elapsed, tabTitle, error, onToggleRecording, onOpenDownloads }: RecordTabProps) {
  // Keyboard shortcut for recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onToggleRecording()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onToggleRecording])

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
      <div className="mb-10 text-center">
        {isRecording ? (
          <>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-2 h-2 bg-[var(--accent-red)] rounded-full animate-pulse" />
              <span className="text-xs font-semibold tracking-widest text-[var(--accent-red)]">RECORDING</span>
            </div>
            <Waveform isActive={true} />
            <div className="mt-6 text-6xl font-bold mono tracking-tight">{formatTime(elapsed)}</div>
            <div className="mt-4 text-sm text-[var(--text-secondary)] max-w-[300px] truncate px-4">
              {tabTitle}
            </div>
          </>
        ) : (
          <>
            <Waveform isActive={false} />
            <div className="mt-6 text-lg text-[var(--text-secondary)]">
              Press <kbd className="px-2 py-1 bg-[var(--bg-tertiary)] rounded text-[var(--accent-cyan)]">R</kbd> or click to record
            </div>
            <div className="mt-2 text-sm text-[var(--text-muted)]">
              Captures audio from current tab
            </div>
          </>
        )}
      </div>

      <div className="relative">
        {isRecording && (
          <>
            <div className="absolute inset-0 rounded-full bg-[var(--accent-red)] opacity-20 ripple-ring" />
            <div className="absolute inset-0 rounded-full bg-[var(--accent-red)] opacity-20 ripple-ring" style={{ animationDelay: '0.5s' }} />
          </>
        )}

        <button
          onClick={onToggleRecording}
          className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-105 active:scale-95 ${
            isRecording
              ? 'bg-[var(--accent-red)] recording-pulse'
              : 'bg-[var(--bg-tertiary)] border border-[var(--border-color)] hover:border-[var(--accent-cyan)] hover:shadow-[var(--glow-cyan)]'
          }`}
        >
          {isRecording ? <Icons.Stop /> : <Icons.Mic />}
        </button>
      </div>

      {error && (
        <div className="mt-8 px-4 py-3 glass-panel border-[var(--accent-red)]/30 text-sm text-[var(--accent-red)] max-w-full">
          {error}
        </div>
      )}

      <button
        onClick={onOpenDownloads}
        className="mt-10 text-xs text-[var(--text-muted)] hover:text-[var(--accent-cyan)] flex items-center gap-2 transition-colors"
      >
        <Icons.FolderOpen />
        Open Downloads Folder
      </button>
    </div>
  )
}

// ============================================================================
// LIBRARY TAB COMPONENT
// ============================================================================

interface LibraryTabProps {
  folders: Folder[]
  recordings: Recording[]
  searchQuery: string
  onSearchChange: (q: string) => void
  onCreateFolder: (name: string, parentId: string | null) => void
  onRenameFolder: (id: string, name: string) => void
  onDeleteFolder: (id: string) => void
  onMoveRecording: (recordingId: string, folderId: string) => void
  onDeleteRecording: (id: string) => void
  onRenameRecording: (id: string, title: string) => void
  onOpenDownloads: () => void
  onSelectRecording: (recording: Recording) => void
  onPreviewRecording: (recording: Recording | null) => void
  previewingId: string | null
  expandedFolders: Set<string>
  onToggleFolder: (id: string) => void
}

function LibraryTab({
  folders,
  recordings,
  searchQuery,
  onSearchChange,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveRecording,
  onDeleteRecording,
  onRenameRecording,
  onOpenDownloads,
  onSelectRecording,
  onPreviewRecording,
  previewingId,
  expandedFolders,
  onToggleFolder,
}: LibraryTabProps) {
  const [editingFolder, setEditingFolder] = useState<string | null>(null)
  const [editingRecording, setEditingRecording] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [movingRecording, setMovingRecording] = useState<string | null>(null)
  const [filterRating, setFilterRating] = useState<number>(0) // 0 = all, 1-5 = exact stars
  const [filterSite, setFilterSite] = useState<string>('') // '' = all
  const inputRef = useRef<HTMLInputElement>(null)
  const recordingInputRef = useRef<HTMLInputElement>(null)

  // Get unique sites from recordings
  const uniqueSites = Array.from(new Set(recordings.map(r => r.hostname || '').filter(Boolean))).sort()

  useEffect(() => {
    if (showNewFolderInput && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showNewFolderInput])

  useEffect(() => {
    if (editingRecording && recordingInputRef.current) {
      recordingInputRef.current.focus()
      recordingInputRef.current.select()
    }
  }, [editingRecording])

  // Filter recordings by search, rating, and site
  const filteredRecordings = recordings.filter(r => {
    // Search filter
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q || (
      (r.tabTitle || '').toLowerCase().includes(q) ||
      (r.hostname || '').toLowerCase().includes(q) ||
      (r.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (r.notes || '').toLowerCase().includes(q) ||
      (r.key || '').toLowerCase().includes(q)
    )
    // Rating filter (exact stars)
    const matchesRating = filterRating === 0 || (r.rating || 0) === filterRating
    // Site filter
    const matchesSite = !filterSite || (r.hostname || '') === filterSite

    return matchesSearch && matchesRating && matchesSite
  })

  const activeFiltersCount = (filterRating > 0 ? 1 : 0) + (filterSite ? 1 : 0)

  const handleRenameRecording = (id: string) => {
    if (editName.trim()) {
      onRenameRecording(id, editName.trim())
      setEditName('')
      setEditingRecording(null)
    }
  }

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim(), null)
      setNewFolderName('')
      setShowNewFolderInput(false)
    }
  }

  const handleRenameFolder = (id: string) => {
    if (newFolderName.trim()) {
      onRenameFolder(id, newFolderName.trim())
      setNewFolderName('')
      setEditingFolder(null)
    }
  }

  const rootFolders = folders.filter(f => f.parentId === null)
  const uncategorizedRecordings = filteredRecordings.filter(r => r.folderId === 'uncategorized')

  const getRecordingsForFolder = (folderId: string) =>
    filteredRecordings.filter(r => r.folderId === folderId)

  const handleDragStart = (e: React.DragEvent, recordingId: string) => {
    e.dataTransfer.setData('recordingId', recordingId)
    setMovingRecording(recordingId)
  }

  const handleDragEnd = () => {
    setMovingRecording(null)
    setDragOverFolder(null)
  }

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    setDragOverFolder(folderId)
  }

  const handleDrop = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    const recordingId = e.dataTransfer.getData('recordingId')
    if (recordingId) {
      onMoveRecording(recordingId, folderId)
    }
    setDragOverFolder(null)
    setMovingRecording(null)
  }

  const renderRecording = (recording: Recording) => {
    const isPreviewing = previewingId === recording.id
    const isEditing = editingRecording === recording.id

    return (
      <div
        key={recording.id}
        draggable={!isEditing}
        onDragStart={(e) => handleDragStart(e, recording.id)}
        onDragEnd={handleDragEnd}
        onClick={() => !isEditing && onSelectRecording(recording)}
        onMouseEnter={() => onPreviewRecording(recording)}
        onMouseLeave={() => onPreviewRecording(null)}
        className={`group flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-all ${
          movingRecording === recording.id ? 'opacity-50' : ''
        } ${isPreviewing ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'}`}
      >
        {recording.color && (
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: recording.color }} />
        )}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              ref={recordingInputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRenameRecording(recording.id)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') handleRenameRecording(recording.id)
                if (e.key === 'Escape') { setEditingRecording(null); setEditName('') }
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-sm w-full bg-transparent border-b border-[var(--accent-cyan)] focus:outline-none text-[var(--text-primary)]"
            />
          ) : (
            <div className="text-sm truncate text-[var(--text-primary)] flex items-center gap-2">
              {recording.tabTitle || 'Untitled'}
              {recording.rating && recording.rating > 0 && (
                <span className="text-[#facc15] text-[10px]">{'★'.repeat(recording.rating)}</span>
              )}
            </div>
          )}
          <div className="text-[10px] text-[var(--text-muted)] mono flex items-center gap-1.5 mt-0.5">
            <Icons.Music />
            {recording.duration > 0 && <span>{formatTime(recording.duration)}</span>}
            <span className="opacity-50">•</span>
            <span>{formatDate(recording.timestamp)}</span>
            {recording.bpm && <span className="text-[var(--accent-cyan)]">{recording.bpm}</span>}
            {recording.key && <span className="text-[var(--accent-purple)]">{recording.key}</span>}
            {(recording.tags || []).slice(0, 1).map(t => (
              <span key={t}>#{t}</span>
            ))}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setEditName(recording.tabTitle || '')
            setEditingRecording(recording.id)
          }}
          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent-cyan)] transition-all"
          title="Rename"
        >
          <Icons.Edit />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteRecording(recording.id) }}
          className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent-red)] transition-all"
          title="Delete"
        >
          <Icons.Trash />
        </button>
      </div>
    )
  }

  const renderFolder = (folder: Folder) => {
    const isExpanded = expandedFolders.has(folder.id)
    const folderRecordings = getRecordingsForFolder(folder.id)
    const isEditing = editingFolder === folder.id
    const isDragOver = dragOverFolder === folder.id

    return (
      <div key={folder.id}>
        <div
          onDragOver={(e) => handleDragOver(e, folder.id)}
          onDragLeave={() => setDragOverFolder(null)}
          onDrop={(e) => handleDrop(e, folder.id)}
          className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)] transition-all ${
            isDragOver ? 'bg-[var(--accent-cyan-dim)] border border-[var(--accent-cyan)]' : ''
          }`}
          onClick={() => !isEditing && onToggleFolder(folder.id)}
        >
          <span className={`transition-transform duration-200 text-[var(--text-muted)] ${isExpanded ? 'rotate-90' : ''}`}>
            <Icons.ChevronRight />
          </span>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: folder.color }} />
          <span className="text-[var(--text-secondary)]">
            <Icons.Folder open={isExpanded} />
          </span>

          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameFolder(folder.id)
                if (e.key === 'Escape') setEditingFolder(null)
              }}
              onBlur={() => setEditingFolder(null)}
              className="flex-1 bg-transparent border-none p-0 text-sm focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-sm text-[var(--text-primary)]">{folder.name}</span>
          )}

          <span className="badge bg-[var(--bg-secondary)] text-[var(--text-muted)]">
            {folderRecordings.length}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation()
              setNewFolderName(folder.name)
              setEditingFolder(folder.id)
              setTimeout(() => inputRef.current?.focus(), 0)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent-cyan)]"
          >
            <Icons.Edit />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteFolder(folder.id) }}
            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent-red)]"
          >
            <Icons.Trash />
          </button>
        </div>

        {isExpanded && folderRecordings.length > 0 && (
          <div className="ml-6 border-l border-[var(--border-color)]">
            {folderRecordings.map(renderRecording)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search + Filters */}
      <div className="p-3 border-b border-[var(--border-color)] space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="w-full pl-3 pr-3 py-1.5 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg focus:border-[var(--accent-cyan)] focus:outline-none"
            />
          </div>
          {/* Stars filter inline */}
          <div className="flex gap-0.5 flex-shrink-0">
            {[1, 2, 3, 4, 5].map(stars => (
              <button
                key={stars}
                onClick={() => setFilterRating(filterRating === stars ? 0 : stars)}
                className={`w-6 h-6 text-[12px] rounded flex items-center justify-center transition-colors ${
                  filterRating === stars
                    ? 'bg-[#facc15] text-[var(--bg-primary)]'
                    : 'text-[var(--text-muted)] hover:text-[#facc15]'
                }`}
                title={`${stars} stars`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Site filter - always show if there are sites */}
        {uniqueSites.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setFilterSite('')}
              className={`px-2.5 py-1 text-[10px] rounded-full transition-colors ${
                !filterSite
                  ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              All
            </button>
            {uniqueSites.map(site => (
              <button
                key={site}
                onClick={() => setFilterSite(filterSite === site ? '' : site)}
                className={`px-2.5 py-1 text-[10px] rounded-full transition-colors ${
                  filterSite === site
                    ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {getSiteName(site)}
              </button>
            ))}
          </div>
        )}

        {showNewFolderInput ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder()
                if (e.key === 'Escape') setShowNewFolderInput(false)
              }}
              placeholder="Folder name..."
              className="flex-1 text-sm"
            />
            <button onClick={handleCreateFolder} className="btn btn-primary text-xs py-1.5">
              Create
            </button>
          </div>
        ) : (
          <button onClick={() => setShowNewFolderInput(true)} className="btn btn-ghost text-xs w-full justify-start">
            <Icons.FolderPlus />
            New Folder
          </button>
        )}
      </div>

      {/* Tree View */}
      <div className="flex-1 overflow-y-auto py-2">
        {rootFolders.map(renderFolder)}

        <div className="mt-2">
          <div
            onDragOver={(e) => handleDragOver(e, 'uncategorized')}
            onDragLeave={() => setDragOverFolder(null)}
            onDrop={(e) => handleDrop(e, 'uncategorized')}
            className={`flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer hover:bg-[var(--bg-tertiary)] transition-all ${
              dragOverFolder === 'uncategorized' ? 'bg-[var(--accent-cyan-dim)] border border-[var(--accent-cyan)]' : ''
            }`}
            onClick={() => onToggleFolder('uncategorized')}
          >
            <span className={`transition-transform duration-200 text-[var(--text-muted)] ${expandedFolders.has('uncategorized') ? 'rotate-90' : ''}`}>
              <Icons.ChevronRight />
            </span>
            <span className="w-2 h-2 rounded-full bg-[var(--text-muted)]" />
            <span className="text-[var(--text-secondary)]">
              <Icons.Folder open={expandedFolders.has('uncategorized')} />
            </span>
            <span className="flex-1 text-sm text-[var(--text-secondary)]">Uncategorized</span>
            <span className="badge bg-[var(--bg-secondary)] text-[var(--text-muted)]">
              {uncategorizedRecordings.length}
            </span>
          </div>

          {expandedFolders.has('uncategorized') && uncategorizedRecordings.length > 0 && (
            <div className="ml-6 border-l border-[var(--border-color)]">
              {uncategorizedRecordings.map(renderRecording)}
            </div>
          )}
        </div>

        {filteredRecordings.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-4 text-[var(--text-muted)]">
              {searchQuery ? <Icons.Search /> : <Icons.Music />}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">
              {searchQuery ? 'No matches found' : 'No recordings yet'}
            </div>
          </div>
        )}
      </div>

      {/* Stats footer */}
      <div className="px-4 py-2 border-t border-[var(--border-color)] text-[10px] text-[var(--text-muted)] flex items-center justify-between">
        <span>{recordings.length} recordings</span>
        <span>{formatSize(recordings.reduce((acc, r) => acc + r.size, 0))} total</span>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

export default function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [tabTitle, setTabTitle] = useState('')
  const [folders, setFolders] = useState<Folder[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'record' | 'library' | 'player'>('record')
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['uncategorized']))

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const elapsedRef = useRef<number>(0)
  const recordingTabRef = useRef<{ title: string; url: string; hostname: string }>({ title: '', url: '', hostname: '' })

  const loadLibrary = useCallback(async () => {
    const result = await chrome.storage.local.get(['folders', 'recordings', 'expandedFolders'])
    setFolders((result.folders || []) as Folder[])
    const recs = (result.recordings || []) as Recording[]
    const migratedRecs = recs.map(r => ({ ...r, folderId: r.folderId || 'uncategorized' }))
    setRecordings(migratedRecs.sort((a, b) => b.timestamp - a.timestamp))
    // Restore expanded folders state
    if (result.expandedFolders) {
      setExpandedFolders(new Set(result.expandedFolders as string[]))
    }
  }, [])

  useEffect(() => {
    loadLibrary()
    const listener = (message: { type: string }) => {
      if (message.type === 'RECORDING_SAVED') loadLibrary()
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [loadLibrary])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Preview on hover
  const handlePreviewRecording = async (recording: Recording | null) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }

    if (!recording) {
      setPreviewingId(null)
      return
    }

    setPreviewingId(recording.id)
    const blob = await getAudioBlob(recording.id)
    if (blob && previewingId === recording.id) {
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.volume = 0.5
      audio.play()
      previewAudioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        setPreviewingId(null)
      }
    }
  }

  // Folder operations
  const createFolder = async (name: string, parentId: string | null) => {
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      color: FOLDER_COLORS[folders.length % FOLDER_COLORS.length],
      createdAt: Date.now()
    }
    const updated = [...folders, newFolder]
    setFolders(updated)
    await chrome.storage.local.set({ folders: updated })
  }

  const renameFolder = async (id: string, name: string) => {
    const updated = folders.map(f => f.id === id ? { ...f, name } : f)
    setFolders(updated)
    await chrome.storage.local.set({ folders: updated })
  }

  const deleteFolder = async (id: string) => {
    const updatedRecordings = recordings.map(r => r.folderId === id ? { ...r, folderId: 'uncategorized' } : r)
    const updatedFolders = folders.filter(f => f.id !== id)
    setFolders(updatedFolders)
    setRecordings(updatedRecordings)
    await chrome.storage.local.set({ folders: updatedFolders, recordings: updatedRecordings })
  }

  const moveRecording = async (recordingId: string, folderId: string) => {
    const updated = recordings.map(r => r.id === recordingId ? { ...r, folderId } : r)
    setRecordings(updated)
    await chrome.storage.local.set({ recordings: updated })
  }

  const deleteRecording = async (id: string) => {
    const updated = recordings.filter(r => r.id !== id)
    setRecordings(updated)
    await chrome.storage.local.set({ recordings: updated })
    await deleteAudioBlob(id)
    if (selectedRecording?.id === id) setSelectedRecording(null)
  }

  const renameRecording = async (id: string, title: string) => {
    const updated = recordings.map(r => r.id === id ? { ...r, tabTitle: title } : r)
    setRecordings(updated)
    await chrome.storage.local.set({ recordings: updated })
  }

  const updateRecording = async (recording: Recording) => {
    const updated = recordings.map(r => r.id === recording.id ? recording : r)
    setRecordings(updated)
    await chrome.storage.local.set({ recordings: updated })
    if (selectedRecording?.id === recording.id) setSelectedRecording(recording)
  }

  const openDownloads = () => chrome.downloads.showDefaultFolder()

  const toggleFolder = async (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      // Save to storage
      chrome.storage.local.set({ expandedFolders: Array.from(next) })
      return next
    })
  }

  // Recording logic
  const startRecording = async () => {
    setError(null)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) { setError('Cannot access current tab'); return }

      const stream = await new Promise<MediaStream>((resolve, reject) => {
        chrome.tabCapture.capture({ audio: true, video: false }, (s) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else if (!s) reject(new Error('Could not capture audio'))
          else resolve(s)
        })
      })

      mediaStreamRef.current = stream
      audioChunksRef.current = []
      startTimeRef.current = Date.now()

      // Save tab info in ref so it's available in onstop callback
      let hostname = ''
      try {
        const urlObj = new URL(tab.url || '')
        hostname = urlObj.hostname.replace(/^www\./, '')
      } catch {
        hostname = 'unknown'
      }
      recordingTabRef.current = {
        title: tab.title || 'Unknown',
        url: tab.url || '',
        hostname
      }

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(audioContext.destination)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        // Use elapsedRef which is updated every second during recording
        const duration = elapsedRef.current > 0 ? elapsedRef.current : Math.floor((Date.now() - (startTimeRef.current || Date.now())) / 1000)
        const timestamp = Date.now()
        console.log('Recording stopped, duration:', duration, 'seconds')

        // Get tab info from ref (saved at start)
        const { title: savedTitle, url: savedUrl, hostname } = recordingTabRef.current

        const date = new Date(timestamp)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        const timeStr = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`
        const safeTitle = savedTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
        const fullPath = `sounds/${year}/${month}/${day}/recording_${timeStr}_${safeTitle}.webm`

        const recordingId = crypto.randomUUID()
        await saveAudioBlob(recordingId, blob)

        const url = URL.createObjectURL(blob)
        await chrome.downloads.download({ url, filename: fullPath, saveAs: false })
        URL.revokeObjectURL(url)

        // Format: "SiteName - Page Title"
        const siteName = getSiteName(hostname)
        const formattedTitle = `${siteName} - ${savedTitle}`

        // Get unique title to avoid duplicates
        const result = await chrome.storage.local.get(['recordings'])
        const existingRecordings = (result.recordings || []) as Recording[]
        const uniqueTitle = getUniqueTitle(formattedTitle, existingRecordings)

        const recording: Recording = {
          id: recordingId, filename: fullPath, duration, timestamp,
          tabTitle: uniqueTitle, tabUrl: savedUrl, hostname, size: blob.size, folderId: 'uncategorized'
        }

        chrome.runtime.sendMessage({ type: 'SAVE_RECORDING', recording })

        if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null }
        if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null }
        audioChunksRef.current = []
      }

      recorder.start(1000)
      setIsRecording(true)
      setTabTitle(tab.title || 'Unknown')

      timerRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          const currentElapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
          setElapsed(currentElapsed)
          elapsedRef.current = currentElapsed
        }
      }, 1000)

      chrome.runtime.sendMessage({
        type: 'SET_RECORDING_STATE',
        state: { isRecording: true, startTime: startTimeRef.current, tabId: tab.id, tabTitle: tab.title || 'Unknown' }
      })
    } catch (err) {
      console.error('Recording error:', err)
      setError(err instanceof Error ? err.message : 'Recording failed')
    }
  }

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    setIsRecording(false)
    setElapsed(0)
    elapsedRef.current = 0
    startTimeRef.current = null
    chrome.runtime.sendMessage({ type: 'SET_RECORDING_STATE', state: { isRecording: false, startTime: null, tabId: null, tabTitle: '' } })
  }

  const toggleRecording = () => { isRecording ? stopRecording() : startRecording() }

  const handleSelectRecording = (recording: Recording) => {
    setSelectedRecording(recording)
    setActiveTab('player')
  }

  const handleClosePlayer = () => {
    setSelectedRecording(null)
    setActiveTab('library')
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="noise-overlay" />

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[var(--accent-red)] flex items-center justify-center shadow-[0_0_12px_rgba(255,59,92,0.5)]">
            <div className="w-2.5 h-2.5 rounded-full bg-white"></div>
          </div>
          <span className="text-sm font-bold">CucuBau-Sound</span>
        </div>
        {isRecording && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--accent-red-dim)]">
            <span className="w-1.5 h-1.5 bg-[var(--accent-red)] rounded-full animate-pulse" />
            <span className="text-[10px] font-semibold text-[var(--accent-red)] mono">{formatTime(elapsed)}</span>
          </div>
        )}
      </div>

      {/* Tabs - hide when in player */}
      {activeTab !== 'player' && (
        <div className="flex-shrink-0 flex border-b border-[var(--border-color)]">
          <button
            onClick={() => setActiveTab('record')}
            className={`flex-1 py-3 text-sm font-medium transition-all relative ${activeTab === 'record' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            Record
            {activeTab === 'record' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[var(--accent-cyan)] rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`flex-1 py-3 text-sm font-medium transition-all relative ${activeTab === 'library' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            Library
            <span className="ml-1.5 badge bg-[var(--bg-tertiary)] text-[var(--text-muted)]">{recordings.length}</span>
            {activeTab === 'library' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[var(--accent-cyan)] rounded-full" />}
          </button>
        </div>
      )}

      {/* Content */}
      {activeTab === 'record' && (
        <RecordTab
          isRecording={isRecording}
          elapsed={elapsed}
          tabTitle={tabTitle}
          error={error}
          onToggleRecording={toggleRecording}
          onOpenDownloads={openDownloads}
        />
      )}
      {activeTab === 'library' && (
        <LibraryTab
          folders={folders}
          recordings={recordings}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onMoveRecording={moveRecording}
          onDeleteRecording={deleteRecording}
          onRenameRecording={renameRecording}
          onOpenDownloads={openDownloads}
          onSelectRecording={handleSelectRecording}
          onPreviewRecording={handlePreviewRecording}
          previewingId={previewingId}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
        />
      )}
      {activeTab === 'player' && selectedRecording && (
        <AudioPlayer
          recording={selectedRecording}
          onClose={handleClosePlayer}
          onDelete={() => { deleteRecording(selectedRecording.id); handleClosePlayer() }}
          onUpdate={updateRecording}
        />
      )}
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Recording, Folder } from '../types'
import { PRESET_TAGS, RECORDING_COLORS, MUSICAL_KEYS } from '../types'
import { detectBPM, normalizeAudio, trimAudio, audioBufferToWav, blobToAudioBuffer } from '../lib/audio'
import { StorageService, getStorageService } from '../storage/StorageService'
import { MigrationService } from '../storage/MigrationService'
import type { StorageError } from '../storage/types'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import Minimap from 'wavesurfer.js/dist/plugins/minimap.esm.js'

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
  ChevronRight: ({ size = 14 }: { size?: number }) => (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 14 14">
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
  Copy: () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="8" height="8" rx="1"/>
      <path d="M3 9V3a1 1 0 0 1 1-1h6"/>
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
  Settings: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41"/>
    </svg>
  ),
  ExternalLink: () => (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3H8M12 3v4M12 3L6 9"/>
      <path d="M10 5H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9"/>
    </svg>
  ),
}

// ============================================================================
// WAVEFORM ANIMATION COMPONENT (for recording)
// ============================================================================

function Waveform({ isActive, size = 'lg', color = 'red', frequencyData }: { isActive: boolean; size?: 'sm' | 'lg'; color?: 'red' | 'cyan'; frequencyData?: number[] }) {
  const barCount = size === 'sm' ? 8 : 16
  const height = size === 'sm' ? 'h-4' : 'h-10'
  const barWidth = size === 'sm' ? 'w-[2px]' : 'w-[3px]'
  const gap = size === 'sm' ? 'gap-[2px]' : 'gap-[3px]'
  const colorClass = color === 'cyan' ? 'bg-[var(--accent-cyan)]' : 'bg-[var(--accent-red)]'

  // Use real frequency data if available, otherwise fall back to CSS animation
  const hasRealData = frequencyData && frequencyData.length > 0

  return (
    <div className={`flex items-end justify-center ${gap} ${height}`}>
      {Array.from({ length: barCount }).map((_, i) => {
        const value = hasRealData ? (frequencyData[i] || 0) : 0
        return (
          <div
            key={i}
            className={`${barWidth} rounded-full ${isActive ? colorClass : 'bg-[var(--text-muted)]'}`}
            style={{
              height: hasRealData
                ? `${Math.max(10, value * 100)}%`
                : isActive ? '100%' : '30%',
              animation: !hasRealData && isActive ? `wave 0.8s ease-in-out infinite` : 'none',
              animationDelay: !hasRealData ? `${i * 0.05}s` : undefined,
              transition: hasRealData ? 'height 50ms ease-out' : 'all 300ms',
            }}
          />
        )
      })}
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
  minimapContainerRef: React.RefObject<HTMLDivElement | null>,
  audioUrl: string | null,
  options?: { loop?: boolean }
) {
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const minimapRef = useRef<any>(null)
  const loopRef = useRef(options?.loop ?? false)
  const [isReady, setIsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [zoomLevel, setZoomLevel] = useState(1)
  const zoomRef = useRef(1)

  // Keep loopRef in sync without triggering wavesurfer recreation
  useEffect(() => {
    loopRef.current = options?.loop ?? false
  }, [options?.loop])

  useEffect(() => {
    if (!containerRef.current || !audioUrl) return

    const regions = RegionsPlugin.create()
    const minimap = Minimap.create({
      container: minimapContainerRef?.current || undefined,
      height: 30,
      waveColor: 'rgba(255, 255, 255, 0.35)',
      progressColor: 'rgba(0, 255, 136, 0.6)',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      overlayColor: 'rgba(0, 255, 136, 0.12)',
      interact: false,
      normalize: true,
      barWidth: 1,
      barGap: 1,
      barRadius: 1,
    })

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(255, 255, 255, 0.25)',
      progressColor: '#00ff88',
      cursorColor: '#ffffff',
      cursorWidth: 2,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 120,
      normalize: true,
      backend: 'WebAudio',
      interact: false,
      dragToSeek: false,
      minPxPerSec: 1,
      plugins: [regions, minimap],
    })

    ws.load(audioUrl)

    wavesurferRef.current = ws
    regionsRef.current = regions
    minimapRef.current = minimap

    let minimapCleanup: (() => void) | null = null

    ws.on('ready', () => {
      setIsReady(true)
      setDuration(ws.getDuration())

      // Setup minimap drag-to-navigate after ready (minimapWrapper only exists after render)
      const mmWrapper = (minimap as any).minimapWrapper as HTMLElement | null
      if (mmWrapper) {
        mmWrapper.style.cursor = 'grab'
        const onDown = (e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
          // Pause if playing - minimap drag is navigate only, never play
          if (ws.isPlaying()) ws.pause()
          mmWrapper.style.cursor = 'grabbing'
          const dur = ws.getDuration() || 1
          const navigateFromX = (clientX: number) => {
            const mmRect = mmWrapper.getBoundingClientRect()
            const ratio = Math.max(0, Math.min(1, (clientX - mmRect.left) / mmRect.width))
            // Use setTime instead of seekTo to avoid triggering play via dragToSeek
            ws.setTime(ratio * dur)
          }
          navigateFromX(e.clientX)
          const onMove = (ev: MouseEvent) => navigateFromX(ev.clientX)
          const onUp = () => {
            mmWrapper.style.cursor = 'grab'
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }
        mmWrapper.addEventListener('mousedown', onDown)
        minimapCleanup = () => mmWrapper.removeEventListener('mousedown', onDown)
      }
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
      if (loopRef.current) {
        ws.seekTo(0)
        ws.play()
      } else {
        setIsPlaying(false)
      }
    })

    // Scroll-to-zoom centered on mouse position
    const container = containerRef.current
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -1 : 1
      const oldZoom = zoomRef.current
      const newZoom = Math.max(1, Math.min(50, oldZoom + delta))
      if (newZoom === oldZoom) return

      const containerWidth = container.clientWidth
      const dur = ws.getDuration() || 1

      // Mouse position relative to container
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left

      // Time under mouse before zoom (using ws API to read scroll)
      const oldScrollLeft = ws.getScroll()
      const oldPxPerSec = (containerWidth / dur) * oldZoom
      const timeAtMouse = (oldScrollLeft + mouseX) / oldPxPerSec

      // Apply zoom - this internally adjusts scroll to keep cursor stable
      const newPxPerSec = (containerWidth / dur) * newZoom
      try { ws.zoom(newPxPerSec) } catch {}

      // Override scroll so the time under mouse stays under mouse
      const targetScroll = Math.max(0, (timeAtMouse * newPxPerSec) - mouseX)
      // Use rAF to run after wavesurfer's internal reRender scroll adjustment
      requestAnimationFrame(() => {
        // @ts-ignore - setScroll exists
        ws.setScroll(targetScroll)
      })

      zoomRef.current = newZoom
      setZoomLevel(newZoom)
    }
    container.addEventListener('wheel', handleWheel, { passive: false })

    // Drag-to-pan + double-click-to-seek
    let dragStartX = 0
    let dragStartScroll = 0
    let isDragging = false
    let cropResizing = false
    const DRAG_THRESHOLD = 4

    const isOnCropHandle = (e: MouseEvent) => {
      return e.composedPath().some(el =>
        el instanceof HTMLElement && el.style.cursor === 'ew-resize'
      )
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      // If clicking on a crop region handle, let the handle do its thing
      if (isOnCropHandle(e)) {
        cropResizing = true
        const onUp = () => {
          cropResizing = false
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mouseup', onUp)
        return
      }
      dragStartX = e.clientX
      dragStartScroll = ws.getScroll()
      isDragging = false

      const onMouseMove = (ev: MouseEvent) => {
        if (cropResizing) return
        const dx = ev.clientX - dragStartX
        if (!isDragging && Math.abs(dx) > DRAG_THRESHOLD) {
          isDragging = true
          container.style.cursor = 'grabbing'
        }
        if (isDragging) {
          // @ts-ignore
          ws.setScroll(dragStartScroll - dx)
        }
      }

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        container.style.cursor = ''
        isDragging = false
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    }

    const handleDblClick = (e: MouseEvent) => {
      // No seek in crop mode, and not on crop handles
      if (cropResizing || isOnCropHandle(e)) return
      if (regionsRef.current) {
        const activeRegions = regionsRef.current.getRegions()
        if (activeRegions.length > 0) return
      }
      const rect = container.getBoundingClientRect()
      const dur = ws.getDuration() || 1
      const pxPerSec = (container.clientWidth / dur) * zoomRef.current
      const clickTime = (ws.getScroll() + (e.clientX - rect.left)) / pxPerSec
      ws.setTime(Math.max(0, Math.min(dur, clickTime)))
    }

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('dblclick', handleDblClick)

    return () => {
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('dblclick', handleDblClick)
      minimapCleanup?.()
      ws.destroy()
      wavesurferRef.current = null
      regionsRef.current = null
      minimapRef.current = null
      setIsReady(false)
      setIsPlaying(false)
      zoomRef.current = 1
      setZoomLevel(1)
    }
  }, [audioUrl, containerRef])

  const stop = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.pause()
      wavesurferRef.current.seekTo(0)
      setCurrentTime(0)
    }
  }, [])
  const togglePlay = useCallback(() => wavesurferRef.current?.playPause(), [])
  const skip = useCallback((seconds: number) => {
    if (wavesurferRef.current && duration > 0) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
      wavesurferRef.current.seekTo(newTime / duration)
    }
  }, [currentTime, duration])
  const setZoom = useCallback((multiplier: number) => {
    if (wavesurferRef.current && containerRef.current) {
      try {
        const clamped = Math.max(1, Math.min(50, multiplier))
        const containerWidth = containerRef.current.clientWidth
        const dur = wavesurferRef.current.getDuration() || 1
        const pxPerSec = (containerWidth / dur) * clamped
        wavesurferRef.current.zoom(pxPerSec)
        zoomRef.current = clamped
        setZoomLevel(clamped)
      } catch {}
    }
  }, [containerRef])

  const setColors = useCallback((waveColor: string, progressColor: string, cursorColor: string) => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setOptions({ waveColor, progressColor, cursorColor })
    }
  }, [])

  return {
    wavesurferRef,
    regions: regionsRef.current,
    minimapRef,
    isReady,
    isPlaying,
    currentTime,
    duration,
    zoomLevel,
    stop,
    togglePlay,
    skip,
    setZoom,
    setColors,
  }
}

// ============================================================================
// AUDIO PLAYER COMPONENT
// ============================================================================

interface AudioPlayerProps {
  recording: Recording
  recordings: Recording[]
  onClose: () => void
  onDelete: () => void
  onUpdate: (recording: Recording) => void
  onSelectRecording: (recording: Recording) => void
  onSelectRecordingFromCrop: (recording: Recording, parentId: string) => void
  onRefreshRecordings: () => Recording[]
  cameFromRecordingId: string | null
}

function AudioPlayer({ recording, recordings, onClose, onDelete, onUpdate, onSelectRecording, onSelectRecordingFromCrop, onRefreshRecordings, cameFromRecordingId }: AudioPlayerProps) {
  const waveformRef = useRef<HTMLDivElement>(null)
  const minimapContainerRef = useRef<HTMLDivElement>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(true)
  const [isLoop, setIsLoop] = useState(recording.isLooped || false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(recording.tabTitle)
  const [isCropping, setIsCropping] = useState(false)
  const [cropRegion, setCropRegion] = useState<{ start: number; end: number } | null>(null)
  const cropRegionRef = useRef<any>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [pendingCrop, setPendingCrop] = useState<{ blob: Blob; duration: number } | null>(null)
  const [cropTitle, setCropTitle] = useState('')
  const [cropTitleError, setCropTitleError] = useState('')

  const {
    wavesurferRef,
    isReady,
    isPlaying,
    currentTime,
    duration,
    zoomLevel: zoom,
    regions,
    minimapRef,
    togglePlay,
    skip,
    stop,
    setZoom,
    setColors,
  } = useWaveSurfer(waveformRef, minimapContainerRef, audioUrl, { loop: isLoop })

  // Load audio from file system
  useEffect(() => {
    let url: string | null = null

    const loadAudio = async () => {
      setIsLoadingFile(true)
      setError(null)

      try {
        const storage = getStorageService()
        const result = await storage.getRecordingBlob(recording.id)
        if (result.success) {
          url = URL.createObjectURL(result.data)
          setAudioUrl(url)
          setAudioBlob(result.data)
        } else {
          setError('Audio file not found on disk')
        }
      } catch (err) {
        setError('Error loading audio')
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

  // Manage crop region via wavesurfer Regions plugin
  useEffect(() => {
    if (!regions) return

    if (isCropping && cropRegion) {
      // Clear any old regions and add the crop region
      regions.clearRegions()
      const region = regions.addRegion({
        start: cropRegion.start,
        end: cropRegion.end,
        color: 'rgba(255, 59, 92, 0.35)',
        drag: false,
        resize: true,
      })
      cropRegionRef.current = region

      // Style: region body passes clicks through, handles are visible and interactive
      if (region.element) {
        region.element.style.pointerEvents = 'none'
        region.element.style.borderTop = 'none'
        region.element.style.borderBottom = 'none'
        region.element.style.zIndex = '10'
        const handles = region.element.querySelectorAll('div[style*="cursor: ew-resize"]')
        handles.forEach((h: Element, i: number) => {
          const el = h as HTMLElement
          const isLeft = i === 0
          el.style.pointerEvents = 'all'
          el.style.width = '10px'
          el.style.background = 'transparent'
          el.style.borderRadius = '0'
          el.style.borderLeft = 'none'
          el.style.borderRight = 'none'
          el.style.zIndex = '11'
          el.style.borderInline = 'none'
          el.style.marginLeft = isLeft ? '-5px' : '0'
          el.style.marginRight = isLeft ? '0' : '-5px'
          // Thin visible orange line in the center
          el.style.backgroundImage = 'linear-gradient(to right, transparent 4px, #ff9500 4px, #ff9500 6px, transparent 6px)'
        })
      }

      // Show crop region on minimap too (non-interactive)
      let mmRegions: ReturnType<typeof RegionsPlugin.create> | null = null
      const mmWs = (minimapRef.current as any)?.miniWavesurfer
      if (mmWs) {
        mmRegions = mmWs.registerPlugin(RegionsPlugin.create())
        if (mmRegions) {
          const mmRegion = mmRegions.addRegion({
            start: cropRegion.start,
            end: cropRegion.end,
            color: 'rgba(255, 149, 0, 0.15)',
            drag: false,
            resize: false,
          })
          if (mmRegion.element) {
            mmRegion.element.style.pointerEvents = 'none'
            mmRegion.element.style.borderLeft = '1px solid rgba(255, 149, 0, 0.5)'
            mmRegion.element.style.borderRight = '1px solid rgba(255, 149, 0, 0.5)'
          }
        }
      }

      // Listen for handle drag updates
      const onUpdate = () => {
        if (cropRegionRef.current) {
          const { start, end } = cropRegionRef.current
          setCropRegion({ start, end })
          // Update minimap region too
          if (mmRegions) {
            mmRegions.clearRegions()
            const r = mmRegions.addRegion({ start, end, color: 'rgba(255, 149, 0, 0.15)', drag: false, resize: false })
            if (r.element) {
              r.element.style.pointerEvents = 'none'
              r.element.style.borderLeft = '1px solid rgba(255, 149, 0, 0.5)'
              r.element.style.borderRight = '1px solid rgba(255, 149, 0, 0.5)'
            }
          }
        }
      }
      region.on('update-end', onUpdate)
      region.on('update', onUpdate)

      return () => {
        region.remove()
        cropRegionRef.current = null
        if (mmRegions) { mmRegions.clearRegions(); mmRegions.destroy() }
      }
    } else {
      regions.clearRegions()
      cropRegionRef.current = null
    }
  }, [isCropping, regions])

  // Sync region position when cropRegion changes from outside (initial set)
  useEffect(() => {
    if (cropRegionRef.current && cropRegion) {
      // Only update if significantly different (avoid loop from region events)
      const r = cropRegionRef.current
      if (Math.abs(r.start - cropRegion.start) > 0.01 || Math.abs(r.end - cropRegion.end) > 0.01) {
        r.setOptions({ start: cropRegion.start, end: cropRegion.end })
      }
    }
  }, [cropRegion])

  // Constrain playback to crop region: loop restarts, no-loop pauses at end
  useEffect(() => {
    if (!regions || !isCropping) return

    const onRegionOut = (region: any) => {
      if (cropRegionRef.current === region && wavesurferRef.current?.isPlaying()) {
        if (isLoop) {
          region.play()
        } else {
          wavesurferRef.current.pause()
          wavesurferRef.current.setTime(region.end)
        }
      }
    }
    regions.on('region-out', onRegionOut)

    return () => {
      regions.un('region-out', onRegionOut)
    }
  }, [regions, isCropping, isLoop])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          if (isPlaying) {
            togglePlay()
          } else if (isCropping && cropRegionRef.current) {
            cropRegionRef.current.play()
          } else {
            togglePlay()
          }
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
  }, [togglePlay, skip, isPlaying, isCropping])

  const handleClose = () => {
    stop()
    // Small delay to ensure audio fully stops before unmounting
    setTimeout(() => {
      // If we came here from cropping, go back to the parent recording
      if (cameFromRecordingId) {
        const parent = recordings.find(r => r.id === cameFromRecordingId)
        if (parent) {
          onSelectRecording(parent)
          return
        }
      }
      onClose()
    }, 50)
  }

  const handleDelete = () => {
    stop()
    onDelete()
  }

  const handleZoom = (delta: number) => {
    setZoom(zoom + delta)
  }

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== recording.tabTitle) {
      onUpdate({ ...recording, tabTitle: editTitle.trim() })
    }
    setIsEditingTitle(false)
  }

  // Build full file path
  const [filePath, setFilePath] = useState<string>(recording.filename)
  const [copiedFilePath, setCopiedFilePath] = useState(false)

  useEffect(() => {
    const loadPath = async () => {
      const storage = getStorageService()
      // Use fullPath from library if available, otherwise just folder name
      const fullPath = storage.getFullPath()
      const folderName = await storage.getFolderName()
      const basePath = fullPath || folderName

      if (basePath) {
        // Get folder path for this recording
        const folders = storage.getFolders()
        const folder = folders.find(f => f.id === recording.folderId)
        if (folder) {
          // Build path through parent folders
          let current: typeof folder | undefined = folder
          const folderPath: string[] = []
          while (current) {
            folderPath.unshift(current.name)
            current = folders.find(f => f.id === current?.parentId)
          }
          setFilePath([basePath, ...folderPath, recording.filename].join('/'))
        } else if (recording.folderId === 'uncategorized') {
          setFilePath(`${basePath}/${recording.filename}`)
        } else {
          setFilePath(`${basePath}/${recording.filename}`)
        }
      }
    }
    loadPath()
  }, [recording.id, recording.folderId, recording.filename])

  const copyFilePath = async () => {
    await navigator.clipboard.writeText(filePath)
    setCopiedFilePath(true)
    setTimeout(() => setCopiedFilePath(false), 2000)
  }

  const openFileLocation_UNUSED = async () => {
    // Keep for reference - old download-based approach
    try {
      if (audioBlob) {
        const url = URL.createObjectURL(audioBlob)
        const dlId = await chrome.downloads.download({ url, filename: recording.filename, saveAs: false, conflictAction: 'overwrite' })
        URL.revokeObjectURL(url)
        if (dlId) {
          // Wait for download to complete, then show in file manager
          const onChanged = (delta: chrome.downloads.DownloadDelta) => {
            if (delta.id === dlId && delta.state?.current === 'complete') {
              chrome.downloads.onChanged.removeListener(onChanged)
              chrome.downloads.show(dlId)
              setTimeout(() => chrome.downloads.erase({ id: dlId }), 2000)
            }
          }
          chrome.downloads.onChanged.addListener(onChanged)
        }
      } else {
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
      // Update recording on disk
      const storage = getStorageService()
      await storage.saveRecording(recording, newBlob)
      setAudioBlob(newBlob)
      const newUrl = URL.createObjectURL(newBlob)
      setAudioUrl(newUrl)
    } catch (err) {
      console.error('Normalize failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // Copy file path to clipboard
  const [copiedPath, setCopiedPath] = useState(false)
  const handleCopyPath = async () => {
    const storage = getStorageService()
    // Use fullPath from library if available, otherwise just folder name
    const fullPath = storage.getFullPath()
    const folderName = await storage.getFolderName()
    const basePath = fullPath || folderName

    // Build the full path including any subfolders
    let path = recording.filename
    if (basePath) {
      const folders = storage.getFolders()
      const folder = folders.find(f => f.id === recording.folderId)
      if (folder) {
        const folderPath: string[] = []
        let current: typeof folder | undefined = folder
        while (current) {
          folderPath.unshift(current.name)
          current = folders.find(f => f.id === current?.parentId)
        }
        path = [basePath, ...folderPath, recording.filename].join('/')
      } else {
        path = `${basePath}/${recording.filename}`
      }
    }

    await navigator.clipboard.writeText(path)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2000)
  }

  const handleStartCrop = () => {
    if (!duration) return
    stop()
    setIsCropping(true)
    setCropRegion({ start: duration * 0.25, end: duration * 0.75 })
    // Dim waveform, red progress, red cursor
    setColors('rgba(255, 255, 255, 0.08)', '#ff3b5c', '#ff3b5c')
  }

  const handleCancelCrop = () => {
    stop()
    setIsCropping(false)
    setCropRegion(null)
    setColors('rgba(255, 255, 255, 0.25)', '#00ff88', '#00ff88')
  }

  const handleApplyCrop = async () => {
    if (!audioBlob || !cropRegion) return
    setIsProcessing(true)
    try {
      const audioBuffer = await blobToAudioBuffer(audioBlob)
      const trimmed = trimAudio(audioBuffer, cropRegion.start, cropRegion.end)
      const newBlob = audioBufferToWav(trimmed)
      const newDuration = Math.round(cropRegion.end - cropRegion.start)

      // Count existing crops for this recording
      const storage = getStorageService()
      const existingCrops = storage.getRecordings().filter(r => r.parentId === recording.id)
      const cropNumber = existingCrops.length + 1
      const defaultTitle = `${recording.tabTitle} (crop ${cropNumber})`

      // Show modal for naming the crop
      setPendingCrop({ blob: newBlob, duration: newDuration })
      setCropTitle(defaultTitle)
    } catch (err) {
      console.error('Crop failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const saveCrop = async () => {
    if (!pendingCrop) return

    // Validate: check for duplicate title
    const trimmedTitle = cropTitle.trim() || `${recording.tabTitle} (crop)`
    const isDuplicate = recordings.some(r => r.tabTitle === trimmedTitle)
    if (isDuplicate) {
      setCropTitleError('A recording with this name already exists')
      return
    }
    setCropTitleError('')

    setIsProcessing(true)
    try {
      const storage = getStorageService()
      const timestamp = Date.now()
      const date = new Date(timestamp)
      const timeStr = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`
      const safeTitle = trimmedTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
      const uniqueId = crypto.randomUUID().slice(0, 8) // Short unique ID

      const cropRecording: Recording = {
        id: crypto.randomUUID(),
        filename: `${safeTitle}_${timeStr}_${uniqueId}.wav`,
        duration: pendingCrop.duration,
        timestamp,
        tabTitle: trimmedTitle,
        tabUrl: recording.tabUrl,
        hostname: recording.hostname,
        size: pendingCrop.blob.size,
        folderId: recording.folderId,
        parentId: recording.id, // Link to original
      }

      await storage.saveRecording(cropRecording, pendingCrop.blob)

      // Close crop mode and modal
      setPendingCrop(null)
      setCropTitle('')
      setCropTitleError('')
      setIsCropping(false)
      setCropRegion(null)
      setColors('rgba(255, 255, 255, 0.25)', '#00ff88', '#00ff88')

      // Refresh library to include new crop, then navigate to it
      onRefreshRecordings()
      onSelectRecordingFromCrop(cropRecording, recording.id)
    } catch (err) {
      console.error('Save crop failed:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const cancelCrop = () => {
    setPendingCrop(null)
    setCropTitle('')
    setCropTitleError('')
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
          <div ref={waveformRef} className="w-full cursor-pointer" style={{ userSelect: 'none', overflowX: 'hidden' }} />
          <div className="h-[1px] bg-[var(--accent-cyan)] opacity-30 mx-0" />
          <div ref={minimapContainerRef} className="w-full" />
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
            <button onClick={() => handleZoom(-2)} className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Icons.ZoomOut />
            </button>
            <span className="text-[10px] text-[var(--text-muted)] w-10 text-center">{zoom}x</span>
            <button onClick={() => handleZoom(2)} className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
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
            onClick={() => {
              if (isPlaying) {
                togglePlay()
              } else if (isCropping && cropRegionRef.current) {
                cropRegionRef.current.play()
              } else {
                togglePlay()
              }
            }}
            disabled={!isReady}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isReady
                ? isCropping
                  ? 'bg-[var(--accent-orange)] hover:shadow-[0_0_20px_rgba(255,149,0,0.3)] text-[var(--bg-primary)]'
                  : 'bg-[var(--accent-cyan)] hover:shadow-[var(--glow-cyan)] text-[var(--bg-primary)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
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

        {/* Crop action bar */}
        {isCropping && cropRegion && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--accent-orange)]/10 border border-[var(--accent-orange)]/30">
            <div className="text-xs text-[var(--accent-orange)] mono">
              {formatTimeMs(cropRegion.start)} — {formatTimeMs(cropRegion.end)} ({formatTimeMs(cropRegion.end - cropRegion.start)})
            </div>
            <div className="flex gap-2">
              <button onClick={handleCancelCrop} className="btn btn-ghost text-xs py-1">Cancel</button>
              <button
                onClick={handleApplyCrop}
                disabled={isProcessing}
                className="btn text-xs py-1 bg-[var(--accent-orange)] text-[var(--bg-primary)]"
              >
                <Icons.Scissors />
                Apply Crop
              </button>
            </div>
          </div>
        )}

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
            onClick={isCropping ? handleCancelCrop : handleStartCrop}
            disabled={isProcessing || !isReady}
            className={`btn text-xs ${isCropping ? 'bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] border border-[var(--accent-orange)]/30' : 'btn-ghost'}`}
          >
            <Icons.Scissors />
            Crop
          </button>
          <button
            onClick={handleCopyPath}
            className="btn btn-ghost text-xs"
          >
            <Icons.Copy />
            {copiedPath ? 'Copied!' : 'Copy Path'}
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
            <span className="text-[10px] text-[var(--text-muted)]">FILE PATH</span>
            <button
              onClick={copyFilePath}
              className="text-[10px] text-[var(--accent-cyan)] hover:underline flex items-center gap-1"
            >
              <Icons.Copy />
              {copiedFilePath ? 'Copied!' : 'Copy path'}
            </button>
          </div>
          <div
            onClick={copyFilePath}
            className="text-xs text-[var(--text-secondary)] truncate mono cursor-pointer hover:text-[var(--accent-cyan)] transition-colors"
            title={filePath}
          >
            {filePath}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--text-muted)]">
            <span>{formatSize(recording.size)}</span>
            <span>•</span>
            <span>{formatTime(recording.duration)}</span>
            <span>•</span>
            <span>WAV</span>
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
        <span><kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded">Scroll</kbd> Zoom</span>
      </div>

      {/* Save Crop Modal */}
      {pendingCrop && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-4 w-full max-w-sm border border-[var(--border-color)] shadow-2xl">
            <h3 className="text-sm font-semibold mb-1 text-[var(--text-primary)]">Save Crop</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Duration: {formatTime(pendingCrop.duration)}
            </p>
            <input
              type="text"
              value={cropTitle}
              onChange={(e) => { setCropTitle(e.target.value); setCropTitleError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') saveCrop() }}
              placeholder="Crop name..."
              autoFocus
              className={`w-full px-3 py-2 bg-[var(--bg-tertiary)] border rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none ${cropTitleError ? 'border-[var(--accent-red)]' : 'border-[var(--border-color)] focus:border-[var(--accent-cyan)]'}`}
            />
            {cropTitleError && (
              <p className="text-xs text-[var(--accent-red)] mt-1 mb-2">{cropTitleError}</p>
            )}
            {!cropTitleError && <div className="mb-3" />}
            <div className="flex gap-2">
              <button
                onClick={cancelCrop}
                className="flex-1 px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCrop}
                disabled={isProcessing}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[var(--accent-cyan)] hover:bg-[var(--accent-cyan-hover)] rounded-lg transition-colors disabled:opacity-50"
              >
                {isProcessing ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
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
  frequencyData: number[]
  onToggleRecording: () => void
  onOpenDownloads: () => void
}

function RecordTab({ isRecording, elapsed, tabTitle, error, frequencyData, onToggleRecording, onOpenDownloads }: RecordTabProps) {
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
            <Waveform isActive={true} frequencyData={frequencyData} />
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
  onMoveFolder: (folderId: string, newParentId: string | null) => void
  onReorderFolder: (folderId: string, targetId: string, position: 'above' | 'below') => void
  onReorderRecording: (recordingId: string, targetId: string, position: 'above' | 'below', folderId: string) => void
  onDeleteRecording: (id: string) => void
  onConfirmDeleteRecording: (id: string, name: string, childCount: number) => void
  onConfirmDeleteFolder: (id: string, name: string, childCount: number) => void
  onRenameRecording: (id: string, title: string) => void
  onOpenDownloads: () => void
  onSelectRecording: (recording: Recording) => void
  onPreviewRecording: (recording: Recording | null) => void
  previewingId: string | null
  playingPreviewId: string | null
  onPlayPreview: (recording: Recording) => void
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
  onMoveFolder,
  onReorderFolder,
  onReorderRecording,
  onDeleteRecording,
  onConfirmDeleteRecording,
  onConfirmDeleteFolder,
  onRenameRecording,
  onOpenDownloads,
  onSelectRecording,
  onPreviewRecording,
  previewingId,
  playingPreviewId,
  onPlayPreview,
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
  const [movingFolder, setMovingFolder] = useState<string | null>(null)
  const [dragOverRecording, setDragOverRecording] = useState<{ id: string; position: 'above' | 'below' } | null>(null)
  const [dragOverFolderEdge, setDragOverFolderEdge] = useState<{ id: string; position: 'above' | 'below' } | null>(null)
  const [filterRating, setFilterRating] = useState<number>(0) // 0 = all, 1-5 = exact stars
  const [filterSite, setFilterSite] = useState<string>('') // '' = all
  const [expandedRecordings, setExpandedRecordings] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)
  const recordingInputRef = useRef<HTMLInputElement>(null)

  // Get direct crops for a recording (filtered by active filters, sorted by sortOrder)
  const getCropsForRecording = (recordingId: string) =>
    recordings
      .filter(r => {
        if (r.parentId !== recordingId) return false

        // Apply same filters as main list when filters are active
        if (filterRating > 0 && (r.rating || 0) !== filterRating) return false
        if (filterSite && (r.hostname || '') !== filterSite) return false
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          const matchesSearch = (
            (r.tabTitle || '').toLowerCase().includes(q) ||
            (r.hostname || '').toLowerCase().includes(q) ||
            (r.tags || []).some(t => t.toLowerCase().includes(q)) ||
            (r.notes || '').toLowerCase().includes(q) ||
            (r.key || '').toLowerCase().includes(q)
          )
          if (!matchesSearch) return false
        }

        return true
      })
      .sort((a, b) => (a.sortOrder ?? a.timestamp) - (b.sortOrder ?? b.timestamp))

  // Get total descendant count (children + grandchildren + etc.) - respects active filters
  const getTotalDescendantCount = (recordingId: string): number => {
    const directCrops = getCropsForRecording(recordingId)
    return directCrops.reduce((sum, crop) => sum + 1 + getTotalDescendantCount(crop.id), 0)
  }

  // Toggle recording expansion (to show/hide crops)
  const toggleRecordingExpanded = (recordingId: string) => {
    setExpandedRecordings(prev => {
      const next = new Set(prev)
      if (next.has(recordingId)) next.delete(recordingId)
      else next.add(recordingId)
      return next
    })
  }

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
  // Exclude crops from main list (they show nested under parent)
  const filteredRecordings = recordings.filter(r => {
    // Exclude crops from main list
    if (r.parentId) return false

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

  const rootFolders = folders
    .filter(f => f.parentId === null)
    .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt))
  const uncategorizedRecordings = filteredRecordings
    .filter(r => r.folderId === 'uncategorized')
    .sort((a, b) => (a.sortOrder ?? a.timestamp) - (b.sortOrder ?? b.timestamp))

  const getRecordingsForFolder = (folderId: string) =>
    filteredRecordings
      .filter(r => r.folderId === folderId)
      .sort((a, b) => (a.sortOrder ?? a.timestamp) - (b.sortOrder ?? b.timestamp))

  // Recursive count: recordings in this folder + all descendant folders
  const getTotalRecordingsCount = (folderId: string): number => {
    const direct = filteredRecordings.filter(r => r.folderId === folderId).length
    const children = folders.filter(f => f.parentId === folderId)
    return direct + children.reduce((sum, child) => sum + getTotalRecordingsCount(child.id), 0)
  }

  const handleDragStartRecording = (e: React.DragEvent, recordingId: string) => {
    e.stopPropagation() // Prevent parent from capturing drag
    e.dataTransfer.setData('recordingId', recordingId)
    e.dataTransfer.effectAllowed = 'move'
    setMovingRecording(recordingId)
  }

  const handleDragStartFolder = (e: React.DragEvent, folderId: string) => {
    e.dataTransfer.setData('folderId', folderId)
    e.dataTransfer.effectAllowed = 'move'
    setMovingFolder(folderId)
    e.stopPropagation()
  }

  const handleDragEnd = () => {
    setMovingRecording(null)
    setMovingFolder(null)
    setDragOverFolder(null)
    setDragOverRecording(null)
    setDragOverFolderEdge(null)
  }

  const handleDragOverFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverRecording(null)

    // When dragging a folder over another folder, use zones:
    // top 25% = reorder above, bottom 25% = reorder below, middle 50% = nest inside
    if (movingFolder && movingFolder !== folderId) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const ratio = y / rect.height
      if (ratio < 0.25) {
        setDragOverFolderEdge({ id: folderId, position: 'above' })
        setDragOverFolder(null)
      } else if (ratio > 0.75) {
        setDragOverFolderEdge({ id: folderId, position: 'below' })
        setDragOverFolder(null)
      } else {
        setDragOverFolder(folderId)
        setDragOverFolderEdge(null)
      }
    } else {
      setDragOverFolder(folderId)
      setDragOverFolderEdge(null)
    }
  }

  const handleDragOverRecording = (e: React.DragEvent, recordingId: string) => {
    e.preventDefault()
    e.stopPropagation()
    // Only show reorder indicator when dragging a recording (not a folder)
    if (movingRecording) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const y = e.clientY - rect.top
      const position: 'above' | 'below' = y < rect.height / 2 ? 'above' : 'below'
      setDragOverRecording({ id: recordingId, position })
      setDragOverFolder(null)
    }
  }

  const handleDropOnFolder = (e: React.DragEvent, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const recordingId = e.dataTransfer.getData('recordingId')
    const draggedFolderId = e.dataTransfer.getData('folderId')
    if (recordingId) {
      onMoveRecording(recordingId, folderId)
    } else if (draggedFolderId && draggedFolderId !== folderId) {
      // Check if we're reordering (edge zone) or nesting (center zone)
      if (dragOverFolderEdge && dragOverFolderEdge.id === folderId) {
        onReorderFolder(draggedFolderId, folderId, dragOverFolderEdge.position)
      } else {
        onMoveFolder(draggedFolderId, folderId === 'uncategorized' ? null : folderId)
      }
    }
    setDragOverFolder(null)
    setDragOverRecording(null)
    setDragOverFolderEdge(null)
    setMovingRecording(null)
    setMovingFolder(null)
  }

  const handleDropOnRecording = (e: React.DragEvent, targetRecordingId: string, folderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const recordingId = e.dataTransfer.getData('recordingId')
    const draggedFolderId = e.dataTransfer.getData('folderId')
    if (recordingId && dragOverRecording) {
      if (recordingId === targetRecordingId) {
        // Dropping on self — no-op
      } else {
        // Always allow reorder - the reorderRecording function will handle
        // putting it in the right group (same parentId or root recordings)
        onReorderRecording(recordingId, targetRecordingId, dragOverRecording.position, folderId)
      }
    } else if (draggedFolderId) {
      // Folder dropped on recording — move folder into that recording's folder
      const targetFolder = folderId === 'uncategorized' ? null : folderId
      if (draggedFolderId !== folderId) {
        onMoveFolder(draggedFolderId, targetFolder)
      }
    }
    setDragOverFolder(null)
    setDragOverRecording(null)
    setDragOverFolderEdge(null)
    setMovingRecording(null)
    setMovingFolder(null)
  }

  const renderRecording = (recording: Recording, folderId: string, depth = 0) => {
    const isPreviewing = previewingId === recording.id
    const isPlaying = playingPreviewId === recording.id
    const isEditing = editingRecording === recording.id
    const isDropAbove = dragOverRecording?.id === recording.id && dragOverRecording.position === 'above'
    const isDropBelow = dragOverRecording?.id === recording.id && dragOverRecording.position === 'below'
    const crops = getCropsForRecording(recording.id)
    const hasCrops = crops.length > 0
    const totalDescendants = getTotalDescendantCount(recording.id)
    const isExpanded = expandedRecordings.has(recording.id)
    const isCrop = depth > 0

    return (
      <div key={recording.id}>
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStartRecording(e, recording.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverRecording(e, recording.id)}
          onDragLeave={() => setDragOverRecording(null)}
          onDrop={(e) => handleDropOnRecording(e, recording.id, folderId)}
          onClick={() => !isEditing && onSelectRecording(recording)}
          onMouseEnter={() => onPreviewRecording(recording)}
          onMouseLeave={() => onPreviewRecording(null)}
          className={`group flex items-center gap-3 px-3 py-2.5 mx-2 cursor-pointer transition-all relative ${
            movingRecording === recording.id ? 'opacity-50' : ''
          } ${isPreviewing ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'} border-b border-[var(--border-color)]`}
          style={{
            marginLeft: depth > 0 ? `${depth * 16}px` : undefined,
            borderLeft: depth > 0 ? '2px solid var(--border-color)' : undefined,
            borderTop: isDropAbove ? '2px solid var(--accent-cyan)' : undefined,
            borderBottom: isDropBelow ? '2px solid var(--accent-cyan)' : undefined,
          }}
        >
          {/* Expand button for recordings with crops */}
          {hasCrops && (
            <button
              onClick={(e) => { e.stopPropagation(); toggleRecordingExpanded(recording.id) }}
              className="w-5 h-5 flex items-center justify-center rounded cursor-pointer bg-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/20 transition-all"
              title={isExpanded ? 'Collapse crops' : 'Show crops'}
            >
              <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                <Icons.ChevronRight size={10} />
              </span>
            </button>
          )}
          {recording.color && (
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: recording.color }} />
          )}
          {isCrop && (
            <span className="text-[var(--text-muted)]">
              <Icons.Scissors />
            </span>
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
              <div className="text-sm truncate text-[var(--text-primary)]">
                {recording.tabTitle || 'Untitled'}
              </div>
            )}
            <div className="text-[10px] text-[var(--text-muted)] mono flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Icons.Music />
              {recording.duration > 0 && <span>{formatTime(recording.duration)}</span>}
              <span className="opacity-50">•</span>
              <span>{formatDate(recording.timestamp)}</span>
              {recording.bpm && <span className="text-[var(--accent-cyan)]">{recording.bpm}</span>}
              {recording.key && <span className="text-[var(--accent-purple)]">{recording.key}</span>}
              {recording.rating && recording.rating > 0 && (
                <span className="text-[#facc15]">{'★'.repeat(recording.rating)}</span>
              )}
              {totalDescendants > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--accent-cyan)]">
                  {totalDescendants} crop{totalDescendants > 1 ? 's' : ''}
                </span>
              )}
              {(recording.tags || []).slice(0, 1).map(t => (
                <span key={t}>#{t}</span>
              ))}
            </div>
            {recording.notes && (
              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate max-w-[200px]" title={recording.notes}>
                {recording.notes.length > 40 ? recording.notes.slice(0, 40) + '...' : recording.notes}
              </div>
            )}
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPlayPreview(recording)
              }}
              className={`p-1.5 rounded-full cursor-pointer transition-all ${
                isPlaying
                  ? 'bg-[var(--accent-cyan)] text-[var(--bg-primary)]'
                  : 'bg-white/10 text-[var(--text-muted)] hover:text-[var(--accent-cyan)] hover:bg-white/20'
              }`}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Icons.Pause /> : <Icons.Play size={14} />}
            </button>
            {/* WaveSurfer waveform container */}
            <div
              id={`waveform-${recording.id}`}
              className={`w-20 h-6 ${isPlaying ? 'block' : 'hidden'}`}
            />
            <button
              onClick={(e) => {
                e.stopPropagation()
                setEditName(recording.tabTitle || '')
                setEditingRecording(recording.id)
              }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full cursor-pointer bg-white/10 text-[var(--text-muted)] hover:text-[var(--accent-cyan)] hover:bg-white/20 transition-all"
              title="Rename"
            >
              <Icons.Edit />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onConfirmDeleteRecording(recording.id, recording.tabTitle, totalDescendants) }}
              className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full cursor-pointer bg-white/10 text-[var(--text-muted)] hover:text-[var(--accent-red)] hover:bg-white/20 transition-all"
              title="Delete"
            >
              <Icons.Trash />
            </button>
          </div>
        </div>
        {/* Render crops nested under parent */}
        {hasCrops && isExpanded && crops.map(crop => renderRecording(crop, folderId, depth + 1))}
      </div>
    )
  }

  const renderFolder = (folder: Folder) => {
    // Hide empty folders when any filter is active
    if ((searchQuery || filterRating > 0 || filterSite) && getTotalRecordingsCount(folder.id) === 0) return null

    const isExpanded = expandedFolders.has(folder.id)
    const folderRecordings = getRecordingsForFolder(folder.id)
    const childFolders = folders
      .filter(f => f.parentId === folder.id)
      .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt))
    const isEditing = editingFolder === folder.id
    const isDragOver = dragOverFolder === folder.id
    const isEdgeAbove = dragOverFolderEdge?.id === folder.id && dragOverFolderEdge.position === 'above'
    const isEdgeBelow = dragOverFolderEdge?.id === folder.id && dragOverFolderEdge.position === 'below'

    return (
      <div key={folder.id}>
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStartFolder(e, folder.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOverFolder(e, folder.id)}
          onDragLeave={() => { setDragOverFolder(null); setDragOverFolderEdge(null) }}
          onDrop={(e) => handleDropOnFolder(e, folder.id)}
          className={`group flex items-center gap-3 px-3 py-2.5 mx-2 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-all ${
            isDragOver ? 'bg-[var(--accent-cyan-dim)] border border-[var(--accent-cyan)]' : ''
          } ${movingFolder === folder.id ? 'opacity-50' : ''}`}
          style={{
            borderTop: isEdgeAbove ? '2px solid var(--accent-cyan)' : undefined,
            borderBottom: isEdgeBelow ? '2px solid var(--accent-cyan)' : undefined,
          }}
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

          <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
            {getTotalRecordingsCount(folder.id)} items
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
            onClick={(e) => { e.stopPropagation(); onConfirmDeleteFolder(folder.id, folder.name, getTotalRecordingsCount(folder.id) + childFolders.length) }}
            className="opacity-0 group-hover:opacity-100 p-1 text-[var(--text-muted)] hover:text-[var(--accent-red)]"
          >
            <Icons.Trash />
          </button>
        </div>

        {isExpanded && (childFolders.length > 0 || folderRecordings.length > 0) && (
          <div className="ml-6 border-l border-[var(--border-color)]">
            {childFolders.map(renderFolder)}
            {folderRecordings.map(r => renderRecording(r, folder.id))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
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
            onDragOver={(e) => handleDragOverFolder(e, 'uncategorized')}
            onDragLeave={() => setDragOverFolder(null)}
            onDrop={(e) => handleDropOnFolder(e, 'uncategorized')}
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
              {uncategorizedRecordings.map(r => renderRecording(r, 'uncategorized'))}
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
      <div className="sticky bottom-0 z-10 px-4 py-2 border-t border-[var(--border-color)] text-[10px] text-[var(--text-muted)] flex items-center justify-between bg-[var(--bg-primary)]">
        <span>{recordings.length} recordings</span>
        <span>{formatSize(recordings.reduce((acc, r) => acc + r.size, 0))} total</span>
      </div>
    </div>
  )
}

// ============================================================================
// FOLDER SELECTION SCREEN
// ============================================================================

function FolderSelectionScreen({ onSelect }: { onSelect: () => void }) {
  const [isSelecting, setIsSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSelect = async () => {
    setIsSelecting(true)
    setError(null)
    try {
      const storage = getStorageService()
      const result = await storage.selectFolder()
      if (result.success) {
        onSelect()
      } else if (result.error.type !== 'NO_FOLDER_SELECTED') {
        setError('Failed to select folder. Please try again.')
      }
    } catch (e) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsSelecting(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="noise-overlay" />
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-[var(--bg-tertiary)] flex items-center justify-center mb-6 text-[var(--accent-cyan)]">
          <Icons.FolderOpen />
        </div>
        <h2 className="text-xl font-bold mb-3">Welcome to CucuBau-Sound</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-[280px]">
          Choose a folder where your recordings will be saved. All audio files and library data will be stored there.
        </p>
        <button
          onClick={handleSelect}
          disabled={isSelecting}
          className="btn bg-[var(--accent-cyan)] text-[var(--bg-primary)] hover:shadow-[var(--glow-cyan)] px-6 py-3 text-sm font-semibold"
        >
          {isSelecting ? 'Selecting...' : 'Choose Folder'}
        </button>
        {error && (
          <p className="mt-4 text-xs text-[var(--accent-red)]">{error}</p>
        )}
        <p className="mt-8 text-[10px] text-[var(--text-muted)] max-w-[260px]">
          Your recordings are stored locally on your computer. No data is sent to any server.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// PERMISSION REQUEST SCREEN
// ============================================================================

function PermissionScreen({ onGranted, folderName }: { onGranted: () => void; folderName: string | null }) {
  const [isRequesting, setIsRequesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRequest = async () => {
    setIsRequesting(true)
    setError(null)
    try {
      const storage = getStorageService()
      const result = await storage.requestPermission()
      if (result.success) {
        onGranted()
      } else {
        setError('Permission denied. Please try again.')
      }
    } catch (e) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsRequesting(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="noise-overlay" />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <button
          onClick={handleRequest}
          disabled={isRequesting}
          className="w-16 h-16 rounded-xl bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] flex items-center justify-center mb-4 text-[var(--accent-cyan)] transition-all cursor-pointer border-2 border-transparent hover:border-[var(--accent-cyan)]"
        >
          {isRequesting ? (
            <div className="w-6 h-6 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
          ) : (
            <Icons.FolderOpen />
          )}
        </button>
        <h2 className="text-base font-semibold mb-2">
          {isRequesting ? 'Opening...' : 'Click to continue'}
        </h2>
        <p className="text-xs text-[var(--text-muted)] mb-1">
          Folder: <span className="text-[var(--accent-cyan)]">{folderName || 'your folder'}</span>
        </p>
        {error && (
          <p className="mt-2 text-xs text-[var(--accent-red)]">{error}</p>
        )}
        <p className="mt-4 text-[10px] text-[var(--text-muted)] max-w-[200px]">
          Browser requires re-confirmation after restart
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// MIGRATION SCREEN
// ============================================================================

function MigrationScreen({ progress, message }: { progress: number; message: string }) {
  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="noise-overlay" />
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-[var(--accent-cyan)]/20 flex items-center justify-center mb-6 text-[var(--accent-cyan)]">
          <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-3">Migrating Data</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-[280px]">
          {message || 'Moving your recordings to the new storage system...'}
        </p>
        <div className="w-64 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent-cyan)] transition-all duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">{Math.round(progress * 100)}%</p>
      </div>
    </div>
  )
}

// ============================================================================
// LOADING SCREEN
// ============================================================================

function LoadingScreen() {
  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="noise-overlay" />
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="w-1 h-10 bg-[var(--accent-cyan)] rounded-full animate-pulse"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--text-muted)]">Loading...</p>
      </div>
    </div>
  )
}

// ============================================================================
// APP WRAPPER WITH INITIALIZATION
// ============================================================================

export default function App() {
  const [appState, setAppState] = useState<'loading' | 'needsFolder' | 'needsPermission' | 'migrating' | 'ready'>('loading')
  const [migrationProgress, setMigrationProgress] = useState(0)
  const [migrationMessage, setMigrationMessage] = useState('')
  const [folderName, setFolderName] = useState<string | null>(null)

  useEffect(() => {
    const initStorage = async () => {
      const storage = getStorageService()
      const result = await storage.initialize()

      if (result.success) {
        // Check if migration is needed
        const needsMigration = await MigrationService.needsMigration()
        if (needsMigration) {
          setAppState('migrating')
          const migrationResult = await MigrationService.migrate(
            storage,
            (message, current, total) => {
              setMigrationMessage(message)
              setMigrationProgress(current / total)
            }
          )
          if (!migrationResult.success) {
            console.error('Migration failed:', migrationResult.error)
          }
        }
        setAppState('ready')
      } else {
        const error = result.error as StorageError
        if (error.type === 'NO_FOLDER_SELECTED') {
          setAppState('needsFolder')
        } else if (error.type === 'PERMISSION_PROMPT_NEEDED' || error.type === 'PERMISSION_DENIED') {
          // Get folder name to show in permission screen
          const name = await storage.getFolderName()
          setFolderName(name)
          setAppState('needsPermission')
        } else {
          console.error('Storage initialization failed:', error)
          setAppState('needsFolder')
        }
      }
    }

    initStorage()
  }, [])

  const handleFolderSelected = async () => {
    // Check if migration is needed after folder selection
    const storage = getStorageService()
    const needsMigration = await MigrationService.needsMigration()
    if (needsMigration) {
      setAppState('migrating')
      await MigrationService.migrate(
        storage,
        (message, current, total) => {
          setMigrationMessage(message)
          setMigrationProgress(current / total)
        }
      )
    }
    setAppState('ready')
  }

  const handlePermissionGranted = () => {
    setAppState('ready')
  }

  switch (appState) {
    case 'loading':
      return <LoadingScreen />
    case 'needsFolder':
      return <FolderSelectionScreen onSelect={handleFolderSelected} />
    case 'needsPermission':
      // Show MainApp but pass needsPermission flag - permission will be requested on user action
      return <MainApp needsStoragePermission onPermissionGranted={handlePermissionGranted} />
    case 'migrating':
      return <MigrationScreen progress={migrationProgress} message={migrationMessage} />
    case 'ready':
      return <MainApp />
  }
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================

interface PendingRecording {
  blob: Blob
  duration: number
  timestamp: number
  defaultTitle: string
  tabUrl: string
  hostname: string
  filename: string
}

interface MainAppProps {
  needsStoragePermission?: boolean
  onPermissionGranted?: () => void
}

function MainApp({ needsStoragePermission = false, onPermissionGranted }: MainAppProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [tabTitle, setTabTitle] = useState('')
  const [folders, setFolders] = useState<Folder[]>([])
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'record' | 'library' | 'player'>('record')
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null)
  const [cameFromRecordingId, setCameFromRecordingId] = useState<string | null>(null) // Track if we came from a crop action
  const [searchQuery, setSearchQuery] = useState('')
  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['uncategorized']))
  const [pendingRecording, setPendingRecording] = useState<PendingRecording | null>(null)
  const [pendingTitle, setPendingTitle] = useState('')
  const [renameConflict, setRenameConflict] = useState<{ recordingId: string; folderId: string; currentName: string } | null>(null)
  const [renameConflictName, setRenameConflictName] = useState('')
  const [isMovingFile, setIsMovingFile] = useState(false)
  const [isRequestingPermission, setIsRequestingPermission] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'recording' | 'folder'; id: string; name: string; childCount: number } | null>(null)
  const [deleteChildren, setDeleteChildren] = useState(true)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const previewWaveSurferRef = useRef<WaveSurfer | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const previewLoadingRef = useRef<string | null>(null) // Track which recording is being loaded
  const elapsedRef = useRef<number>(0)
  const recordingTabRef = useRef<{ title: string; url: string; hostname: string }>({ title: '', url: '', hostname: '' })
  const [recordingFrequencyData, setRecordingFrequencyData] = useState<number[]>([])

  // Request storage permission and then perform action
  const requestStoragePermissionAndDo = useCallback(async (action: () => void) => {
    if (!needsStoragePermission) {
      action()
      return
    }
    setIsRequestingPermission(true)
    try {
      const storage = getStorageService()
      const result = await storage.requestPermission()
      if (result.success) {
        onPermissionGranted?.()
        // Small delay to let state update
        setTimeout(() => {
          action()
          setIsRequestingPermission(false)
        }, 100)
      } else {
        setError('Permission denied. Please try again.')
        setIsRequestingPermission(false)
      }
    } catch (e) {
      setError('Failed to get permission.')
      setIsRequestingPermission(false)
    }
  }, [needsStoragePermission, onPermissionGranted])

  const loadLibrary = useCallback(async () => {
    const storage = getStorageService()
    const storageFolders = storage.getFolders()
    const storageRecordings = storage.getRecordings()
    setFolders(storageFolders)
    const migratedRecs = storageRecordings.map(r => ({ ...r, folderId: r.folderId || 'uncategorized' }))
    setRecordings(migratedRecs.sort((a, b) => b.timestamp - a.timestamp))
    // Restore expanded folders state from chrome.storage (UI state only)
    const result = await chrome.storage.local.get(['expandedFolders'])
    if (result.expandedFolders) {
      setExpandedFolders(new Set(result.expandedFolders as string[]))
    }
  }, [])

  useEffect(() => {
    // Don't load library if we need storage permission first
    if (needsStoragePermission) return

    loadLibrary()
    const listener = (message: { type: string }): void => {
      if (message.type === 'RECORDING_SAVED') loadLibrary()
    }
    const onMessage = chrome.runtime.onMessage as unknown as {
      addListener: (callback: (message: { type: string }) => void) => void
      removeListener: (callback: (message: { type: string }) => void) => void
    }
    onMessage.addListener(listener)
    return () => onMessage.removeListener(listener)
  }, [loadLibrary, needsStoragePermission])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // Cleanup preview audio helper
  const cleanupPreviewAudio = useCallback(() => {
    if (previewWaveSurferRef.current) {
      previewWaveSurferRef.current.destroy()
      previewWaveSurferRef.current = null
    }
    previewLoadingRef.current = null
  }, [])

  // Cleanup preview audio on unmount
  useEffect(() => {
    return () => {
      cleanupPreviewAudio()
    }
  }, [cleanupPreviewAudio])

  // Preview on hover
  const handlePreviewRecording = (recording: Recording | null) => {
    // Just highlight, no audio preview on hover
    setPreviewingId(recording?.id || null)
  }

  // Play/stop preview audio using WaveSurfer
  const handlePlayPreview = useCallback(async (recording: Recording) => {
    const recordingId = recording.id

    // If already playing this recording, stop it
    if (playingPreviewId === recordingId) {
      cleanupPreviewAudio()
      setPlayingPreviewId(null)
      return
    }

    // If already loading this recording, ignore
    if (previewLoadingRef.current === recordingId) {
      return
    }

    // Cleanup any previous audio
    cleanupPreviewAudio()
    setPlayingPreviewId(null)

    // Mark as loading
    previewLoadingRef.current = recordingId

    // Get or create container for this recording's waveform
    const container = document.getElementById(`waveform-${recordingId}`)
    if (!container) {
      previewLoadingRef.current = null
      return
    }

    // Load and play the new recording
    try {
      const storage = getStorageService()
      const result = await storage.getRecordingBlob(recordingId)

      // Check if user clicked something else while loading
      if (previewLoadingRef.current !== recordingId) {
        return
      }

      if (result.success) {
        const url = URL.createObjectURL(result.data)

        // Create WaveSurfer instance
        const ws = WaveSurfer.create({
          container,
          waveColor: '#00d4ff',
          progressColor: '#00ff88',
          cursorColor: 'transparent',
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
          height: 24,
          normalize: true,
        })

        previewWaveSurferRef.current = ws

        ws.on('finish', () => {
          cleanupPreviewAudio()
          setPlayingPreviewId(null)
        })

        ws.on('ready', () => {
          if (previewLoadingRef.current === recordingId) {
            setPlayingPreviewId(recordingId)
            ws.play()
          }
        })

        ws.load(url)
      } else {
        previewLoadingRef.current = null
      }
    } catch (e) {
      console.error('Failed to play preview:', e)
      cleanupPreviewAudio()
      setPlayingPreviewId(null)
    }
  }, [playingPreviewId, cleanupPreviewAudio])

  // Folder operations
  const createFolder = async (name: string, parentId: string | null) => {
    const storage = getStorageService()
    const color = FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
    const result = await storage.createFolder(name, parentId, color)
    if (result.success) {
      setFolders(storage.getFolders())
    }
  }

  const renameFolder = async (id: string, name: string) => {
    const storage = getStorageService()
    const result = await storage.renameFolder(id, name)
    if (result.success) {
      setFolders(storage.getFolders())
    }
  }

  const deleteFolder = async (id: string, alsoDeleteChildren = false) => {
    const storage = getStorageService()
    const result = await storage.deleteFolder(id, alsoDeleteChildren)
    if (result.success) {
      setFolders(result.data.folders)
      setRecordings(result.data.recordings.sort((a, b) => b.timestamp - a.timestamp))
    }
  }

  const moveRecording = async (recordingId: string, folderId: string) => {
    setIsMovingFile(true)
    try {
      const storage = getStorageService()
      const result = await storage.moveRecording(recordingId, folderId)
      if (result.success) {
        setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
      } else if (!result.success && result.error.type === 'NAME_CONFLICT') {
        // Show rename modal
        const rec = recordings.find(r => r.id === recordingId)
        if (rec) {
          setRenameConflict({ recordingId, folderId, currentName: rec.tabTitle })
          setRenameConflictName(rec.tabTitle)
        }
      }
    } finally {
      setIsMovingFile(false)
    }
  }

  const handleRenameAndMove = async () => {
    if (!renameConflict || !renameConflictName.trim()) return

    setIsMovingFile(true)
    try {
      const storage = getStorageService()
      const newName = renameConflictName.trim()

      const result = await storage.moveRecordingWithRename(
        renameConflict.recordingId,
        renameConflict.folderId,
        newName
      )

      if (result.success) {
        setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
        setRenameConflict(null)
        setRenameConflictName('')
      }
      // If still NAME_CONFLICT, modal stays open
    } finally {
      setIsMovingFile(false)
    }
  }

  const cancelRenameConflict = () => {
    setRenameConflict(null)
    setRenameConflictName('')
  }

  const moveFolder = async (folderId: string, newParentId: string | null) => {
    const storage = getStorageService()
    const result = await storage.moveFolder(folderId, newParentId)
    if (result.success) {
      setFolders(storage.getFolders())
    }
  }

  const reorderFolder = async (folderId: string, targetId: string, position: 'above' | 'below') => {
    const storage = getStorageService()
    const currentFolders = storage.getFolders()
    const targetFolder = currentFolders.find(f => f.id === targetId)
    if (!targetFolder) return
    // Reorder among siblings (same parentId)
    const parentId = targetFolder.parentId
    const siblings = currentFolders
      .filter(f => f.parentId === parentId)
      .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt))

    const without = siblings.filter(f => f.id !== folderId)
    const targetIndex = without.findIndex(f => f.id === targetId)
    const insertIndex = position === 'above' ? targetIndex : targetIndex + 1

    const dragged = currentFolders.find(f => f.id === folderId)
    if (!dragged) return
    without.splice(insertIndex, 0, { ...dragged, parentId })

    // Assign sortOrder 0, 1, 2, ...
    const reordered = without.map((f, i) => ({ ...f, sortOrder: i }))

    // Merge back into full folders list
    const updated = currentFolders.map(f => {
      const found = reordered.find(ff => ff.id === f.id)
      return found || f
    })
    await storage.updateFolders(updated)
    setFolders(storage.getFolders())
  }

  const reorderRecording = async (recordingId: string, targetId: string, position: 'above' | 'below', folderId: string) => {
    const storage = getStorageService()
    const currentRecordings = storage.getRecordings()

    const draggedRec = currentRecordings.find(r => r.id === recordingId)
    const targetRec = currentRecordings.find(r => r.id === targetId)
    if (!draggedRec || !targetRec) return

    // Determine the group to reorder within based on target
    let siblingRecordings: Recording[]
    let newParentId: string | undefined = undefined
    let newFolderId: string = folderId

    if (targetRec.parentId) {
      // Target is a crop - reorder within same parent's crops
      siblingRecordings = currentRecordings
        .filter(r => r.parentId === targetRec.parentId)
        .sort((a, b) => (a.sortOrder ?? a.timestamp) - (b.sortOrder ?? b.timestamp))
      newParentId = targetRec.parentId
      newFolderId = targetRec.folderId // Inherit folder from target
    } else {
      // Target is a root recording - reorder within folder's root recordings
      siblingRecordings = currentRecordings
        .filter(r => r.folderId === folderId && !r.parentId)
        .sort((a, b) => (a.sortOrder ?? a.timestamp) - (b.sortOrder ?? b.timestamp))
      newParentId = undefined
      newFolderId = folderId
    }

    // Find target position
    const targetIndex = siblingRecordings.findIndex(r => r.id === targetId)
    if (targetIndex === -1) return // Target not found in group

    // Remove dragged recording from siblings if it's there
    const without = siblingRecordings.filter(r => r.id !== recordingId)

    // Recalculate insert position after removal
    const newTargetIndex = without.findIndex(r => r.id === targetId)
    const insertIndex = position === 'above' ? newTargetIndex : newTargetIndex + 1

    // Insert dragged recording at new position
    without.splice(insertIndex, 0, draggedRec)

    // Assign sortOrder 0, 1, 2, ... and update dragged recording's parentId/folderId
    const reordered = without.map((r, i) => {
      const updated: Recording = { ...r, sortOrder: i }
      // Only change parentId and folderId for the dragged recording
      if (r.id === recordingId) {
        updated.folderId = newFolderId
        if (newParentId !== undefined) {
          updated.parentId = newParentId
        } else {
          delete updated.parentId
        }
      }
      return updated
    })

    // Merge back into full recordings list
    const updated = currentRecordings.map(r => {
      const found = reordered.find(rr => rr.id === r.id)
      return found || r
    })
    await storage.updateRecordings(updated)
    setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
  }

  const deleteRecording = async (id: string, alsoDeleteChildren = true) => {
    const storage = getStorageService()

    if (!alsoDeleteChildren) {
      // Move crops to become independent recordings (remove parentId)
      const allRecordings = storage.getRecordings()
      const recording = allRecordings.find(r => r.id === id)
      const crops = allRecordings.filter(r => r.parentId === id)
      for (const crop of crops) {
        await storage.updateRecording({ ...crop, parentId: undefined })
      }
    }

    const result = await storage.deleteRecording(id, alsoDeleteChildren)
    if (result.success) {
      setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
    }
    if (selectedRecording?.id === id) setSelectedRecording(null)
  }

  const renameRecording = async (id: string, title: string) => {
    const storage = getStorageService()
    const rec = storage.getRecordings().find(r => r.id === id)
    if (rec) {
      // Extract the unique ID and time from existing filename (format: safeTitle_HH-MM-SS_uniqueId.wav)
      const parts = rec.filename.replace('.wav', '').split('_')
      const uniqueId = parts[parts.length - 1] // Last part is unique ID
      const timeStr = parts[parts.length - 2] // Second to last is time

      // Create new safe title
      const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
      const newFilename = `${safeTitle}_${timeStr}_${uniqueId}.wav`

      // Rename file on disk and update library
      await storage.renameRecording(id, newFilename)
      // Also update the display title in library
      const updatedRec = storage.getRecordings().find(r => r.id === id)
      if (updatedRec) {
        await storage.updateRecording({ ...updatedRec, tabTitle: title })
      }
      setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
    }
  }

  const updateRecording = async (recording: Recording) => {
    const storage = getStorageService()
    await storage.updateRecording(recording)
    setRecordings(storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp))
    if (selectedRecording?.id === recording.id) setSelectedRecording(recording)
  }

  const refreshRecordings = () => {
    const storage = getStorageService()
    const updated = storage.getRecordings().sort((a, b) => b.timestamp - a.timestamp)
    setRecordings(updated)
    return updated
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

    // Request storage permission first if needed (so save works after recording)
    if (needsStoragePermission) {
      setIsRequestingPermission(true)
      try {
        const storage = getStorageService()
        const permResult = await storage.requestPermission()
        if (permResult.success) {
          onPermissionGranted?.()
        } else {
          setError('Storage permission denied')
          setIsRequestingPermission(false)
          return
        }
      } catch (e) {
        setError('Failed to get storage permission')
        setIsRequestingPermission(false)
        return
      }
      setIsRequestingPermission(false)
    }

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

      // Create analyser for real-time frequency visualization
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 64 // 32 frequency bins
      analyser.smoothingTimeConstant = 0.4 // Fast response
      analyserRef.current = analyser

      source.connect(analyser)
      analyser.connect(audioContext.destination)

      // Start frequency animation loop
      const updateFrequency = () => {
        if (!analyserRef.current) return
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        // Take 16 bars spread across the spectrum
        const bars: number[] = []
        for (let i = 0; i < 16; i++) {
          const index = Math.floor(i * dataArray.length / 16)
          bars.push(dataArray[index] / 255)
        }
        setRecordingFrequencyData(bars)
        animationFrameRef.current = requestAnimationFrame(updateFrequency)
      }
      updateFrequency()

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
        const timeStr = `${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`
        const safeTitle = savedTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
        const uniqueId = crypto.randomUUID().slice(0, 8)
        const wavFilename = `${safeTitle}_${timeStr}_${uniqueId}.wav`

        // Format: "SiteName - Page Title"
        const siteName = getSiteName(hostname)
        const formattedTitle = `${siteName} - ${savedTitle}`

        // Convert to WAV
        const convertContext = new AudioContext()
        const arrayBuffer = await blob.arrayBuffer()
        const audioBuffer = await convertContext.decodeAudioData(arrayBuffer)
        const wavBlob = audioBufferToWav(audioBuffer)
        convertContext.close()

        // Set pending recording - show modal for title edit
        setPendingRecording({
          blob: wavBlob,
          duration,
          timestamp,
          defaultTitle: formattedTitle,
          tabUrl: savedUrl,
          hostname,
          filename: wavFilename
        })
        setPendingTitle(formattedTitle)

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

  const stopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null }
    analyserRef.current = null
    setRecordingFrequencyData([])
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    setIsRecording(false)
    setElapsed(0)
    elapsedRef.current = 0
    startTimeRef.current = null
    chrome.runtime.sendMessage({ type: 'SET_RECORDING_STATE', state: { isRecording: false, startTime: null, tabId: null, tabTitle: '' } })

    // Pause all video/audio elements in the tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // Pause all video and audio elements
            document.querySelectorAll('video, audio').forEach((el) => {
              (el as HTMLMediaElement).pause()
            })
          }
        })
      }
    } catch (e) {
      // Ignore errors (e.g., restricted pages)
    }
  }

  const toggleRecording = () => { isRecording ? stopRecording() : startRecording() }

  const savePendingRecording = async () => {
    if (!pendingRecording) return

    // If we need storage permission, request it first
    if (needsStoragePermission) {
      setIsRequestingPermission(true)
      try {
        const storage = getStorageService()
        const permResult = await storage.requestPermission()
        if (permResult.success) {
          onPermissionGranted?.()
        } else {
          setError('Permission denied. Please try again.')
          setIsRequestingPermission(false)
          return
        }
      } catch (e) {
        setError('Failed to get permission.')
        setIsRequestingPermission(false)
        return
      }
      setIsRequestingPermission(false)
    }

    const storage = getStorageService()
    const existingRecordings = storage.getRecordings()
    const uniqueTitle = getUniqueTitle(pendingTitle.trim() || pendingRecording.defaultTitle, existingRecordings)

    const recording: Recording = {
      id: crypto.randomUUID(),
      filename: pendingRecording.filename,
      duration: pendingRecording.duration,
      timestamp: pendingRecording.timestamp,
      tabTitle: uniqueTitle,
      tabUrl: pendingRecording.tabUrl,
      hostname: pendingRecording.hostname,
      size: pendingRecording.blob.size,
      folderId: 'uncategorized'
    }

    const saveResult = await storage.saveRecording(recording, pendingRecording.blob)
    if (saveResult.success) {
      loadLibrary()
      // Open player to show the new recording
      setSelectedRecording(recording)
      setActiveTab('player')
      window.scrollTo(0, 0)
    } else {
      console.error('Failed to save recording:', JSON.stringify(saveResult.error))
      const errorMsg = saveResult.error.type === 'PERMISSION_DENIED'
        ? 'Permission denied. Please grant folder access in Settings.'
        : saveResult.error.type === 'WRITE_FAILED'
        ? `Write failed: ${saveResult.error.reason}`
        : `Failed to save: ${saveResult.error.type}`
      setError(errorMsg)
    }

    setPendingRecording(null)
    setPendingTitle('')
  }

  const cancelPendingRecording = () => {
    setPendingRecording(null)
    setPendingTitle('')
  }

  const handleSelectRecording = (recording: Recording) => {
    // Stop any playing preview
    cleanupPreviewAudio()
    setPlayingPreviewId(null)

    setSelectedRecording(recording)
    setCameFromRecordingId(null) // Coming from library, not from crop
    setActiveTab('player')
    // Scroll to top when opening player
    window.scrollTo(0, 0)
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
        <div className="flex items-center gap-2">
          {isRecording && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--accent-red-dim)]">
              <span className="w-1.5 h-1.5 bg-[var(--accent-red)] rounded-full animate-pulse" />
              <span className="text-[10px] font-semibold text-[var(--accent-red)] mono">{formatTime(elapsed)}</span>
            </div>
          )}
          {/* Open Library button - commented out for now
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('library.html') })}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Open Library in new tab"
          >
            <Icons.ExternalLink />
          </button>
          */}
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') })}
            className="px-2 py-1 rounded-lg text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Settings
          </button>
        </div>
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
            onClick={() => {
              if (needsStoragePermission) {
                requestStoragePermissionAndDo(() => setActiveTab('library'))
              } else {
                setActiveTab('library')
              }
            }}
            disabled={isRequestingPermission}
            className={`flex-1 py-3 text-sm font-medium transition-all relative ${activeTab === 'library' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
          >
            {isRequestingPermission ? 'Opening...' : 'Library'}
            {!isRequestingPermission && <span className="ml-1.5 badge bg-[var(--bg-tertiary)] text-[var(--text-muted)]">{recordings.length}</span>}
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
          frequencyData={recordingFrequencyData}
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
          onMoveFolder={moveFolder}
          onReorderFolder={reorderFolder}
          onReorderRecording={reorderRecording}
          onDeleteRecording={deleteRecording}
          onConfirmDeleteRecording={(id, name, childCount) => { setDeleteConfirm({ type: 'recording', id, name, childCount }); setDeleteChildren(true) }}
          onConfirmDeleteFolder={(id, name, childCount) => { setDeleteConfirm({ type: 'folder', id, name, childCount }); setDeleteChildren(false) }}
          onRenameRecording={renameRecording}
          onOpenDownloads={openDownloads}
          onSelectRecording={handleSelectRecording}
          onPreviewRecording={handlePreviewRecording}
          previewingId={previewingId}
          playingPreviewId={playingPreviewId}
          onPlayPreview={handlePlayPreview}
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
        />
      )}
      {activeTab === 'player' && selectedRecording && (
        <AudioPlayer
          recording={selectedRecording}
          recordings={recordings}
          onClose={handleClosePlayer}
          onDelete={() => { deleteRecording(selectedRecording.id); handleClosePlayer() }}
          onUpdate={updateRecording}
          onSelectRecording={handleSelectRecording}
          onSelectRecordingFromCrop={(rec, parentId) => {
            setSelectedRecording(rec)
            setCameFromRecordingId(parentId)
            window.scrollTo(0, 0)
          }}
          onRefreshRecordings={refreshRecordings}
          cameFromRecordingId={cameFromRecordingId}
        />
      )}

      {/* Save Recording Modal */}
      {pendingRecording && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-4 w-full max-w-sm border border-[var(--border-color)] shadow-2xl">
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Save Recording</h3>
            <input
              type="text"
              value={pendingTitle}
              onChange={(e) => setPendingTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') savePendingRecording() }}
              placeholder="Recording title..."
              autoFocus
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={cancelPendingRecording}
                className="flex-1 px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={savePendingRecording}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[var(--accent-cyan)] hover:bg-[var(--accent-cyan-hover)] rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Conflict Modal */}
      {renameConflict && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-4 w-full max-w-sm border border-[var(--border-color)] shadow-2xl">
            <h3 className="text-sm font-semibold mb-2 text-[var(--text-primary)]">Name Conflict</h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              A recording with this name already exists in the destination folder. Please choose a different name.
            </p>
            <input
              type="text"
              value={renameConflictName}
              onChange={(e) => setRenameConflictName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameAndMove() }}
              placeholder="New name..."
              autoFocus
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-cyan)] mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={cancelRenameConflict}
                disabled={isMovingFile}
                className="flex-1 px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameAndMove}
                disabled={isMovingFile}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-[var(--accent-cyan)] hover:bg-[var(--accent-cyan-hover)] rounded-lg transition-colors disabled:opacity-50"
              >
                {isMovingFile ? 'Moving...' : 'Rename & Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Moving File Loader */}
      {isMovingFile && !renameConflict && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-6 border border-[var(--border-color)] shadow-2xl flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--accent-cyan)] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[var(--text-primary)]">Moving file...</span>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--bg-secondary)] rounded-xl p-4 w-full max-w-sm border border-[var(--border-color)] shadow-2xl">
            <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">
              Delete {deleteConfirm.type === 'folder' ? 'Folder' : 'Recording'}?
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              Are you sure you want to delete "<span className="text-[var(--text-primary)]">{deleteConfirm.name}</span>"?
            </p>
            {deleteConfirm.childCount > 0 && (
              <label className="flex items-center gap-2 mb-4 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={deleteChildren}
                  onChange={(e) => setDeleteChildren(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--bg-tertiary)] checked:bg-[var(--accent-red)] cursor-pointer"
                />
                <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]">
                  {deleteConfirm.type === 'recording'
                    ? `Also delete ${deleteConfirm.childCount} crop${deleteConfirm.childCount > 1 ? 's' : ''}`
                    : `Also delete ${deleteConfirm.childCount} item${deleteConfirm.childCount > 1 ? 's' : ''} inside`
                  }
                </span>
              </label>
            )}
            {deleteConfirm.childCount > 0 && !deleteChildren && (
              <p className="text-xs text-[var(--text-muted)] mb-4 italic">
                {deleteConfirm.type === 'recording'
                  ? 'Crops will become independent recordings'
                  : 'Items will be moved to the parent folder'
                }
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === 'recording') {
                    deleteRecording(deleteConfirm.id, deleteChildren)
                  } else {
                    deleteFolder(deleteConfirm.id, deleteChildren)
                  }
                  setDeleteConfirm(null)
                }}
                className="flex-1 py-2 px-3 rounded-lg text-xs font-medium bg-[var(--accent-red)] text-white hover:brightness-110 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export interface Recording {
  id: string
  filename: string
  duration: number
  timestamp: number
  tabTitle: string
  tabUrl: string
  hostname: string // e.g. "youtube.com", "instagram.com"
  size: number
  folderId: string
  // New fields for producers
  bpm?: number
  rating?: number // 0-5 stars
  tags?: string[]
  color?: string
  notes?: string
  trimStart?: number // seconds
  trimEnd?: number // seconds
  isLooped?: boolean
  key?: string // musical key like "Am", "C#"
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  color: string
  createdAt: number
}

export interface LibraryData {
  folders: Folder[]
  recordings: Recording[]
}

export interface RecordingState {
  isRecording: boolean
  startTime: number | null
  tabId: number | null
  tabTitle: string
}

export type MessageType =
  | { type: 'START_RECORDING'; tabId: number; tabTitle: string }
  | { type: 'STOP_RECORDING' }
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATE'; state: RecordingState }
  | { type: 'RECORDING_SAVED'; recording: Recording }
  | { type: 'SAVE_RECORDING'; recording: Recording }
  | { type: 'ERROR'; message: string }

// Predefined tags for music production
export const PRESET_TAGS = [
  'drums', 'bass', 'melody', 'vocal', 'fx', 'synth',
  'guitar', 'piano', 'strings', 'brass', 'pad', 'lead',
  'loop', 'oneshot', 'ambient', 'percussion', 'sample'
]

// Color options for recordings
export const RECORDING_COLORS = [
  { name: 'none', value: '' },
  { name: 'red', value: '#ff3b5c' },
  { name: 'orange', value: '#ff9500' },
  { name: 'yellow', value: '#facc15' },
  { name: 'green', value: '#00ff88' },
  { name: 'cyan', value: '#00d4ff' },
  { name: 'blue', value: '#3b82f6' },
  { name: 'purple', value: '#a855f7' },
  { name: 'pink', value: '#ec4899' },
]

// Musical keys
export const MUSICAL_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'
]

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Seeded pseudo-random for reproducible audio
function seededRandom(seed: number) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
}

// Note frequency helper
function noteFreq(note: number): number { return 440 * Math.pow(2, (note - 69) / 12) }

// ADSR envelope
function adsr(t: number, a: number, d: number, s: number, r: number, dur: number): number {
  if (t < a) return t / a
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d)
  if (t < dur - r) return s
  if (t < dur) return s * (1 - (t - (dur - r)) / r)
  return 0
}

type AudioStyle = 'melody' | 'drums' | 'bass' | 'ambient' | 'vocal' | 'fx'

function generateDemoAudio(durationSec: number, seed: number, style: AudioStyle = 'melody'): Blob {
  const sampleRate = 44100
  const numSamples = sampleRate * durationSec
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  const rand = seededRandom(seed)
  const PI2 = 2 * Math.PI

  // Scales (MIDI note numbers)
  const minorScale = [0, 2, 3, 5, 7, 8, 10] // natural minor intervals
  const baseNote = 57 + Math.floor(rand() * 7) // A3-D#4 range

  if (style === 'melody') {
    // Generate a sequence of notes with rhythm
    const bpm = 100 + Math.floor(rand() * 60)
    const beatDur = 60 / bpm
    const notes: { start: number; dur: number; freq: number; vel: number }[] = []
    let t = 0
    while (t < durationSec) {
      const durChoices = [beatDur * 0.5, beatDur, beatDur * 1.5, beatDur * 2]
      const dur = durChoices[Math.floor(rand() * durChoices.length)]
      const scaleIdx = Math.floor(rand() * 7)
      const octave = Math.floor(rand() * 2)
      const midi = baseNote + minorScale[scaleIdx] + octave * 12
      const vel = 0.3 + rand() * 0.4
      if (rand() > 0.15) notes.push({ start: t, dur: dur * 0.9, freq: noteFreq(midi), vel })
      t += dur
    }
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      let val = 0
      for (const n of notes) {
        if (t >= n.start && t < n.start + n.dur) {
          const lt = t - n.start
          const env = adsr(lt, 0.01, 0.1, 0.6, 0.05, n.dur)
          // Saw-ish wave with filtering feel
          const phase = (lt * n.freq) % 1
          const saw = 2 * phase - 1
          const tri = 4 * Math.abs(phase - 0.5) - 1
          val += (saw * 0.4 + tri * 0.6) * env * n.vel
        }
      }
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 30000)), true)
    }
  } else if (style === 'drums') {
    // Drum pattern: kick, snare, hihat
    const bpm = 130 + Math.floor(rand() * 30)
    const stepDur = 60 / bpm / 4 // 16th notes
    const steps = Math.ceil(durationSec / stepDur)
    const pattern: { type: 'kick' | 'snare' | 'hat'; time: number }[] = []
    for (let s = 0; s < steps; s++) {
      const time = s * stepDur
      const beat = s % 16
      if (beat === 0 || beat === 8 || (beat === 6 && rand() > 0.5)) pattern.push({ type: 'kick', time })
      if (beat === 4 || beat === 12) pattern.push({ type: 'snare', time })
      if (rand() > 0.3) pattern.push({ type: 'hat', time })
    }
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      let val = 0
      for (const hit of pattern) {
        const dt = t - hit.time
        if (dt < 0 || dt > 0.3) continue
        if (hit.type === 'kick') {
          const freq = 150 * Math.exp(-dt * 30) + 40
          val += Math.sin(PI2 * freq * dt) * Math.exp(-dt * 12) * 0.7
        } else if (hit.type === 'snare') {
          val += (rand() * 2 - 1) * Math.exp(-dt * 20) * 0.4
          val += Math.sin(PI2 * 200 * dt) * Math.exp(-dt * 30) * 0.3
        } else {
          val += (rand() * 2 - 1) * Math.exp(-dt * 60) * 0.2
        }
      }
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 30000)), true)
    }
  } else if (style === 'bass') {
    // Deep bass pattern
    const bpm = 120 + Math.floor(rand() * 30)
    const beatDur = 60 / bpm
    const bassNotes = [baseNote - 12, baseNote - 12 + 7, baseNote - 12 + 5, baseNote - 12 + 3]
    const notes: { start: number; dur: number; freq: number }[] = []
    let t = 0; let ni = 0
    while (t < durationSec) {
      const dur = rand() > 0.3 ? beatDur : beatDur * 0.5
      const freq = noteFreq(bassNotes[ni % bassNotes.length])
      if (rand() > 0.1) notes.push({ start: t, dur: dur * 0.8, freq })
      t += dur; ni++
    }
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      let val = 0
      for (const n of notes) {
        if (t >= n.start && t < n.start + n.dur) {
          const lt = t - n.start
          const env = adsr(lt, 0.005, 0.05, 0.7, 0.02, n.dur)
          // Sub bass with slight distortion
          const phase = (lt * n.freq) % 1
          let s = Math.sin(PI2 * phase)
          s = Math.tanh(s * 2) // soft clip
          val += s * env * 0.6
        }
      }
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 30000)), true)
    }
  } else if (style === 'ambient') {
    // Layered pads with slow modulation
    const padFreqs = [noteFreq(baseNote), noteFreq(baseNote + 7), noteFreq(baseNote + 12), noteFreq(baseNote + 3)]
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      let val = 0
      const globalEnv = Math.min(t / 2, 1) * Math.min((durationSec - t) / 2, 1)
      for (let p = 0; p < padFreqs.length; p++) {
        const f = padFreqs[p] * (1 + 0.002 * Math.sin(PI2 * 0.1 * (p + 1) * t))
        val += Math.sin(PI2 * f * t) * 0.15
        val += Math.sin(PI2 * f * 2.01 * t) * 0.05 // slight detune
      }
      // Add filtered noise texture
      val += (rand() * 2 - 1) * 0.02
      val *= globalEnv
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 30000)), true)
    }
  } else if (style === 'vocal') {
    // Formant-like synthesis
    const formants = [
      { f: 800, bw: 80, amp: 1 },
      { f: 1200, bw: 90, amp: 0.6 },
      { f: 2500, bw: 120, amp: 0.3 },
    ]
    const vibRate = 5 + rand() * 2
    const vibDepth = 0.01 + rand() * 0.01
    const pitch = noteFreq(baseNote + 12)
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      const env = Math.min(t / 0.3, 1) * Math.min((durationSec - t) / 0.5, 1)
      const vib = 1 + vibDepth * Math.sin(PI2 * vibRate * t)
      const f0 = pitch * vib
      // Glottal pulse approximation
      const phase = (t * f0) % 1
      const glottal = Math.pow(Math.sin(Math.PI * phase), 2) * 2 - 1
      let val = 0
      for (const fm of formants) {
        val += glottal * fm.amp * Math.exp(-Math.pow((f0 - fm.f) / fm.bw, 2))
      }
      val = val * 0.3 + glottal * 0.15
      val *= env * 0.5
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 30000)), true)
    }
  } else {
    // FX: sweep + noise burst
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      const progress = t / durationSec
      let val = 0
      // Rising sweep
      const sweepFreq = 100 * Math.pow(40, progress)
      val += Math.sin(PI2 * sweepFreq * t) * 0.3 * (0.5 + 0.5 * progress)
      // Noise bursts at random intervals
      const burstPhase = (t * 3.7) % 1
      if (burstPhase < 0.1) val += (rand() * 2 - 1) * 0.3 * Math.exp(-burstPhase * 40)
      // Sub rumble
      val += Math.sin(PI2 * 30 * t + Math.sin(PI2 * 0.5 * t) * 4) * 0.15
      const env = Math.min(t / 0.1, 1) * Math.min((durationSec - t) / 0.2, 1)
      val *= env
      view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, val * 30000)), true)
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

// Mock Chrome APIs for dev mode
if (typeof chrome === 'undefined' || !chrome.storage) {
  const now = Date.now()

  const folders = [
    { id: 'f1', name: 'Beats', parentId: null, color: '#00ff88', createdAt: now - 86400000 * 5, sortOrder: 0 },
    { id: 'f2', name: 'Vocals', parentId: null, color: '#ff3b5c', createdAt: now - 86400000 * 4, sortOrder: 1 },
    { id: 'f3', name: 'FX & Ambient', parentId: null, color: '#00d4ff', createdAt: now - 86400000 * 3, sortOrder: 2 },
    { id: 'f4', name: 'Samples', parentId: null, color: '#ff9500', createdAt: now - 86400000 * 2, sortOrder: 3 },
    // Nested folders
    { id: 'f1a', name: 'Trap', parentId: 'f1', color: '#a855f7', createdAt: now - 86400000 * 4.5, sortOrder: 0 },
    { id: 'f1b', name: 'Lo-Fi', parentId: 'f1', color: '#ec4899', createdAt: now - 86400000 * 4.3, sortOrder: 1 },
    { id: 'f1a1', name: 'Hard Trap', parentId: 'f1a', color: '#facc15', createdAt: now - 86400000 * 4.2, sortOrder: 0 },
    { id: 'f2a', name: 'Adlibs', parentId: 'f2', color: '#64748b', createdAt: now - 86400000 * 3.5, sortOrder: 0 },
  ]

  const recordings = [
    // Beats > Trap > Hard Trap
    { id: 'r1', filename: 'rec/hard-808.webm', tabTitle: 'Hard 808 Pattern', hostname: 'youtube.com', duration: 32, timestamp: now - 3600000 * 2, size: 512000, folderId: 'f1a1', rating: 5, bpm: 145, tags: ['drums', 'bass'], color: '#ff3b5c', key: 'Fm', notes: 'Crazy 808 slide', sortOrder: 0 },
    { id: 'r2', filename: 'rec/trap-hihats.webm', tabTitle: 'Trap Hi-Hats Roll', hostname: 'youtube.com', duration: 18, timestamp: now - 3600000 * 3, size: 288000, folderId: 'f1a1', rating: 4, bpm: 145, tags: ['drums', 'percussion'], color: '', key: '', sortOrder: 1 },
    // Beats > Trap
    { id: 'r3', filename: 'rec/dark-melody.webm', tabTitle: 'Dark Piano Melody', hostname: 'soundcloud.com', duration: 45, timestamp: now - 3600000 * 5, size: 720000, folderId: 'f1a', rating: 5, bpm: 140, tags: ['melody', 'piano'], color: '#a855f7', key: 'C#m', notes: 'Use for intro', sortOrder: 0 },
    { id: 'r4', filename: 'rec/808-bounce.webm', tabTitle: '808 Bounce Loop', hostname: 'youtube.com', duration: 24, timestamp: now - 3600000 * 6, size: 384000, folderId: 'f1a', rating: 3, bpm: 138, tags: ['bass', 'loop'], color: '', key: 'E', sortOrder: 1 },
    // Beats > Lo-Fi
    { id: 'r5', filename: 'rec/lofi-guitar.webm', tabTitle: 'Lo-Fi Guitar Chops', hostname: 'soundcloud.com', duration: 67, timestamp: now - 3600000 * 8, size: 1072000, folderId: 'f1b', rating: 4, bpm: 85, tags: ['guitar', 'loop', 'sample'], color: '#ec4899', key: 'Am', sortOrder: 0 },
    { id: 'r6', filename: 'rec/vinyl-crackle.webm', tabTitle: 'Vinyl Crackle Texture', hostname: 'archive.org', duration: 120, timestamp: now - 3600000 * 10, size: 1920000, folderId: 'f1b', rating: 3, bpm: 0, tags: ['ambient', 'fx'], color: '', key: '', notes: 'Layer under everything', sortOrder: 1 },
    // Beats (root)
    { id: 'r7', filename: 'rec/drumbreak.webm', tabTitle: 'Classic Drum Break', hostname: 'youtube.com', duration: 8, timestamp: now - 3600000 * 12, size: 128000, folderId: 'f1', rating: 5, bpm: 95, tags: ['drums', 'oneshot'], color: '#00ff88', key: '', sortOrder: 0 },
    // Vocals
    { id: 'r8', filename: 'rec/vocal-chop-1.webm', tabTitle: 'Female Vocal Chop', hostname: 'splice.com', duration: 4, timestamp: now - 3600000 * 14, size: 64000, folderId: 'f2', rating: 4, tags: ['vocal', 'oneshot'], color: '#ff3b5c', key: 'G', sortOrder: 0 },
    { id: 'r9', filename: 'rec/chorus-hook.webm', tabTitle: 'Chorus Hook Idea', hostname: 'youtube.com', duration: 22, timestamp: now - 3600000 * 16, size: 352000, folderId: 'f2', rating: 5, tags: ['vocal', 'melody'], color: '#facc15', key: 'Dm', notes: 'Amazing vibe, use on track 3', sortOrder: 1 },
    // Vocals > Adlibs
    { id: 'r10', filename: 'rec/adlib-yeah.webm', tabTitle: 'Yeah! Adlib', hostname: 'youtube.com', duration: 2, timestamp: now - 3600000 * 18, size: 32000, folderId: 'f2a', rating: 3, tags: ['vocal', 'oneshot'], color: '', key: '', sortOrder: 0 },
    { id: 'r11', filename: 'rec/adlib-woah.webm', tabTitle: 'Woah Adlib', hostname: 'instagram.com', duration: 1, timestamp: now - 3600000 * 19, size: 16000, folderId: 'f2a', rating: 2, tags: ['vocal', 'oneshot'], color: '', key: '', sortOrder: 1 },
    // FX & Ambient
    { id: 'r12', filename: 'rec/rain-texture.webm', tabTitle: 'Rain Ambient Texture', hostname: 'freesound.org', duration: 180, timestamp: now - 3600000 * 20, size: 2880000, folderId: 'f3', rating: 4, tags: ['ambient', 'fx'], color: '#00d4ff', key: '', notes: 'Perfect for intros/outros', sortOrder: 0 },
    { id: 'r13', filename: 'rec/riser-fx.webm', tabTitle: 'Cinematic Riser', hostname: 'youtube.com', duration: 6, timestamp: now - 3600000 * 22, size: 96000, folderId: 'f3', rating: 3, bpm: 0, tags: ['fx', 'synth'], color: '#3b82f6', key: '', sortOrder: 1 },
    { id: 'r14', filename: 'rec/tape-stop.webm', tabTitle: 'Tape Stop Effect', hostname: 'splice.com', duration: 3, timestamp: now - 3600000 * 23, size: 48000, folderId: 'f3', rating: 4, tags: ['fx', 'oneshot'], color: '', key: '', sortOrder: 2 },
    // Samples
    { id: 'r15', filename: 'rec/jazz-piano.webm', tabTitle: 'Jazz Piano Progression', hostname: 'youtube.com', duration: 35, timestamp: now - 3600000 * 25, size: 560000, folderId: 'f4', rating: 5, bpm: 110, tags: ['piano', 'sample', 'loop'], color: '#ff9500', key: 'Bb', notes: 'Chop the 2nd bar', sortOrder: 0 },
    { id: 'r16', filename: 'rec/funk-bass.webm', tabTitle: 'Funk Bassline', hostname: 'youtube.com', duration: 16, timestamp: now - 3600000 * 27, size: 256000, folderId: 'f4', rating: 4, bpm: 105, tags: ['bass', 'loop', 'sample'], color: '', key: 'E', sortOrder: 1 },
    { id: 'r17', filename: 'rec/strings-swell.webm', tabTitle: 'Strings Swell', hostname: 'soundcloud.com', duration: 12, timestamp: now - 3600000 * 28, size: 192000, folderId: 'f4', rating: 3, tags: ['strings', 'pad'], color: '#a855f7', key: 'C', sortOrder: 2 },
    // Uncategorized
    { id: 'r18', filename: 'rec/random-idea.webm', tabTitle: 'Random Melody Idea', hostname: 'youtube.com', duration: 28, timestamp: now - 3600000 * 1, size: 448000, folderId: 'uncategorized', rating: 2, bpm: 120, tags: ['melody'], color: '', key: 'Am', sortOrder: 0 },
    { id: 'r19', filename: 'rec/kick-test.webm', tabTitle: 'Kick Drum Test', hostname: 'splice.com', duration: 1, timestamp: now - 3600000 * 0.5, size: 16000, folderId: 'uncategorized', rating: 0, tags: ['drums', 'oneshot'], color: '', key: '', sortOrder: 1 },
    { id: 'r20', filename: 'rec/podcast-clip.webm', tabTitle: 'Interview Snippet', hostname: 'spotify.com', duration: 55, timestamp: now - 3600000 * 30, size: 880000, folderId: 'uncategorized', rating: 1, tags: [], color: '#64748b', key: '', notes: 'Check at 0:30', sortOrder: 2 },
  ]

  const mockStorage: Record<string, unknown> = {
    recordings,
    folders,
    expandedFolders: ['uncategorized', 'f1', 'f1a', 'f2'],
  }

  // @ts-ignore
  window.chrome = {
    storage: {
      local: {
        get: (keys: string | string[] | null) => Promise.resolve(
          keys ? (Array.isArray(keys) ? Object.fromEntries(keys.map(k => [k, mockStorage[k]])) : { [keys]: mockStorage[keys] }) : mockStorage
        ),
        set: (data: Record<string, unknown>) => { Object.assign(mockStorage, data); return Promise.resolve() },
      }
    },
    runtime: {
      onMessage: { addListener: () => {}, removeListener: () => {} },
      sendMessage: () => {},
    },
    tabs: { query: () => Promise.resolve([{ id: 1, title: 'Test Tab', url: 'https://youtube.com/watch?v=123' }]) },
    downloads: { showDefaultFolder: () => {}, download: () => Promise.resolve(), search: () => Promise.resolve([]), show: () => {}, erase: () => {}, onChanged: { addListener: () => {}, removeListener: () => {} } },
    tabCapture: { capture: () => {} },
  }

  // Store generated demo audio blobs in memory for dev mode playback
  const styleMap: Record<string, AudioStyle> = {
    r1: 'drums', r2: 'drums', r3: 'melody', r4: 'bass', r5: 'melody',
    r6: 'ambient', r7: 'drums', r8: 'vocal', r9: 'vocal', r10: 'vocal',
    r11: 'vocal', r12: 'ambient', r13: 'fx', r14: 'fx', r15: 'melody',
    r16: 'bass', r17: 'ambient', r18: 'melody', r19: 'drums', r20: 'vocal',
  }
  const devAudioCache: Record<string, Blob> = {}
  recordings.forEach((r, i) => {
    devAudioCache[r.id] = generateDemoAudio(Math.min(r.duration, 10), i * 7 + 42, styleMap[r.id] || 'melody')
  })
  // Expose for dev mode audio playback
  ;(window as any).__devAudioCache = devAudioCache
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

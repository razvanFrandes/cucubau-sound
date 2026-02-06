// Audio processing utilities for music production

/**
 * Detect BPM from audio buffer using peak detection
 */
export async function detectBPM(audioBuffer: AudioBuffer): Promise<number> {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate

  // Low-pass filter to focus on bass/kick
  const filteredData = lowPassFilter(channelData, sampleRate, 150)

  // Find peaks (potential beats)
  const peaks = findPeaks(filteredData, sampleRate)

  if (peaks.length < 2) return 0

  // Calculate intervals between peaks
  const intervals: number[] = []
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1])
  }

  // Find most common interval (mode)
  const intervalCounts = new Map<number, number>()
  const tolerance = Math.floor(sampleRate * 0.02) // 20ms tolerance

  for (const interval of intervals) {
    const rounded = Math.round(interval / tolerance) * tolerance
    intervalCounts.set(rounded, (intervalCounts.get(rounded) || 0) + 1)
  }

  let maxCount = 0
  let mostCommonInterval = 0

  intervalCounts.forEach((count, interval) => {
    if (count > maxCount) {
      maxCount = count
      mostCommonInterval = interval
    }
  })

  if (mostCommonInterval === 0) return 0

  // Convert interval to BPM
  const bpm = (60 * sampleRate) / mostCommonInterval

  // Normalize to reasonable BPM range (60-180)
  let normalizedBpm = bpm
  while (normalizedBpm > 180) normalizedBpm /= 2
  while (normalizedBpm < 60) normalizedBpm *= 2

  return Math.round(normalizedBpm)
}

/**
 * Simple low-pass filter
 */
function lowPassFilter(data: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const rc = 1.0 / (cutoff * 2 * Math.PI)
  const dt = 1.0 / sampleRate
  const alpha = dt / (rc + dt)

  const filtered = new Float32Array(data.length)
  filtered[0] = data[0]

  for (let i = 1; i < data.length; i++) {
    filtered[i] = filtered[i - 1] + alpha * (data[i] - filtered[i - 1])
  }

  return filtered
}

/**
 * Find peaks in audio data
 */
function findPeaks(data: Float32Array, sampleRate: number): number[] {
  const peaks: number[] = []
  const minPeakDistance = Math.floor(sampleRate * 0.2) // minimum 200ms between peaks

  // Calculate threshold as percentage of max amplitude
  let maxAmplitude = 0
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i])
    if (abs > maxAmplitude) maxAmplitude = abs
  }
  const threshold = maxAmplitude * 0.5

  let lastPeak = -minPeakDistance

  for (let i = 1; i < data.length - 1; i++) {
    if (
      data[i] > threshold &&
      data[i] > data[i - 1] &&
      data[i] > data[i + 1] &&
      i - lastPeak >= minPeakDistance
    ) {
      peaks.push(i)
      lastPeak = i
    }
  }

  return peaks
}

/**
 * Normalize audio to target peak level
 */
export function normalizeAudio(audioBuffer: AudioBuffer, targetPeak = 0.95): AudioBuffer {
  const ctx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  )

  // Find current peak
  let maxPeak = 0
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i])
      if (abs > maxPeak) maxPeak = abs
    }
  }

  if (maxPeak === 0) return audioBuffer

  const gain = targetPeak / maxPeak

  // Create new buffer with normalized audio
  const normalizedBuffer = ctx.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = normalizedBuffer.getChannelData(channel)
    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[i] * gain
    }
  }

  return normalizedBuffer
}

/**
 * Trim audio buffer
 */
export function trimAudio(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const length = endSample - startSample

  const ctx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    length,
    sampleRate
  )

  const trimmedBuffer = ctx.createBuffer(
    audioBuffer.numberOfChannels,
    length,
    sampleRate
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = trimmedBuffer.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      outputData[i] = inputData[startSample + i] || 0
    }
  }

  return trimmedBuffer
}

/**
 * Convert AudioBuffer to WAV Blob
 */
export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample

  const dataLength = buffer.length * blockAlign
  const bufferLength = 44 + dataLength

  const arrayBuffer = new ArrayBuffer(bufferLength)
  const view = new DataView(arrayBuffer)

  // WAV header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  // Interleave channels and write samples
  const channels: Float32Array[] = []
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, intSample, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

/**
 * Convert AudioBuffer to MP3 using lamejs (if available) or fallback to WAV
 * Note: For MP3, you'd need to add lamejs library. For now, we export as WAV.
 */
export async function exportAudio(
  audioBuffer: AudioBuffer,
  format: 'wav' | 'mp3' = 'wav'
): Promise<Blob> {
  if (format === 'wav') {
    return audioBufferToWav(audioBuffer)
  }

  // For MP3, fallback to WAV for now
  // To add MP3 support, install lamejs: pnpm add lamejs
  console.warn('MP3 export not implemented, falling back to WAV')
  return audioBufferToWav(audioBuffer)
}

/**
 * Get audio buffer from blob
 */
export async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioContext = new AudioContext()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
  audioContext.close()
  return audioBuffer
}

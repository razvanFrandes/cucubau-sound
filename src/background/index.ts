import type { Recording, RecordingState } from '../types'

let recordingState: RecordingState = {
  isRecording: false,
  startTime: null,
  tabId: null,
  tabTitle: ''
}

async function getRecordings(): Promise<Recording[]> {
  const result = await chrome.storage.local.get('recordings')
  return result.recordings || []
}

async function saveRecording(recording: Recording) {
  const recordings = await getRecordings()
  // Ensure folderId exists
  const recordingWithFolder = {
    ...recording,
    folderId: recording.folderId || 'uncategorized'
  }
  recordings.push(recordingWithFolder)
  await chrome.storage.local.set({ recordings })
}

function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    state: recordingState
  }).catch(() => {})
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_RECORDING_STATE') {
    recordingState = message.state
    broadcastState()
    sendResponse({ success: true })
  } else if (message.type === 'GET_STATE') {
    sendResponse({ state: recordingState })
  } else if (message.type === 'SAVE_RECORDING') {
    saveRecording(message.recording).then(() => {
      chrome.runtime.sendMessage({
        type: 'RECORDING_SAVED',
        recording: message.recording
      }).catch(() => {})
      sendResponse({ success: true })
    })
    return true
  } else if (message.type === 'DOWNLOAD_FILE') {
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      saveAs: false
    }).then((downloadId) => {
      sendResponse({ success: true, downloadId })
    }).catch((error) => {
      sendResponse({ success: false, error: error.message })
    })
    return true
  }
  return true
})

// Restore state on startup
chrome.storage.local.get('recordingState').then((result) => {
  if (result.recordingState?.isRecording) {
    chrome.storage.local.remove('recordingState')
  }
})

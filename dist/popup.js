const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const libraryBtn = document.getElementById('libraryBtn');
const status = document.getElementById('status');

let isRecording = false;

// Check current state on popup open
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (response) => {
  if (response?.state?.isRecording) {
    showRecordingUI();
  }
});

recordBtn.addEventListener('click', async () => {
  recordBtn.disabled = true;
  status.textContent = 'Starting...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      status.textContent = 'No active tab';
      recordBtn.disabled = false;
      return;
    }

    // Get stream ID - this works from popup because of activeTab
    const streamId = await new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!id) {
          reject(new Error('Failed to get stream ID'));
        } else {
          resolve(id);
        }
      });
    });

    // Send to background to start recording via offscreen
    const response = await chrome.runtime.sendMessage({
      type: 'START_RECORDING_WITH_STREAM',
      streamId,
      tabId: tab.id,
      tabTitle: tab.title || 'Unknown',
      tabUrl: tab.url || ''
    });

    if (response?.success) {
      showRecordingUI();
    } else {
      status.textContent = response?.error || 'Failed to start';
      recordBtn.disabled = false;
    }
  } catch (err) {
    console.error('Recording error:', err);
    status.textContent = err.message || 'Error starting recording';
    recordBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  status.textContent = 'Stopping...';

  const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

  showIdleUI();
  status.textContent = response?.success ? 'Saved!' : 'Error saving';
  setTimeout(() => { status.textContent = ''; }, 2000);
});

libraryBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }
});

function showRecordingUI() {
  isRecording = true;
  recordBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  stopBtn.disabled = false;
  status.textContent = 'Recording...';
  status.classList.add('recording');
}

function showIdleUI() {
  isRecording = false;
  recordBtn.classList.remove('hidden');
  recordBtn.disabled = false;
  stopBtn.classList.add('hidden');
  status.classList.remove('recording');
}

// Listen for state updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    if (message.state.isRecording) {
      showRecordingUI();
    } else {
      showIdleUI();
    }
  }
});

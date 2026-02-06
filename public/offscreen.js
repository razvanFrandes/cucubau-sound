let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;
let recordingInfo = {
  startTime: null,
  tabTitle: '',
  tabUrl: '',
  hostname: '',
  tabId: null
};

async function startRecording(streamId, tabId, tabTitle, tabUrl) {
  try {
    // Use tabCapture stream ID
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      }
    });

    audioChunks = [];

    let hostname = '';
    try {
      hostname = new URL(tabUrl || '').hostname.replace(/^www\./, '');
    } catch {
      hostname = 'unknown';
    }

    recordingInfo = {
      startTime: Date.now(),
      tabTitle: tabTitle || 'Unknown',
      tabUrl: tabUrl || '',
      hostname,
      tabId
    };

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(1000);
    return { success: true };
  } catch (error) {
    console.error('Offscreen recording error:', error);
    return { success: false, error: error.message };
  }
}

async function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve({ success: false, error: 'No active recording' });
      return;
    }

    mediaRecorder.onstop = async () => {
      const mimeType = mediaRecorder.mimeType;
      const blob = new Blob(audioChunks, { type: mimeType });
      const duration = Math.floor((Date.now() - recordingInfo.startTime) / 1000);
      const timestamp = Date.now();

      // Convert webm to base64 to send via message
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = reader.result;

        // Send data back to background/side panel
        chrome.runtime.sendMessage({
          type: 'OFFSCREEN_RECORDING_DATA',
          data: {
            base64: base64Data,
            mimeType,
            duration,
            timestamp,
            tabTitle: recordingInfo.tabTitle,
            tabUrl: recordingInfo.tabUrl,
            hostname: recordingInfo.hostname,
            size: blob.size
          }
        });

        // Clean up
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
          mediaStream = null;
        }
        audioChunks = [];
        mediaRecorder = null;

        resolve({ success: true });
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.stop();
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_START') {
    startRecording(message.streamId, message.tabId, message.tabTitle, message.tabUrl)
      .then(sendResponse);
    return true;
  } else if (message.type === 'OFFSCREEN_STOP') {
    stopRecording().then(sendResponse);
    return true;
  }
});

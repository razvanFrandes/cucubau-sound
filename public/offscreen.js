let mediaRecorder = null;
let audioChunks = [];
let mediaStream = null;
let recordingInfo = {
  startTime: null,
  tabTitle: '',
  tabId: null
};

async function startRecording(streamId, tabId, tabTitle) {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    audioChunks = [];
    recordingInfo = {
      startTime: Date.now(),
      tabTitle,
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

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mimeType });
      const duration = Math.floor((Date.now() - recordingInfo.startTime) / 1000);

      const timestamp = Date.now();
      const dateStr = new Date(timestamp).toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const safeTitle = recordingInfo.tabTitle
        .replace(/[^a-zA-Z0-9]/g, '_')
        .slice(0, 30);
      const filename = `recording_${dateStr}_${safeTitle}.webm`;

      // Convert blob to base64 for download
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];

        // Download the file
        await chrome.downloads.download({
          url: `data:audio/webm;base64,${base64}`,
          filename: filename,
          saveAs: false
        });

        const recording = {
          id: crypto.randomUUID(),
          filename,
          duration,
          timestamp,
          tabTitle: recordingInfo.tabTitle,
          tabUrl: '',
          size: blob.size
        };

        // Send recording info back to service worker
        chrome.runtime.sendMessage({
          type: 'OFFSCREEN_STATE_UPDATE',
          stopped: true,
          recording
        });
      };
      reader.readAsDataURL(blob);

      // Clean up
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
      }
      audioChunks = [];
    };

    mediaRecorder.start(1000); // Collect data every second
    return { success: true };
  } catch (error) {
    console.error('Offscreen recording error:', error);
    return { success: false, error: error.message };
  }
}

function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve({ success: false, error: 'No active recording' });
      return;
    }

    const originalOnStop = mediaRecorder.onstop;
    mediaRecorder.onstop = async (event) => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      const duration = Math.floor((Date.now() - recordingInfo.startTime) / 1000);

      const timestamp = Date.now();
      const dateStr = new Date(timestamp).toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const safeTitle = recordingInfo.tabTitle
        .replace(/[^a-zA-Z0-9]/g, '_')
        .slice(0, 30);
      const filename = `recording_${dateStr}_${safeTitle}.webm`;

      // Convert blob to base64 for download
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result.split(',')[1];

        // Download the file
        await chrome.downloads.download({
          url: `data:audio/webm;base64,${base64}`,
          filename: filename,
          saveAs: false
        });

        const recording = {
          id: crypto.randomUUID(),
          filename,
          duration,
          timestamp,
          tabTitle: recordingInfo.tabTitle,
          tabUrl: '',
          size: blob.size
        };

        // Clean up
        if (mediaStream) {
          mediaStream.getTracks().forEach(track => track.stop());
          mediaStream = null;
        }
        audioChunks = [];
        mediaRecorder = null;

        resolve({ success: true, recording });
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.stop();
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_START') {
    startRecording(message.streamId, message.tabId, message.tabTitle)
      .then(sendResponse);
    return true;
  } else if (message.type === 'OFFSCREEN_STOP') {
    stopRecording().then(sendResponse);
    return true;
  }
});

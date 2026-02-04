import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Mock Chrome APIs for dev mode
if (typeof chrome === 'undefined' || !chrome.storage) {
  const mockStorage: Record<string, unknown> = {
    recordings: [
      { id: '1', tabTitle: 'YouTube - Test Song', hostname: 'youtube.com', duration: 45, timestamp: Date.now() - 3600000, size: 1024000, folderId: 'uncategorized', rating: 4 },
      { id: '2', tabTitle: 'SoundCloud - Beat', hostname: 'soundcloud.com', duration: 120, timestamp: Date.now() - 7200000, size: 2048000, folderId: 'uncategorized', rating: 3, bpm: 140 },
    ],
    folders: [],
    expandedFolders: ['uncategorized'],
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
    downloads: { showDefaultFolder: () => {}, download: () => Promise.resolve(), search: () => Promise.resolve([]), show: () => {} },
    tabCapture: { capture: () => {} },
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

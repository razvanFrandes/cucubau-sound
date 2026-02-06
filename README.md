# CucuBau-Sound

A free Chrome extension for capturing audio from any browser tab. Built for music producers, beatmakers, and sample collectors who want to quickly grab sounds from YouTube, SoundCloud, Spotify, or any website and organize them into a personal sound library.

No servers. No analytics. No tracking. No accounts. Everything runs locally in your browser. Your recordings are saved as WAV files directly to a folder you choose on your computer. Made with love for music.

<img src="images/Record.png" width="500">

---

## Features

### Recording
- **One-click tab audio capture** — Press `R` or click the mic button to start recording the current tab's audio
- **Live waveform visualization** — Real-time frequency display (Winamp-style) while recording
- **Live timer** — See elapsed recording time with animated waveform indicator
- **Automatic metadata** — Saves the tab title, website hostname, date, and file size with each recording
- **WAV format** — All recordings are saved as high-quality WAV files

### Storage & File System
- **Choose your folder** — On first launch, select any folder on your computer to store recordings
- **Real files on disk** — Recordings are saved as actual `.wav` files you can access in Finder/Explorer
- **Folder structure synced** — App folders mirror real folders on your disk
- **Library metadata** — A `cucubau-library.json` file stores all metadata (ratings, tags, notes, etc.)
- **Rename synced** — Renaming a recording in the app renames the file on disk too
- **No browser storage limits** — Files are saved to your chosen folder, not browser storage

### Library & Organization
- **Folder tree** — Create nested folders to organize your samples (e.g., Beats > Trap > Hard Trap)
- **Drag & drop** — Move recordings between folders, reorder recordings within folders, drag folders into other folders or reorder them
- **Color-coded folders** — Assign colors to folders for quick visual identification
- **Search** — Filter recordings by name across your entire library
- **Filter by site** — Quick-filter chips for YouTube, SoundCloud, Splice, Instagram, etc.
- **Star ratings** — Rate recordings 1-5 stars and filter by minimum rating
- **Smart empty-folder hiding** — Folders with no matching recordings auto-hide when filters are active

<img src="images/Library.png" width="500">

### Audio Player
- **Waveform display** — Full waveform visualization powered by WaveSurfer.js
- **Minimap** — Overview minimap below the main waveform for quick navigation
- **Zoom & pan** — Scroll to zoom in/out, drag to pan across the waveform
- **Loop playback** — Toggle loop mode for any recording
- **Keyboard shortcuts** — `Space` play/pause, `Arrow keys` seek, `L` loop, `Scroll` zoom
- **BPM detection** — Auto-detect the tempo of any recording
- **Volume normalization** — Normalize audio levels with one click
- **Export WAV** — Export any recording as a WAV file with automatic file reveal in Finder/Explorer

<img src="images/Player.png" width="500">

### Crop Tool
- **Visual crop region** — Drag handles to select the portion you want to keep
- **Precise trimming** — See exact start time, end time, and duration of your selection
- **Loop preview** — Preview your crop selection with loop playback before applying
- **Save as new** — Crops are saved as separate recordings linked to the original
- **Delete options** — Choose to delete crops with parent or keep them when deleting

<img src="images/PlayerCrop.png" width="500">

### Metadata & Tagging
- **Tags** — Add preset tags (drums, bass, melody, vocal, fx, synth, guitar, piano, etc.) or create custom tags
- **Musical key** — Assign a musical key (C, C#m, Dm, etc.) to each recording
- **Color labels** — Color-code individual recordings (9 color options)
- **Notes** — Add freeform notes to any recording
- **BPM** — Store the tempo alongside each recording

---

## Installation

1. **Download** — Click the green **Code** button above, then **Download ZIP**, and unzip the folder
2. **Open Chrome extensions** — Type `chrome://extensions/` in your address bar and press Enter
3. **Enable Developer mode** — Toggle the switch in the top-right corner
4. **Load the extension** — Click **Load unpacked** and select the `dist` folder from the unzipped download
5. **Done** — The CucuBau-Sound icon appears in your Chrome toolbar. Click it to open.

---

## First Launch Setup

1. Click the **CucuBau-Sound** icon in your toolbar
2. You'll be prompted to **select a folder** where recordings will be saved
3. Choose or create a folder (e.g., `~/Music/CucuBau` or `Documents/Samples`)
4. Grant permission when prompted — this allows the extension to save files to your folder
5. Done! All your recordings will be saved as WAV files in this folder

**Note:** After restarting Chrome, you may need to click "Grant Access" to re-authorize folder access. This is a browser security feature.

---

## How to Use

1. Go to any website with audio (YouTube, SoundCloud, Spotify, etc.)
2. Click the **CucuBau-Sound** icon in your toolbar
3. Press **R** or click the microphone button to start recording
4. Click again to stop — enter a name and the recording is saved as a WAV file
5. Switch to the **Library** tab to browse, organize, and play back your recordings

### File Structure

Your chosen folder will look like this:
```
~/Music/CucuBau/
├── cucubau-library.json     (metadata: ratings, tags, notes, etc.)
├── Beats/                   (folder you created in the app)
│   ├── Trap/
│   │   └── hard_beat_12-30-45_a1b2c3d4.wav
│   └── Lo-Fi/
│       └── chill_loop_14-20-10_e5f6g7h8.wav
├── Vocals/
│   └── hook_sample_09-15-30_i9j0k1l2.wav
└── youtube_song_11-45-22_m3n4o5p6.wav   (uncategorized = root folder)
```

---

## Privacy

This extension is 100% local:

- No server, no backend, no cloud
- No analytics, no tracking, no telemetry
- No account required
- All recordings are saved as files on YOUR computer in a folder YOU choose
- Metadata is stored in a local JSON file in your folder
- The only network permission is for capturing audio from browser tabs

---

## Tech Stack

- **React** + **TypeScript** — UI components
- **Tailwind CSS** — Styling
- **Vite** — Build tool
- **WaveSurfer.js** — Audio waveform visualization
- **Web Audio API** — Real-time frequency analysis
- **File System Access API** — Direct file system read/write

---

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

The `dist/` folder contains the built extension ready to load in Chrome.

---

## License

MIT — Free and open source, forever.

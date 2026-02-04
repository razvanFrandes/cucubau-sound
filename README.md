# CucuBau-Sound 🔴

A Chrome extension for recording audio from browser tabs. Perfect for music producers who want to capture samples from YouTube, SoundCloud, or any website.

## Features

- **Record tab audio** - Capture audio from any browser tab
- **Library management** - Organize recordings into folders
- **Audio player** - Built-in waveform player with seek, zoom, loop
- **BPM detection** - Auto-detect tempo of recordings
- **Star ratings** - Rate your recordings 1-5 stars
- **Tags** - Add tags like drums, bass, melody, etc.
- **Filter & search** - Filter by site, rating, or search by name
- **Export WAV** - Export recordings as WAV files
- **Normalize audio** - Volume normalization

## Installation

### From source

1. Clone the repository:
```bash
git clone https://github.com/yourusername/cucubau-sound.git
cd cucubau-sound
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the extension:
```bash
pnpm build
```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## Development

```bash
# Install dependencies
pnpm install

# Build for production
pnpm build

# Development mode (watch)
pnpm dev
```

## Tech Stack

- React 19
- TypeScript
- Tailwind CSS v4
- Vite
- WaveSurfer.js
- Chrome Extensions API (Manifest V3)

## Screenshots

*Coming soon*

## License

MIT

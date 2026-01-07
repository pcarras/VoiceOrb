# Orb - Voice-Reactive AI Transcription Assistant

A minimalist desktop voice-to-text transcription tool with a stunning 3D visualizer.

---

## Features

- **Hold-to-Talk**: Hold trigger key → record → release → transcribe → auto-paste
- **5 Visual Presets**: Deep Void (default), Classic Siri, Toxic Sludge, Geometric Low-Poly, Rusty Machine
- **Voice-Reactive 3D**: Real-time audio visualization using Three.js
- **Customizable Shortcuts**: Configure 1-2 key combinations for activation
- **Auto-Paste**: Transcribed text automatically pasted to active window
- **Draggable Orb**: Position anywhere on screen
- **Always-on-Top**: Stays visible but click-through when inactive

---

## Quick Start

```bash
npm install
npm start
```

**Right-click** the orb to open Settings.

---

## Configuration

Settings saved to `whisper4u.ini`:

| Setting | Description | Default |
|---------|-------------|---------|
| `orb_scale` | Visual size (0.2-1.0) | 0.4 |
| `orb_opacity` | Transparency (0.1-1.0) | 1.0 |
| `preset` | Visual style (0-4) | 0 (Deep Void) |
| `shortcut` | Trigger keys (array) | [3640] (AltGr) |
| `api_keys.groq` | Groq API key | — |

---

## Tech Stack

- **Electron** - Desktop framework
- **Three.js** - 3D rendering
- **uiohook-napi** - Global keyboard hooks
- **groq-sdk** - Whisper transcription (whisper-large-v3-turbo)

---

## Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process |
| `voice_orb.html` | 3D visualizer renderer |
| `settings.html/js` | Settings UI |
| `whisper4u.ini` | User configuration |
| `icon.png` | Application icon |

---

## License

MIT
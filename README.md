# GearCodeAI — AI for Robotics

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC.svg)](https://code.visualstudio.com/)
[![ROS 2](https://img.shields.io/badge/ROS%202-Ready-22314E.svg)](https://docs.ros.org/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA-NIM-76B900.svg)](https://build.nvidia.com/)

> AI-powered coding assistant for **ROS 2**, embedded C++, and drone development.
> Phase 1 MVP — VS Code Extension

<!-- TODO: Add a screenshot or GIF of the extension here -->
<!-- ![GearCodeAI](docs/screenshot.png) -->

---

## What it does

| Feature | How to trigger |
|---------|---------------|
| **Ask AI about selected code** | Highlight → `Ctrl+M` (or `Cmd+M` on Mac) |
| **Auto-detect build errors** | Just run `colcon build` — GearCodeAI watches the terminal |
| **Fix build error with AI** | Click the status bar item or run `GearCodeAI: Fix Last Build Error` |
| **Open AI chat panel** | Command Palette → `GearCodeAI: Open AI Chat` |
| **Show workspace context** | Command Palette → `GearCodeAI: Show Workspace Context` |

---

## Setup

### 1. Get a free NVIDIA NIM API key

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign up / log in → click **Get API Key**
3. Copy the key (starts with `nvapi-`)

### 2. Set your key in VS Code

Open **Settings** → search `gearcodeai.nimApiKey` → paste your key.

Or via the command palette:

```
Preferences: Open User Settings (JSON)
```

Add:

```json
"gearcodeai.nimApiKey": "nvapi-your-key-here"
```

### 3. Open your ROS 2 workspace

Open the folder that contains your `src/` and (optionally) `colcon.meta`.
GearCodeAI will auto-detect your packages on startup and inject them as context into every AI query.

---

## How it knows your project

On activation, GearCodeAI scans for:

- `package.xml` — package name, build type (`ament_cmake` / `ament_python`), dependencies
- `CMakeLists.txt` — `add_executable()` targets (node names)
- `setup.py` — Python node entry points
- Topic name string literals in `src/` files

This context is injected into the AI system prompt so answers are specific to **your** workspace.

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `gearcodeai.nimApiKey` | `""` | NVIDIA NIM API key |
| `gearcodeai.nimModel` | `meta/llama-3.3-70b-instruct` | Model to use |
| `gearcodeai.errorSnifferEnabled` | `true` | Watch terminals for build errors |
| `gearcodeai.autoAnalyzeWorkspace` | `true` | Analyze on startup |

---

## Build from source

```bash
cd GearCodeAI
npm install
npm run compile        # or: npm run watch
# Press F5 in VS Code to launch Extension Development Host
```

To package a `.vsix`:

```bash
npm run package
# → gearcodeai-0.1.0.vsix
```

---

## Roadmap

- **Phase 2** — One-click Wi-Fi deploy to RPi/Jetson, Docker cross-compilation, `.bag`/ulog telemetry reader
- **Phase 3** — VS Code Marketplace launch, user metrics, community feedback
- **Phase 4** — Native standalone IDE (VSCodeium fork), live sensor graphs, 3D physics simulator

---

## License

MIT — see [LICENSE](LICENSE).
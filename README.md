# RoboCode — AI for Robotics

> AI-powered coding assistant for **ROS 2**, embedded C++, and drone development.  
> Phase 1 MVP — VS Code Extension

---

## What it does

| Feature | How to trigger |
|---|---|
| **Ask AI about selected code** | Highlight → `Ctrl+M` (or `Cmd+M` on Mac) |
| **Auto-detect build errors** | Just run `colcon build` — RoboCode watches the terminal |
| **Fix build error with AI** | Click the status bar item or run `RoboCode: Fix Last Build Error` |
| **Open AI chat panel** | Command Palette → `RoboCode: Open AI Chat` |
| **Show workspace context** | Command Palette → `RoboCode: Show Workspace Context` |

---

## Setup

### 1. Get a free NVIDIA NIM API key

1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign up / log in → click **Get API Key**
3. Copy the key (starts with `nvapi-…`)

### 2. Set your key in VS Code

Open **Settings** → search `robocode.nimApiKey` → paste your key.

Or via the command palette:

```
Preferences: Open User Settings (JSON)
```

Add:

```json
"robocode.nimApiKey": "nvapi-your-key-here"
```

### 3. Open your ROS 2 workspace

Open the folder that contains your `src/` and (optionally) `colcon.meta`.  
RoboCode will auto-detect your packages on startup and inject them as context into every AI query.

---

## How it knows your project

On activation, RoboCode scans for:

- `package.xml` — package name, build type (`ament_cmake` / `ament_python`), dependencies
- `CMakeLists.txt` — `add_executable()` targets (node names)
- `setup.py` — Python node entry points
- Topic name string literals in `src/` files

This context is injected into the AI system prompt so answers are specific to **your** workspace.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `robocode.nimApiKey` | `""` | NVIDIA NIM API key |
| `robocode.nimModel` | `meta/llama-3.3-70b-instruct` | Model to use |
| `robocode.errorSnifferEnabled` | `true` | Watch terminals for build errors |
| `robocode.autoAnalyzeWorkspace` | `true` | Analyse on startup |

---

## Build from source

```bash
cd robocode
npm install
npm run compile         # or: npm run watch
# Press F5 in VS Code to launch Extension Development Host
```

To package a `.vsix`:

```bash
npm run package
# → robocode-0.1.0.vsix
```

---

## Roadmap

- **Phase 2** — One-click Wi-Fi deploy to RPi/Jetson, Docker cross-compilation, `.bag`/ulog telemetry reader
- **Phase 3** — VS Code Marketplace launch, user metrics, community feedback
- **Phase 4** — Native standalone IDE (VSCodium fork), live sensor graphs, 3D physics simulator

# Image Gallery - Electron Desktop App

This document explains how to use the Image Gallery as a cross-platform desktop application.

## Running in Development Mode

```bash
# Run the Electron app
npm run electron

# Run with developer tools enabled
npm run electron:dev

# Run and scan a specific directory
npm run electron -- /path/to/images
```

## Building for Distribution

### Build for your current platform
```bash
npm run build
```

### Build for specific platforms
```bash
# macOS (DMG and ZIP)
npm run build:mac

# Windows (NSIS installer and portable)
npm run build:win

# Linux (AppImage, DEB, and RPM)
npm run build:linux

# All platforms
npm run build:all
```

Built applications will be in the `dist/` directory.

## Platform-Specific Notes

### macOS
- **Output formats**: DMG (installer), ZIP (portable)
- **Icon**: Place `icon.icns` in `build/` directory
- **Code signing**: Configure in package.json for App Store distribution

### Windows
- **Output formats**: NSIS installer, Portable executable
- **Icon**: Place `icon.ico` in `build/` directory
- **Installer options**: Configured for custom installation directory

### Linux
- **Output formats**: AppImage (universal), DEB (Debian/Ubuntu), RPM (Fedora/RHEL)
- **Icon**: Place `icon.png` in `build/` directory
- **Category**: Graphics

## Features in Electron App

- **File menu**: Select directories to scan via File > Select Directory (Cmd/Ctrl+O)
- **Native window**: Full desktop integration with native menus
- **Auto port selection**: Automatically finds available port for local server
- **Graceful shutdown**: Cleans up server process on app close

## Application Icons

To customize the app icon, place the following files in a `build/` directory:

```
build/
  ├── icon.icns   (macOS, 1024x1024)
  ├── icon.ico    (Windows, multiple sizes)
  └── icon.png    (Linux, 512x512)
```

You can generate these from a single high-resolution PNG using tools like:
- https://www.img2icnsconverter.com/ (macOS)
- https://converticon.com/ (Windows)
- Or use electron-icon-builder: `npm install -g electron-icon-builder`

## Development vs Production

- **Development**: `npm run electron` - runs with current source files
- **Production**: `npm run build` - packages everything into a distributable app
- **Test build**: `npm run pack` - creates unpacked app for testing (faster than full build)

## Troubleshooting

### Port conflicts
The app automatically finds an available port starting from 3000. If you see connection errors, check that no firewall is blocking localhost connections.

### Sharp/FFmpeg issues
The app requires `sharp` (for images) and `ffmpeg` (for videos) to be installed:
- Sharp is bundled automatically with npm install
- FFmpeg must be installed system-wide or bundled in the app

### Build errors
- Ensure you have the required platform tools installed (Xcode for macOS, Visual Studio for Windows)
- Check electron-builder documentation: https://www.electron.build/

## File Structure

```
image-gallery-server/
├── main.js           # Electron main process (creates window, starts server)
├── preload.js        # Electron preload script (secure IPC bridge)
├── server.js         # Express server (handles gallery API)
├── public/           # Static web assets
├── static/           # Generated thumbnails
└── metadata/         # Image metadata storage
```

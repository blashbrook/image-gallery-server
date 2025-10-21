# Image Gallery Server CLI

A lightweight Node.js web server that creates dynamic galleries from directories containing images and videos. Now available as a global CLI tool!

Simply run `gallery up` in any folder with media files, and it will automatically generate a beautiful, responsive web gallery with real-time scanning progress, pan/zoom functionality, and video support.

## Features

✨ **Modern Web Interface**
- Organized gallery with folder sections
- Viewport-aware thumbnail generation (prioritizes visible images)
- Pause/resume thumbnail generation at any time
- Real-time thumbnail generation with progress bar
- Instant tiny preview thumbnails for immediate feedback
- Pan and zoom functionality for images
- Video playback support
- Favorite/heart images with persistent storage
- Filter to show only favorited images
- Fullscreen mode and dark/light theme toggle
- Responsive design for all devices

🚀 **Easy to Use**
- Global CLI installation
- Automatic port detection
- Browser auto-launch
- Recursive directory scanning

📱 **Media Support**
- **Images**: JPG, PNG, GIF, BMP, WebP, TIFF, SVG
- **Videos**: MP4, MOV, AVI, MKV, WebM, OGG, M4V, 3GP, WMV, FLV

## System Requirements

### **Minimum Requirements:**
- **Node.js**: 18.0.0 or higher
- **npm**: 6.0.0 or higher (usually bundled with Node.js)
- **Operating System**: 
  - macOS 10.13+ (High Sierra)
  - Linux (Ubuntu 18.04+, CentOS 7+, or equivalent)
  - Windows 10+ (with PowerShell 3.0+)
- **Memory**: 512MB RAM minimum, 1GB+ recommended for large galleries
- **Storage**: 50MB for application + additional space for thumbnail cache

### **Platform-Specific Dependencies:**

#### **Linux:**
- **Build tools**: `build-essential` (Ubuntu/Debian) or `gcc-c++` (CentOS/RHEL)
- **Python**: 3.6+ (for Sharp native compilation)
- **Additional packages**: May need `libvips-dev` for Sharp optimization

#### **macOS:**
- **Xcode Command Line Tools**: Required for Sharp compilation
- Install with: `xcode-select --install`

#### **Windows:**
- **Visual Studio Build Tools** or **Visual Studio 2019+**
- **Python**: 3.6+ (Microsoft Store version recommended)
- **PowerShell**: 3.0+ (Windows 10+ includes 5.1+)

### **Supported Image Formats:**
- **Images**: JPEG, PNG, GIF, BMP, WebP, TIFF, SVG
- **Videos**: MP4, MOV, AVI, MKV, WebM, OGG, M4V, 3GP, WMV, FLV

### **Performance Considerations:**
- **Viewport-Aware Generation**: 
  - Only generates thumbnails for visible images first
  - Automatically prioritizes as you scroll
  - Reduces initial wait time for large galleries
  - Background generation continues for off-screen images
- **Two-Phase Thumbnail Generation**: 
  - Phase 1: Instant 64×64 tiny previews (blurred) for viewport items
  - Phase 2: Full 300×300px thumbnails
- **Adaptive Batch Processing**: 
  - Processes 5 items at a time with viewport priority
  - Viewport items: Tiny preview → Full thumbnail
  - Background items: Full thumbnail only
- **User Control**:
  - Pause/resume thumbnail generation at any time
  - Gallery remains fully usable while paused
  - Resume exactly where you left off
- **Thumbnail Size**: 300×300px JPEG (quality 80%) + 64×64px tiny preview
- **Cache Size**: ~10-50KB per full thumbnail + ~2KB per tiny preview
- **Memory Usage**: ~100-200MB base + ~1-2MB per 1000 images
- **CPU Usage**: Moderate during initial thumbnail generation, minimal during serving
- **Progressive Loading**: Server-Sent Events (SSE) for real-time thumbnail updates

### **Network Requirements:**
- **Local Network**: Gallery accessible on local network by default
- **Port Range**: 3000-3099 (automatic port selection if 3000 in use)
- **Bandwidth**: Minimal - thumbnails cached locally, full images served on-demand

## Installation Methods

### 🚀 One-Line Install (Recommended)

**Linux/macOS:**
```bash
# Install directly from GitHub (when published)
curl -fsSL https://raw.githubusercontent.com/blashbrook/image-gallery-server/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
# Run in PowerShell (may require Administrator privileges)
Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/blashbrook/image-gallery-server/main/install.ps1')
```

### 📦 Local Install (Development)

**Linux/macOS:**
```bash
# Clone the repository first
git clone https://github.com/blashbrook/image-gallery-server.git
cd image-gallery-server

# Run local installer
./install-local.sh
```

**Windows:**
```powershell
# Clone the repository first
git clone https://github.com/blashbrook/image-gallery-server.git
cd image-gallery-server

# Run local installer
.\install.ps1
```

### 🔧 Manual Install
```bash
# Install globally from this directory
npm install -g .

# Or if published to npm
npm install -g image-gallery-server
```

### 🗑️ Uninstall

**Linux/macOS:**
```bash
# Using installer script
curl -fsSL https://raw.githubusercontent.com/blashbrook/image-gallery-server/main/install.sh | bash -s -- --uninstall

# Or local uninstall
./install-local.sh --uninstall

# Or manual uninstall
npm uninstall -g image-gallery-server
```

**Windows:**
```powershell
# Using installer script
Invoke-Expression (New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/blashbrook/image-gallery-server/main/install.ps1'); .\install.ps1 -Uninstall

# Or local uninstall
.\install.ps1 -Uninstall

# Or manual uninstall
npm uninstall -g image-gallery-server
```

## CLI Usage

### Start Gallery Server
```bash
# Start server in current directory
gallery up

# Start server for specific directory
gallery up -d /path/to/images

# Use custom port
gallery up -p 8080

# Don't open browser automatically
gallery up --no-open
```

### Scan Directory (Preview)
```bash
# Scan current directory and show results
gallery scan

# Scan specific directory
gallery scan -d /path/to/images
```

### Stop All Servers
```bash
# Stop all running gallery servers
gallery stop
```

### Force Rescan
```bash
# Force rescan of current directory gallery
gallery rescan
```

### Clean Up Orphaned Thumbnails
```bash
# Remove thumbnails for deleted media files
gallery cleanup
```

### Clean Up Cache Files
```bash
# Delete all .gallery-cache directories (with confirmation)
gallery delete

# Delete cache files in specific directory
gallery delete -d /path/to/clean

# Force delete without confirmation
gallery delete -f
```

## Installation

1. **Clone or download this project**
2. **Install dependencies**:
   ```bash
   npm install
   ```

## Quick Start

### Basic Usage
Launch the server in the current directory:
```bash
npm start
```

### Specify a Directory
Launch the server to scan a specific directory:
```bash
node server.js /path/to/your/images
```

### Development Mode
Run with auto-restart on file changes:
```bash
npm run dev
```

## How It Works

1. **Scanning**: Recursively scans directories for images and videos
2. **Thumbnails**: Automatically generates optimized thumbnails
3. **Caching**: Stores thumbnails in `.gallery-cache` directories
4. **Serving**: Provides a responsive web interface with advanced features
5. **File Watching**: Automatically detects new/deleted files
6. **Smart Caching**: Caches scan results for fast loading

## ⚡ Performance & Caching

### **Intelligent Caching System:**
- **📋 File Listings**: Cached for 30 seconds for instant loading
- **🖼️ Thumbnails**: Generated once and cached permanently
- **👀 File Watching**: Auto-detects new/deleted files and invalidates cache
- **🔄 Manual Refresh**: Use `gallery rescan` or click "Rescan" button

### **Optimizations:**
- **Background Processing**: Server runs detached, no terminal blocking
- **Lazy Thumbnails**: Only generated when requested
- **Smart Invalidation**: Cache updates only when files change
- **Efficient Scanning**: Skips hidden directories and irrelevant files

### **Cache Behavior:**
- **Server Restart**: ❌ Not needed - file watching handles new files automatically
- **New Files**: ✅ Detected automatically via file watching
- **Cache Location**: `.gallery-cache/` in each scanned directory
- **Cache Cleanup**: Use `gallery delete` to remove cache files

## API Endpoints

### Get Gallery Data
```
GET /api/gallery
```
Returns JSON with all images organized by directory structure.

### Server-Sent Events (SSE)
```
GET /progress
```
Real-time thumbnail generation progress and updates:
- `request_viewport_items`: Server requests visible items from client
- `tiny_preview_ready`: When 64×64 preview is generated
- `thumbnail_ready`: When full 300×300 thumbnail is complete
- `global_thumbnail_progress`: Overall progress with current file
- `thumbnail_paused`: When generation is paused/resumed

### Force Rescan
```
POST /api/rescan
```
Invalidates cache and rescans directory for new files.

### Report Viewport Items
```
POST /api/viewport-items
```
Client reports which images are currently visible in viewport.
Payload: `{ relativePaths: string[] }`

### Pause/Resume Thumbnail Generation
```
POST /api/pause-thumbnails
```
Toggles pause state for thumbnail generation.
Returns: `{ isPaused: boolean }`

### View Individual Image
```
GET /image/:path
```
Serves the full-resolution image file.

### Static Files
```
GET /static/*
```
Serves thumbnails and cached files from `.gallery-cache/`.

## Directory Structure

```
image-gallery-server/
├── server.js              # Main server application
├── metadata.js            # Metadata management module
├── package.json           # Node.js dependencies
├── public/
│   └── index.html         # Web gallery interface
├── static/
│   └── thumbnails/        # Generated thumbnails (auto-created)
├── metadata/              # Image metadata files (auto-created)
└── README.md
```

## Configuration

### Environment Variables
- `PORT`: Server port (default: 3000)

### Command Line Arguments
- First argument: Directory to scan (default: current directory)

### Examples

```bash
# Scan current directory on port 3000
npm start

# Scan specific directory
node server.js ~/Pictures

# Use different port
PORT=8080 node server.js /path/to/images
```

## Features in Detail

### Thumbnail Generation
- **Viewport-aware generation**:
  - Prioritizes thumbnails for images currently visible on screen
  - Automatically detects and prioritizes as you scroll (500px buffer)
  - Background generation continues for off-screen images
- **Two-phase generation** for optimal UX:
  1. Instant tiny previews (64×64) appear immediately for viewport items
  2. Full-quality thumbnails (300×300) load progressively
- **Pause/Resume control**:
  - Pause button replaces rescan button during generation
  - Click to pause/resume at any time
  - Gallery remains fully usable while paused
  - Icon changes: ⏸️ (pause) ↔️ ▶️ (resume)
- **Real-time progress**: Slim progress bar in header with current file name
- **Individual loaders**: Spinner on each thumbnail during generation
- Uses Sharp for high-quality, fast image processing
- Thumbnails are cached and only regenerated if missing
- JPEG format with 80% quality for optimal file size

### Favorites System
- **Heart/favorite images**: Click heart icon on any image
- **Persistent storage**: Favorites saved in browser localStorage
- **Filter view**: Toggle to show only favorited images
- **Multiple interfaces**:
  - Gallery view: Heart button appears on hover (top-right)
  - Modal view: Heart button in zoom controls
  - Header: Filter button to show only favorites
- **Visual feedback**: Red filled heart when favorited, outline when not

### Security Features
- Path traversal protection prevents access to files outside scan directory
- Only serves files with supported image extensions
- Base64-encoded filenames prevent filename conflicts

### Performance
- Lazy loading for thumbnails
- Efficient caching of generated thumbnails
- Asynchronous directory scanning
- Minimal memory footprint

### Mobile Support
- Responsive column layout (2-5 columns based on screen size)
- Touch-friendly image previews
- Optimized for various screen sizes
- Progressive loading with tiny previews for faster initial display
- Efficient loading on mobile networks

### User Interface Controls
- **Header Buttons**:
  - Fullscreen: Toggle fullscreen mode
  - Theme: Switch between dark and light themes
  - Pause/Resume: Pause or resume thumbnail generation (only visible during generation)
  - Rescan: Force directory rescan (hidden during generation)
  - Favorites Filter: Show only hearted images (highlights red when active)
- **Modal Controls** (Image Viewer):
  - Heart: Favorite/unfavorite current image
  - Zoom In/Out: Control image zoom level
  - Reset: Return to 100% zoom
  - Close: Exit modal (or press ESC)
- **Gallery View**:
  - Heart icon on hover: Favorite images directly from gallery
  - Click image: Open in full-screen modal
  - Organized by folder sections with titles
  - Automatic viewport detection for optimized loading

## Troubleshooting

### System Requirements Issues

**Q: Installation fails with "Node.js version too old" error**
- Update Node.js to 18.0.0 or higher from [nodejs.org](https://nodejs.org/)
- Verify version: `node --version`

**Q: Sharp installation fails on Linux**
- Install build tools: `sudo apt-get install build-essential python3-dev` (Ubuntu/Debian)
- Or: `sudo yum install gcc-c++ python3-devel` (CentOS/RHEL)
- For better performance: `sudo apt-get install libvips-dev`

**Q: "gyp ERR!" during installation on Windows**
- Install Visual Studio Build Tools or Visual Studio with C++ tools
- Alternative: Install windows-build-tools: `npm install -g windows-build-tools`
- Ensure Python 3.6+ is installed and in PATH

**Q: Sharp installation fails on macOS**
- Install Xcode Command Line Tools: `xcode-select --install`
- Update macOS to latest version if using older hardware
- For Apple Silicon Macs: Ensure Node.js is ARM64 version

**Q: "Permission denied" errors during installation**
- On macOS/Linux: Use `sudo` or configure npm for global installs without sudo
- Configure npm: `npm config set prefix ~/.local` and add `~/.local/bin` to PATH
- On Windows: Run PowerShell as Administrator

**Q: Gallery server won't start**
- Check Node.js version: `node --version` (must be 18+)
- Verify port availability: `netstat -an | grep 3000`
- Check file permissions in installation directory

### Common Issues

**Q: Images aren't showing up**
- Ensure image files have supported extensions
- Check file permissions
- Verify the directory path is correct

**Q: Thumbnails not generating**
- Sharp may need additional dependencies on some systems
- Check console for thumbnail generation errors
- Ensure write permissions to `static/thumbnails/` directory

**Q: Server won't start**
- Check if port 3000 is already in use
- Try a different port: `PORT=8080 npm start`
- Ensure Node.js version 18+ is installed

### Error Messages
- `Unable to scan directory`: Check directory permissions and path
- `Failed to generate thumbnail`: Image file may be corrupted or unsupported format
- `Access denied`: File is outside the scan directory (security protection)

## Development

### Requirements
- Node.js 18.0.0 or higher
- npm or yarn package manager

### Dependencies
- **express**: Web server framework
- **sharp**: High-performance image processing
- **multer**: File upload handling (for future features)

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Changelog

### v1.0.0
- Initial release
- Basic gallery functionality
- Thumbnail generation
- Responsive design
- Directory organization
- Metadata support framework

## Commands Quick Reference

| Command | Description | Example |
|---------|-------------|----------|
| `gallery up` | Start server | `gallery up -d ~/Photos` |
| `gallery scan` | Preview scan results | `gallery scan -d ~/Documents` |
| `gallery stop` | Stop all servers | `gallery stop` |
| `gallery rescan` | Force rescan files | `gallery rescan` |
| `gallery cleanup` | Clean orphaned thumbnails | `gallery cleanup` |
| `gallery delete` | Clean cache files | `gallery delete -f` |

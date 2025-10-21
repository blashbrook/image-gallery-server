# Image Gallery Server CLI

A lightweight Node.js web server that creates dynamic galleries from directories containing images and videos. Now available as a global CLI tool!

Simply run `gallery up` in any folder with media files, and it will automatically generate a beautiful, responsive web gallery with real-time scanning progress, pan/zoom functionality, and video support.

## Features

✨ **Modern Web Interface**
- Masonry/Pinterest-style wall layout
- Real-time scanning progress display
- Pan and zoom functionality for images
- Video playback support
- Responsive design for all devices

🚀 **Easy to Use**
- Global CLI installation
- Automatic port detection
- Browser auto-launch
- Recursive directory scanning

📱 **Media Support**
- **Images**: JPG, PNG, GIF, BMP, WebP, TIFF, SVG
- **Videos**: MP4, MOV, AVI, MKV, WebM, OGG, M4V, 3GP, WMV, FLV

## Installation Methods

### 🚀 One-Line Install (Recommended)
```bash
# Install directly from GitHub (when published)
curl -fsSL https://raw.githubusercontent.com/your-username/image-gallery-server/main/install.sh | bash
```

### 📦 Local Install (Development)
```bash
# Clone the repository first
git clone https://github.com/your-username/image-gallery-server.git
cd image-gallery-server

# Run local installer
./install-local.sh
```

### 🔧 Manual Install
```bash
# Install globally from this directory
npm install -g .

# Or if published to npm
npm install -g image-gallery-server
```

### 🗑️ Uninstall
```bash
# Using installer script
curl -fsSL https://raw.githubusercontent.com/your-username/image-gallery-server/main/install.sh | bash -s -- --uninstall

# Or local uninstall
./install-local.sh --uninstall

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

### View Individual Image
```
GET /image/:path
```
Serves the full-resolution image file.

### Static Files
```
GET /static/*
GET /public/*
```
Serves thumbnails and web assets.

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
- Automatically generates 300x300 thumbnails
- Uses Sharp for high-quality, fast image processing
- Thumbnails are cached and only regenerated if missing
- JPEG format with 80% quality for optimal file size

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
- Responsive grid layout
- Touch-friendly image previews
- Optimized for various screen sizes
- Efficient loading on mobile networks

## Troubleshooting

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

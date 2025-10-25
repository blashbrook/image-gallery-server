# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a lightweight Node.js CLI tool that creates dynamic image galleries from any directory. It can be installed globally and launched from any folder using the `gallery` command. The server generates web files dynamically in a `.gallery-cache` directory within the working directory.

## Key Architecture

### Global Installation System
- **Package Structure**: Installed globally via `npm install -g` or `npm link`
- **Binary**: `bin/gallery.js` is the CLI entry point (defined in package.json `bin` field)
- **Command**: `gallery up` launches a detached background server process
- **Process Management**: Uses PID files stored in `.gallery-cache/gallery.pid` for tracking

### Core Components
- **bin/gallery.js**: CLI interface using Commander.js - handles `up`, `down`, `scan`, `cleanup`, `delete`, `rescan` commands
- **bin/server-runner.js**: Background server process spawned by CLI - runs detached from terminal
- **server.js**: Legacy standalone server (kept for backwards compatibility)
- **metadata.js**: MetadataManager class for storing/retrieving image metadata as JSON files

### Dynamic Cache System (`.gallery-cache/`)
All generated files are stored in a `.gallery-cache` directory created in the current working directory:
- `.gallery-cache/thumbnails/`: Auto-generated JPEG thumbnails (300x300px for images, placeholders for videos)
- `.gallery-cache/metadata/`: JSON metadata files for images (future feature)
- `.gallery-cache/index.html`: Dynamically generated single-page gallery interface
- `.gallery-cache/gallery.pid`: Process ID file for server management

### Key Features
- **Recursive directory scanning** with security path validation
- **Automatic thumbnail generation** with caching using Sharp
- **Base64 filename encoding** for thumbnail/metadata file safety
- **Viewport-aware thumbnail loading**: Prioritizes visible images using Intersection Observer
- **Progressive loading**: Low-res previews (64x64) → High-res thumbnails (300x300)
- **File watching**: Auto-invalidates cache when images are added/removed (using chokidar)
- **Server-Sent Events (SSE)**: Real-time progress updates for thumbnail generation
- **Responsive masonry grid** layout with modal image viewing
- **Heart/favorite system**: Stored in localStorage
- **Dark/light theme toggle**
- **REST API** at `/api/gallery` returning directory-grouped image data

## User Interface Features

### Gallery View

#### Header Bar (Sticky)
- **Gallery Title**: Shows "Gallery" with camera icon
- **Current Path**: Displays the directory being scanned
- **Image Count**: Shows total number of media files found
- **Progress Bar**: Animated progress indicator during thumbnail generation
  - Shows percentage complete
  - Displays current file being processed
  - Auto-hides when generation complete
- **Action Buttons**:
  - 🖼️ **Fullscreen**: Enter/exit fullscreen mode
  - 🌙 **Theme Toggle**: Switch between light and dark themes
  - ⏸️ **Pause**: Pause/resume thumbnail generation (only visible during generation)
  - 🔄 **Rescan**: Force directory rescan and cache refresh
  - ❤️ **Heart Filter**: Show only favorited images (highlights when active)

#### Gallery Grid
- **Masonry Layout**: Pinterest-style column layout that adapts to screen size
- **Directory Sections**: Images grouped by subdirectory with section headers
- **Thumbnail Cards**: Each image displays as a card with:
  - **Thumbnail Image**: 300x300 auto-generated preview
  - **Heart Button**: Appears on hover, click to favorite
  - **Loading Indicator**: Shimmer effect + spinner while generating thumbnail
  - **Video Badge**: "▶ VIDEO" badge for video files
- **Hover Effects**: Cards lift and cast larger shadow on hover
- **Responsive Columns**: 
  - 5 columns on desktop (>1200px)
  - 4 columns on laptop (900-1200px)
  - 3 columns on tablet (600-900px)
  - 2 columns on mobile (<600px)

### Modal Viewer (Full-Screen Image/Video)

#### Opening the Modal
- Click any thumbnail to open full-resolution view
- Modal overlays entire screen with dark backdrop

#### Image Viewing Features
- **High-Resolution Display**: Shows original full-size image
- **Zoom Controls** (bottom-center buttons):
  - **❤️ Heart**: Toggle favorite for current image
  - **− Zoom Out**: Decrease zoom level
  - **⌂ Reset**: Reset to 100% zoom, centered
  - **+ Zoom In**: Increase zoom level
- **Zoom Info** (top-left): Shows current zoom percentage (e.g., "150%")
- **Mouse Wheel Zoom**: Scroll to zoom in/out (10% to 500%)
- **Pan & Drag**: When zoomed in, click and drag to pan around image
- **Cursor Changes**: Grab cursor when pannable, grabbing cursor while panning

#### Video Viewing Features
- **Native Video Player**: HTML5 video player with standard controls
- **Supported Formats**: mp4, mov, avi, mkv, webm, ogg, m4v, 3gp, wmv, flv
- **No Zoom**: Zoom controls hidden for videos (not applicable)

#### Modal Navigation
- **Close Button** (top-right): Large round × button
  - Rotates 90° on hover for visual feedback
  - Glassy transparent design with backdrop blur
- **Click Outside**: Click modal backdrop to close
- **Escape Key**: Press ESC to close modal

### Favorites System

#### Heart/Favorite Feature
- **Add to Favorites**: Click heart button on any image
- **Visual Feedback**: Hearted items show filled red heart icon
- **Persistence**: Favorites saved to browser's localStorage
- **Filter View**: Click heart filter button in header to show only favorites
- **Works in Modal**: Can favorite/unfavorite from modal zoom controls

### Theme System

#### Light Theme (Default)
- White/light gray backgrounds
- Dark text for high contrast
- Clean, modern appearance

#### Dark Theme
- Dark gray/black backgrounds
- Light text for readability
- Reduces eye strain in low-light environments

#### Toggle Behavior
- Click moon icon in header to switch themes
- Instant theme swap using CSS custom properties
- Theme preference not persisted (resets on page reload)

### Real-Time Progress Updates

#### Thumbnail Generation Progress
- **Visual Progress Bar**: Fills from left to right during generation
- **File Counter**: Shows "Generating: X/Y" with current file name
- **Incremental Updates**: Gallery updates as each thumbnail completes
- **Viewport Priority**: Visible images generate first
- **Pause/Resume**: Can pause generation mid-process
- **Background Processing**: Generation continues even when scrolling

#### Auto-Refresh on File Changes
- File watcher detects new/deleted images
- Cache automatically invalidates
- UI can trigger rescan to update gallery

### Loading States

#### Initial Page Load
- Gallery structure appears immediately
- Images with existing thumbnails load instantly
- Placeholders shown for images without thumbnails

#### Progressive Thumbnail Loading
1. **Placeholder**: Gray SVG placeholder
2. **Tiny Preview**: Blurred 64x64 preview (visible items only)
3. **Full Thumbnail**: Sharp 300x300 thumbnail
4. **Loading Animation**: Shimmer effect during generation

### Responsive Design

#### Mobile Optimizations
- 2-column layout on small screens
- Touch-friendly button sizes (48px minimum)
- Swipe gestures work naturally with browser defaults
- Zoom controls easy to tap

#### Desktop Optimizations  
- 5-column masonry for maximum content density
- Hover states for better interactivity feedback
- Keyboard shortcuts (ESC to close modal)
- Mouse wheel zoom for precise control

### Accessibility Features

#### Keyboard Support
- **ESC**: Close modal
- **Tab**: Navigate between buttons
- **Enter/Space**: Activate buttons

#### Visual Feedback
- All interactive elements have hover states
- Focus states for keyboard navigation
- Loading indicators for async operations
- Progress updates during long operations

#### Performance
- Lazy loading for off-screen images
- Viewport-aware thumbnail generation
- Efficient CSS-based masonry (no JavaScript layout)
- Debounced scroll handlers

## Common Usage Commands

### Global Installation
```bash
# Install globally from npm
npm install -g image-gallery-server

# Or install from local directory (for development)
npm link
```

### Running the Gallery
```bash
# Start gallery server in current directory
gallery up

# Start with custom port
gallery up --port 8080

# Start without opening browser
gallery up --no-open

# Start in specific directory
gallery up -d /path/to/photos
```

### Managing Servers
```bash
# Stop all running gallery servers
gallery down

# Scan directory without starting server
gallery scan

# Force rescan of current gallery
gallery rescan
```

### Maintenance
```bash
# Clean up orphaned thumbnails in current directory
gallery cleanup

# Delete all .gallery-cache directories recursively
gallery delete

# Delete with confirmation skip
gallery delete -f

# Delete in specific directory
gallery delete -d /path/to/clean
```

### Development Commands
```bash
# Install dependencies
npm install

# Run standalone server (legacy mode)
npm start

# Development mode with file watching
npm run dev
```

## Important Technical Details

### Process Management Architecture
- **CLI Process**: `bin/gallery.js` spawns server and exits immediately
- **Server Process**: `bin/server-runner.js` runs detached with `stdio: ['ignore', 'ignore', 'ignore']`
- **PID Tracking**: Server writes PID to `.gallery-cache/gallery.pid` for management
- **Signal Handling**: Supports SIGTERM/SIGINT for graceful shutdown
- **Process Discovery**: Uses `ps aux | grep server-runner.js` to find orphaned processes

### Dynamic File Generation
- **index.html**: Generated on-the-fly in `.gallery-cache/` by `server-runner.js`
- **Embedded**: Complete HTML/CSS/JS embedded in `generateIndexHTML()` function
- **Per-Directory**: Each working directory gets its own `.gallery-cache/` instance
- **No Global Files**: Server doesn't rely on installed package files (except node_modules)

### Security Considerations
- Path traversal protection prevents access outside scan directory
- Only serves files with approved image/video extensions
- Base64 encoding prevents filename conflicts and injection
- Resolves paths with `path.resolve()` before validation
- Skips `.gallery-cache` and hidden directories in scans

### Image Processing
- **Thumbnails**: 300x300 pixels, JPEG quality 80%, 'inside' fit preserving aspect ratio
- **Video Placeholders**: SVG play button on solid background (no FFmpeg extraction in CLI version)
- **Supported Image Formats**: jpg, jpeg, png, gif, bmp, webp, tiff, svg
- **Supported Video Formats**: mp4, mov, avi, mkv, webm, ogg, m4v, 3gp, wmv, flv
- **Lazy Generation**: Thumbnails created on-demand during initial scan

### Viewport-Aware Thumbnail Generation
- **Priority Queue System**: Separate queues for viewport vs background items
- **Client-Side Detection**: Browser reports visible items via `/api/viewport-items`
- **Batch Processing**: Configurable batch sizes (3-10) based on gallery size
- **Progressive Loading**: 
  1. Initial scan returns image list with existing thumbnails
  2. Browser reports viewport items
  3. Server generates tiny previews (64x64) for visible items first
  4. Full thumbnails (300x300) generated in priority order
  5. SSE broadcasts updates as thumbnails complete

### Caching System
- **In-Memory Cache**: Gallery data cached for 30 seconds
- **File Watching**: Chokidar monitors directory for changes
- **Auto-Invalidation**: Cache invalidated on file add/remove
- **SSE Notifications**: Broadcasts cache invalidation to connected clients
- **Orphan Cleanup**: Automatically removes thumbnails for deleted images

### API Endpoints
- `GET /api/gallery`: Returns all images grouped by directory (cached)
- `GET /image/:path(*)`: Serves full-resolution images with path validation
- `GET /static/thumbnails/*`: Serves generated thumbnails from `.gallery-cache/`
- `GET /progress`: Server-Sent Events for real-time thumbnail progress
- `POST /api/viewport-items`: Client reports visible items for priority generation
- `POST /api/pause-thumbnails`: Toggle thumbnail generation pause
- `POST /api/rescan`: Force cache invalidation and rescan
- `GET /api/cache-status`: Returns cache state and statistics
- `GET /api/debug`: Server diagnostics (PID, uptime, memory, connections)
- `GET /`: Main gallery interface (serves `.gallery-cache/index.html`)

### Metadata System (Future Feature)
- JSON files stored in `.gallery-cache/metadata/` directory
- Filename: Base64-encoded relative image path + `.json`
- Default structure: tags, description, rating, lastUpdated
- MetadataManager provides CRUD operations and search functionality
- Currently not actively used in UI

## UI Layout & Frontend Architecture

### Layout System
- **Type**: CSS Multi-Column Layout (Masonry-style)
- **Implementation**: Uses CSS `column-count` for automatic masonry grid
- **Responsive Breakpoints**:
  - Desktop (>1200px): 5 columns
  - Laptop (900px-1200px): 4 columns  
  - Tablet (600px-900px): 3 columns
  - Mobile (<600px): 2 columns
- **Gap**: 15px between items
- **Item Behavior**: `break-inside: avoid` prevents column breaks within items

### Gallery Structure
```
Header (sticky)
  ├── Gallery title + path
  ├── Stats (total images)
  ├── Progress bar (thumbnail generation)
  └── Action buttons (fullscreen, theme, pause, rescan, filter hearts)

Gallery Sections (scrollable)
  └── For each directory:
      ├── Section title (directory name)
      └── Gallery grid (masonry columns)
          └── Gallery items:
              ├── Heart/favorite button (top-right)
              ├── Loading spinner (if generating)
              └── Thumbnail image (lazy loaded)

Modal (overlay)
  ├── Close button (top-right, round)
  ├── Zoom info (top-left, shows %)
  ├── Modal content (centered):
  │   ├── Image (with pan/zoom for images)
  │   └── Video player (with controls)
  └── Zoom controls (bottom-center, round buttons):
      ├── Heart button
      ├── Zoom out (-)
      ├── Reset zoom (home icon)
      └── Zoom in (+)
```

### Image Loading Strategy
1. **Initial Render**: Placeholder SVG for items without thumbnails
2. **Lazy Loading**: Browser-native `loading="lazy"` attribute on images
3. **Tiny Preview**: 64x64 blurred preview loads first (visible items only)
4. **Full Thumbnail**: 300x300 full-quality thumbnail loads next
5. **Full Image**: Original high-res image loads in modal on click

### State Management
- **In-Memory Cache**: `thumbnailCache` Map stores DOM references and data
- **LocalStorage**: `heartedImages` Set persisted for favorites
- **Global Variables**:
  - `scale`, `translateX`, `translateY`: Modal zoom/pan state
  - `isDragging`, `lastX`, `lastY`: Pan gesture tracking
  - `currentModalMedia`: Currently displayed media in modal
  - `showOnlyHearted`: Heart filter toggle state
  - `thumbnailsPaused`: Generation pause state

### Interactive Features

#### Gallery Items
- **Hover Effects**: Scale up, shadow increase, heart button appears
- **Click**: Opens modal with full-resolution image/video
- **Heart Button**: Toggle favorite status (persisted to localStorage)
- **Loading State**: Shimmer animation + spinner during generation

#### Modal Viewer
- **Image Mode**:
  - Mouse wheel: Zoom in/out
  - Click + drag: Pan when zoomed
  - Zoom range: 10% to 500%
  - Visual feedback: Zoom percentage display
- **Video Mode**:
  - Native HTML5 video controls
  - No zoom controls (videos not zoomable)
- **Navigation**:
  - Click outside: Close modal
  - ESC key: Close modal
  - Close button (×): Round, glassy button with rotation on hover

#### Header Controls
- **Fullscreen Button**: Toggle browser fullscreen mode
- **Theme Toggle**: Switch between light/dark themes (CSS custom properties)
- **Pause Button**: Pause/resume thumbnail generation (only visible during generation)
- **Rescan Button**: Force directory rescan and cache invalidation
- **Heart Filter**: Show only favorited images (button highlight when active)

### Theme System
- **Implementation**: CSS custom properties (CSS variables)
- **Toggle**: JavaScript modifies `:root` properties on button click
- **Properties**:
  - `--bg-primary`: Main background color
  - `--bg-secondary`: Secondary background color
  - `--text-primary`: Primary text color
  - `--text-secondary`: Secondary text color
  - `--modal-bg`: Modal overlay background
  - `--button-bg`: Button background with transparency
  - `--button-bg-hover`: Button hover state
  - `--button-text`: Button text color

### Real-Time Updates (SSE)
The frontend listens for Server-Sent Events and responds to:

1. **`request_viewport_items`**: Browser reports visible items to server
2. **`tiny_preview_ready`**: Updates image src with tiny preview
3. **`thumbnail_ready`**: Updates image src with full thumbnail, removes loading state
4. **`global_thumbnail_progress`**: Updates progress bar and generation stats
5. **`thumbnail_paused`**: Updates pause button state
6. **`cacheInvalidated`**: Gallery data changed (file added/removed)

### Performance Optimizations

#### Frontend
- **Lazy Loading**: Native browser lazy loading for off-screen images
- **Viewport Detection**: Only reports visible items within 500px of viewport
- **Scroll Debouncing**: 200ms delay before reporting viewport on scroll
- **Image Caching**: Map-based cache prevents duplicate DOM queries
- **CSS Columns**: Browser-native masonry avoids JavaScript layout calculations

#### Backend (Thumbnail Generation)
- **Adaptive Batch Sizes**: Larger batches (10) for big galleries, smaller (3) for responsive feel
- **Priority Queue**: Viewport items generated before background items
- **Broadcast Throttling**: Progress updates every 5 items, not every item
- **Batch Delays**: 50ms between batches prevents CPU saturation
- **Thumbnail Caching**: Checks for existing thumbnails before generating

### Styling Approach
- **Framework**: Vanilla CSS (no frameworks)
- **Methodology**: Embedded in generated HTML
- **Typography**: System font stack for native OS feel
- **Colors**: Modern, muted palette with good contrast
- **Shadows**: Subtle depth with layered box-shadows
- **Transitions**: Smooth 0.2s transitions on interactive elements
- **Buttons**: Round, glassy design with backdrop-filter blur
- **Responsive**: Mobile-first with media queries

## Design Guidelines

### Visual Design System

#### Color Palette

**Light Theme (Default)**
- `--bg-primary: #ffffff` - Main background (white)
- `--bg-secondary: #f8f9fa` - Secondary background (light gray)
- `--text-primary: #2c3e50` - Primary text (dark blue-gray)
- `--text-secondary: #7f8c8d` - Secondary text (medium gray)
- `--modal-bg: rgba(0,0,0,0.95)` - Modal backdrop (nearly black)
- `--button-bg: rgba(255,255,255,0.15)` - Button background (translucent white)
- `--button-bg-hover: rgba(255,255,255,0.25)` - Button hover (more opaque white)
- `--button-text: #ffffff` - Button text (white)

**Dark Theme**
- `--bg-primary: #1a1a1a` - Main background (very dark gray)
- `--bg-secondary: #2d2d2d` - Secondary background (dark gray)
- `--text-primary: #e0e0e0` - Primary text (light gray)
- `--text-secondary: #a0a0a0` - Secondary text (medium gray)
- Modal and button colors remain the same

**Accent Colors**
- Heart/Favorite: `#e74c3c` (warm red)
- Progress gradient: `linear-gradient(90deg, #3498db, #2ecc71)` (blue to green)
- Loading spinner: `#3498db` (bright blue)

#### Typography

**Font Stack**
```css
font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
```
- System fonts for native OS appearance
- Fallbacks for cross-platform compatibility

**Type Scale**
- H1 (Gallery Title): `1.5rem` (24px)
- Section Title: `1.1rem` (17.6px)
- Body/Info Text: `0.9rem` (14.4px)
- Path/Progress Text: `0.75rem` (12px), `0.7rem` (11.2px)
- Modal Zoom Info: `14px`
- Button Icons: `18px` (header), `22px` (modal heart), `28px` (close)

#### Spacing System

**Padding**
- Header: `0.75rem 1.5rem` (12px 24px)
- Button padding: `0` (rely on width/height)
- Modal zoom controls padding: `10px 20px`
- Gallery sections: `0 2rem 2rem` (0 32px 32px)

**Gaps**
- Header actions: `0.5rem` (8px)
- Gallery columns: `15px`
- Gallery item margin: `15px` bottom
- Zoom controls: `12px`

**Margins**
- Header bottom: `1.5rem` (24px)
- Section bottom: `2rem` (32px)
- Title bottom: `1rem` (16px)

#### Iconography

**Icon Library**: Feather Icons (inline SVG)
- **Style**: Stroke-based, 2px stroke-width
- **Size**: 18px (header buttons), 22px (modal controls)
- **Attributes**: `stroke="currentColor"`, `fill="none"`, `stroke-linecap="round"`, `stroke-linejoin="round"`

**Header Icons**
1. **Camera** (Gallery Title):
   ```svg
   <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
   <circle cx="12" cy="13" r="4"></circle>
   ```
   - Size: 28px
   - Represents photography/gallery

2. **Fullscreen** (Expand icon):
   ```svg
   <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
   ```
   - Cornered arrows indicating expansion

3. **Moon** (Theme Toggle):
   ```svg
   <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
   ```
   - Crescent moon shape

4. **Pause/Play** (Thumbnail Generation):
   ```svg
   <!-- Pause -->
   <rect x="6" y="4" width="4" height="16"></rect>
   <rect x="14" y="4" width="4" height="16"></rect>
   
   <!-- Play (when paused) -->
   <polygon points="5 3 19 12 5 21 5 3"></polygon>
   ```
   - Dynamically switches between pause/play

5. **Refresh** (Rescan):
   ```svg
   <polyline points="23 4 23 10 17 10"></polyline>
   <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
   ```
   - Circular arrow indicating reload

6. **Heart** (Favorites):
   ```svg
   <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
   ```
   - `fill: none` (unfavorited), `fill: #e74c3c` (favorited)
   - `stroke: #e74c3c` when favorited

**Modal Icons**
- **Close (×)**: Text character, `font-size: 28px`
- **Zoom Controls**: Text characters (−, ⌂, +), `font-size: 22px`
- **Heart**: Same SVG as header, 22px size

#### Button Design

**Header Buttons**
```css
width: 36px;
height: 36px;
border: 1px solid rgba(0,0,0,0.1);
border-radius: 6px;
background: var(--bg-secondary);
transition: all 0.2s;
```
- Square with rounded corners (6px)
- Subtle border for definition
- Hover: `background: #e9ecef`

**Modal Buttons (Round, Glassy)**
```css
width: 48px (zoom), 56px (close);
height: 48px (zoom), 56px (close);
border-radius: 50%;
background: var(--button-bg);
backdrop-filter: blur(10px);
border: 2px solid rgba(255,255,255,0.3);
box-shadow: 0 4px 12px rgba(0,0,0,0.4);
transition: all 0.2s ease;
```
- Perfect circles
- Translucent with backdrop blur (frosted glass effect)
- Prominent shadow for depth
- Hover: Scale 1.1-1.15, deeper shadow
- Close button rotates 90° on hover

#### Card Design

**Gallery Item Cards**
```css
border-radius: 8px;
box-shadow: 0 2px 8px rgba(0,0,0,0.1);
transition: transform 0.2s;
background: var(--bg-primary);
break-inside: avoid;
```
- Rounded corners (8px)
- Subtle shadow at rest
- Hover: `transform: translateY(-5px)`, `box-shadow: 0 8px 20px rgba(0,0,0,0.15)`
- Lift effect creates depth

**Heart Button on Card**
```css
position: absolute;
top: 8px;
right: 8px;
width: 32px;
height: 32px;
border-radius: 50%;
background: rgba(255,255,255,0.9);
opacity: 0; /* Hidden by default */
transition: all 0.2s;
```
- Appears on card hover
- Always visible when hearted
- White circular background
- Hover: `transform: scale(1.1)`

#### Animation Guidelines

**Transitions**
- Standard: `0.2s` for interactive elements
- Ease function: `ease` (default) or `linear` (spinners)

**Hover Effects**
- Cards: Scale up + shadow increase
- Buttons: Background change + scale
- Close button: Rotation (90°)

**Loading Animations**
```css
/* Spinner */
@keyframes spin {
  to { transform: rotate(360deg); }
}
animation: spin 0.8s linear infinite;

/* Shimmer */
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
background-size: 200% 100%;
animation: shimmer 1.5s infinite;
```

**Progress Bar**
- Smooth width transition: `0.3s ease`
- Gradient animation flows left to right

#### Shadow System

**Elevation Levels**
1. **Low (Cards at rest)**: `0 2px 8px rgba(0,0,0,0.1)`
2. **Medium (Cards on hover)**: `0 8px 20px rgba(0,0,0,0.15)`
3. **High (Modal buttons)**: `0 4px 12px rgba(0,0,0,0.4)`
4. **High Hover (Modal buttons)**: `0 6px 20px rgba(0,0,0,0.6)`

### Component Patterns

#### Adding New Buttons
When adding new functionality, follow these patterns:

**Header Button**
```html
<button class="header-btn" id="newBtn" onclick="newFunction()" title="Tooltip Text">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <!-- Feather icon paths -->
    </svg>
</button>
```

**Modal Button**
```html
<button class="zoom-btn" id="newModalBtn">
    <!-- Text or SVG icon -->
</button>
```

#### Icon Selection Guidelines
- Use Feather Icons: https://feathericons.com/
- Maintain 2px stroke-weight consistency
- Choose icons with clear, simple metaphors
- Test at 18px size for legibility

#### Color Usage
- Use CSS custom properties for all colors
- Never hardcode colors (except in gradients)
- Accent colors only for CTAs and important states
- Maintain 4.5:1 contrast ratio for text

#### Responsive Breakpoints
```css
@media (max-width: 1200px) { /* Laptop */ }
@media (max-width: 900px) { /* Tablet */ }
@media (max-width: 600px) { /* Mobile */ }
```
- Adjust column count, not design elements
- Maintain touch targets at 48px minimum on mobile
- Keep button sizes consistent across breakpoints

### Accessibility Requirements

**Interactive Elements**
- All buttons must have `title` attributes (tooltips)
- Icons must have semantic meaning
- Hover states required for all clickable elements
- Focus states for keyboard navigation

**Color Contrast**
- Text on backgrounds: Minimum 4.5:1 ratio
- Icons on backgrounds: Minimum 3:1 ratio
- Modal buttons have high contrast against dark backdrop

**Motion**
- Keep animations under 0.5s duration
- Use `prefers-reduced-motion` media query for accessibility
- Avoid rapid flashing or strobing effects

## Development Notes

### Dependencies
- **express**: Web server framework
- **sharp**: High-performance image processing (requires native compilation)
- **commander**: CLI argument parsing (Commander.js)
- **open**: Cross-platform browser launcher
- **chokidar**: File system watcher with intelligent debouncing
- **multer**: File upload handling (imported but not actively used)

### Directory Exclusions
- Hidden directories (starting with `.`)
- `node_modules` directories
- `.gallery-cache` directories (prevents recursion)
- Files outside scan directory (security)

### Error Handling
- Graceful handling of unreadable directories/files
- Console warnings for non-critical failures (thumbnail generation, metadata)
- HTTP error responses for invalid requests
- SSE client cleanup on disconnect/error
- Stale PID file cleanup on server check

### Port Management
- Auto-finds available port starting from requested port
- Checks up to 100 sequential ports
- Uses native Node.js `net` module for port testing

## Environment Variables
- `PORT`: Server port (default: 3000)
- No other environment variables required

## File Patterns
- Generated files use Base64 encoding: `Buffer.from(relativePath).toString('base64')`
- Thumbnail files: `{base64path}.jpg` (full resolution)
- Tiny preview files: `{base64path}_tiny.jpg` (64x64, for progressive loading)
- Metadata files: `{base64path}.json`
- PID file: `.gallery-cache/gallery.pid` (contains process ID as text)

## How It Works: Complete Flow

### 1. Installation & Global Command
1. User runs `npm install -g image-gallery-server` (or `npm link` for dev)
2. NPM installs package to global node_modules
3. NPM creates `gallery` symlink in global bin pointing to `bin/gallery.js`
4. User can now run `gallery` command from any directory

### 2. Starting a Gallery (`gallery up`)
1. **CLI Process** (`bin/gallery.js`):
   - Parses command arguments (directory, port, open browser)
   - Checks for existing PID file in current working directory
   - If server already running, opens browser and exits
   - Otherwise, spawns detached server process via `spawn()`
   - Passes configuration as JSON string argument
   - Exits immediately, returning control to terminal

2. **Server Process** (`bin/server-runner.js`):
   - Receives config from argv, parses JSON
   - Creates `.gallery-cache/` directory in working directory
   - Generates `index.html` with complete embedded UI
   - Writes PID file for process tracking
   - Finds available port (starting from requested)
   - Starts Express server
   - Opens browser if requested
   - Sets up file watcher on scan directory
   - Runs indefinitely until stopped

### 3. Initial Gallery Load
1. Browser requests `GET /` → serves `.gallery-cache/index.html`
2. Browser executes JavaScript → requests `GET /api/gallery`
3. Server scans directory recursively:
   - Collects all image/video files (skipping .gallery-cache)
   - Groups by directory
   - Checks for existing thumbnails (no generation yet)
   - Returns JSON with image list + existing thumbnail URLs
4. Browser renders gallery grid with images:
   - Images with thumbnails: display immediately
   - Images without thumbnails: show placeholder
5. Browser connects to `/progress` SSE endpoint
6. Browser reports visible items via `POST /api/viewport-items`

### 4. Progressive Thumbnail Generation
1. Server receives viewport items from browser
2. Moves viewport items to priority queue
3. For each visible item:
   - Generates tiny 64x64 preview
   - Broadcasts via SSE: `{type: 'tiny_preview_ready'}`
   - Browser updates image with blurred preview
4. For all items (viewport first, then background):
   - Generates full 300x300 thumbnail
   - Broadcasts via SSE: `{type: 'thumbnail_ready'}`
   - Browser updates image with full thumbnail
5. Processes in batches (5-10 items) with 50ms delays
6. Updates progress bar via SSE: `{type: 'global_thumbnail_progress'}`

### 5. File Watching & Auto-Updates
1. Chokidar watches scan directory for changes
2. On file add/remove:
   - Invalidates in-memory cache
   - Broadcasts cache invalidation via SSE
   - Browser can trigger rescan or auto-reload
3. On image deletion:
   - Removes corresponding thumbnail from `.gallery-cache/thumbnails/`

### 6. Stopping the Server (`gallery down`)
1. Reads PID from `.gallery-cache/gallery.pid`
2. Sends SIGTERM to process
3. Server receives signal:
   - Closes file watcher
   - Closes HTTP server
   - Exits gracefully
4. CLI removes PID file
5. Also searches for orphaned `server-runner.js` processes via `ps aux`

### 7. Cleanup Operations
- **`gallery cleanup`**: Scans thumbnails, deletes ones with missing source files
- **`gallery delete`**: Recursively finds and removes all `.gallery-cache/` directories
- **`gallery scan`**: Dry-run scan showing statistics without starting server

## Key Design Decisions

### Why .gallery-cache in Working Directory?
- **Portability**: Each directory has self-contained cache
- **No Global State**: Multiple galleries can run simultaneously
- **Easy Cleanup**: Delete directory to reset completely
- **User Control**: Users see and can manage cache files

### Why Detached Process?
- **Non-Blocking CLI**: User gets terminal back immediately
- **Background Operation**: Server continues after terminal closes
- **Process Management**: PID file enables stop/restart

### Why Dynamic HTML Generation?
- **Single Binary**: No need to copy files during install
- **Version Control**: UI updates with package updates
- **Customization**: Could add config-based customization later

### Why Base64 Filenames?
- **Path Safety**: Handles special chars, spaces, unicode
- **No Collisions**: Unique encoding for every path
- **Reversible**: Can decode to find original file
- **Cross-Platform**: Works on Windows, Mac, Linux

## File Patterns
- Generated files use Base64 encoding: `Buffer.from(relativePath).toString('base64')`
- Thumbnail files: `{base64path}.jpg`
- Metadata files: `{base64path}.json`
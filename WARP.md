# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a lightweight Node.js web server that creates dynamic image galleries from directories. It automatically scans directories for images, generates thumbnails using Sharp, and serves a responsive web interface.

## Key Architecture

### Core Components
- **server.js**: Main Express server handling gallery API, image serving, and thumbnail generation
- **metadata.js**: MetadataManager class for storing/retrieving image metadata as JSON files
- **public/index.html**: Single-page frontend with vanilla JavaScript gallery implementation

### Directory Structure
- `static/thumbnails/`: Auto-generated 300x300 JPEG thumbnails (gitignored)
- `metadata/`: JSON metadata files for images (gitignored)
- `public/`: Static web assets served to browsers

### Key Features
- Recursive directory scanning with security path validation
- Automatic thumbnail generation with caching using Sharp
- Base64 filename encoding for thumbnail/metadata file safety
- Responsive grid layout with modal image viewing
- REST API at `/api/gallery` returning directory-grouped image data

## Common Development Commands

### Running the Server
```bash
# Start server scanning current directory
npm start

# Development mode with file watching
npm run dev

# Scan specific directory
node server.js /path/to/images

# Use custom port
PORT=8080 npm start
```

### Installing Dependencies
```bash
npm install
```

## Important Technical Details

### Security Considerations
- Path traversal protection prevents access outside scan directory
- Only serves files with approved image extensions
- Base64 encoding prevents filename conflicts and injection

### Image Processing
- Thumbnails: 300x300 pixels, JPEG quality 80%, cover fit with center positioning
- Supported formats: jpg, jpeg, png, gif, bmp, webp, tiff, svg
- Lazy thumbnail generation (created only when requested)

### API Endpoints
- `GET /api/gallery`: Returns all images grouped by directory
- `GET /image/:path(*)`: Serves full-resolution images with path validation
- `GET /static/*`: Serves generated thumbnails
- `GET /`: Main gallery interface

### Metadata System
- JSON files stored in `metadata/` directory
- Filename: Base64-encoded relative image path + `.json`
- Default structure: tags, description, rating, lastUpdated
- MetadataManager provides CRUD operations and search functionality

## Development Notes

### Dependencies
- **express**: Web server framework
- **sharp**: High-performance image processing (requires native compilation)
- **multer**: File upload handling (imported but not actively used)

### Directory Exclusions
- Hidden directories (starting with `.`)
- `node_modules`
- Files outside scan directory (security)

### Error Handling
- Graceful handling of unreadable directories/files
- Console warnings for non-critical failures (thumbnail generation, metadata)
- HTTP error responses for invalid requests

## Environment Variables
- `PORT`: Server port (default: 3000)

## File Patterns
- Generated files use Base64 encoding: `Buffer.from(relativePath).toString('base64')`
- Thumbnail files: `{base64path}.jpg`
- Metadata files: `{base64path}.json`
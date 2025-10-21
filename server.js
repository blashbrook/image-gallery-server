#!/usr/bin/env node

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const net = require('net');

const app = express();
let PORT = process.env.PORT || 3000;

// Get the directory to scan from command line args or use parent directory
const SCAN_DIR = process.argv[2] || path.dirname(process.cwd());
const METADATA_DIR = path.join(__dirname, 'metadata');
const THUMBNAILS_DIR = path.join(__dirname, 'static', 'thumbnails');

// Supported media extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.ogg', '.m4v', '.3gp', '.wmv', '.flv'];

// Ensure required directories exist
async function ensureDirectories() {
    await fs.mkdir(METADATA_DIR, { recursive: true });
    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
    await fs.mkdir(path.join(__dirname, 'static'), { recursive: true });
}

// Check if file is an image
function isImage(filename) {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

// Check if file is a video
function isVideo(filename) {
    const ext = path.extname(filename).toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
}

// Check if file is media (image or video)
function isMedia(filename) {
    return isImage(filename) || isVideo(filename);
}

// Check if port is available
function checkPort(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
            server.once('close', () => {
                resolve(true);
            });
            server.close();
        });
        server.on('error', () => {
            resolve(false);
        });
    });
}

// Find next available port
async function findAvailablePort(startPort) {
    let port = startPort;
    while (port < startPort + 100) {
        if (await checkPort(port)) {
            return port;
        }
        port++;
    }
    throw new Error('No available port found');
}

// Broadcast progress to all SSE clients
function broadcastProgress() {
    const data = JSON.stringify(scanningState);
    sseClients.forEach(client => {
        try {
            client.write(`data: ${data}\n\n`);
        } catch (error) {
            sseClients.delete(client);
        }
    });
}

// Scan directory recursively for images
async function scanDirectory(dir, isRoot = false) {
    const images = [];
    
    if (isRoot) {
        scanningState.isScanning = true;
        scanningState.filesFound = 0;
        scanningState.directoriesScanned = 0;
        broadcastProgress();
    }
    
    try {
        scanningState.currentDirectory = path.relative(SCAN_DIR, dir) || 'Root';
        scanningState.directoriesScanned++;
        broadcastProgress();
        
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            
            if (item.isDirectory()) {
                // Skip hidden directories and node_modules
                if (!item.name.startsWith('.') && item.name !== 'node_modules') {
                    const subImages = await scanDirectory(fullPath, false);
                    images.push(...subImages);
                }
            } else if (item.isFile() && isMedia(item.name)) {
                const stats = await fs.stat(fullPath);
                images.push({
                    name: item.name,
                    path: fullPath,
                    relativePath: path.relative(SCAN_DIR, fullPath),
                    directory: path.relative(SCAN_DIR, dir) || '.',
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                    type: isImage(item.name) ? 'image' : 'video'
                });
                scanningState.filesFound++;
                
                // Update progress every 10 files to avoid too many updates
                if (scanningState.filesFound % 10 === 0) {
                    broadcastProgress();
                }
            }
        }
    } catch (error) {
        console.warn(`Unable to scan directory ${dir}:`, error.message);
    }
    
    if (isRoot) {
        scanningState.isScanning = false;
        scanningState.currentDirectory = 'Complete';
        broadcastProgress();
    }
    
    return images;
}

// Generate thumbnail for images (preserving aspect ratio)
async function generateImageThumbnail(imagePath, thumbnailPath) {
    try {
        await sharp(imagePath)
            .resize(300, 300, { 
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ quality: 80 })
            .toFile(thumbnailPath);
        return true;
    } catch (error) {
        console.warn(`Failed to generate thumbnail for ${imagePath}:`, error.message);
        return false;
    }
}

// Generate thumbnail (for both images and videos)
async function generateThumbnail(mediaPath, thumbnailPath, mediaType) {
    if (mediaType === 'image') {
        return await generateImageThumbnail(mediaPath, thumbnailPath);
    } else if (mediaType === 'video') {
        // For videos, create a simple placeholder thumbnail
        // In a production environment, you might use ffmpeg to extract a frame
        try {
            // Create a simple video placeholder using Sharp
            await sharp({
                create: {
                    width: 300,
                    height: 200,
                    channels: 3,
                    background: { r: 52, g: 73, b: 94 }
                }
            })
            .composite([{
                input: Buffer.from(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="30" fill="white" opacity="0.8"/>
                    <polygon points="40,35 40,65 65,50" fill="#2c3e50"/>
                </svg>`),
                left: 100,
                top: 50
            }])
            .jpeg({ quality: 80 })
            .toFile(thumbnailPath);
            return true;
        } catch (error) {
            console.warn(`Failed to generate video thumbnail for ${mediaPath}:`, error.message);
            return false;
        }
    }
    return false;
}

// Get or create thumbnail
async function getThumbnail(media) {
    const thumbnailName = `${Buffer.from(media.relativePath).toString('base64')}.jpg`;
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);
    
    try {
        await fs.access(thumbnailPath);
        return `/static/thumbnails/${thumbnailName}`;
    } catch {
        // Thumbnail doesn't exist, create it
        if (await generateThumbnail(media.path, thumbnailPath, media.type)) {
            return `/static/thumbnails/${thumbnailName}`;
        }
        return null;
    }
}

// Serve static files
app.use('/static', express.static('static'));
app.use('/public', express.static('public'));

// Global scanning state
let scanningState = {
    isScanning: false,
    currentDirectory: '',
    filesFound: 0,
    directoriesScanned: 0,
    progress: 0
};

let sseClients = new Set();

// Server-Sent Events endpoint for scanning progress
app.get('/api/scan-progress', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    
    sseClients.add(res);
    
    // Send current state immediately
    res.write(`data: ${JSON.stringify(scanningState)}\n\n`);
    
    req.on('close', () => {
        sseClients.delete(res);
    });
});

// API endpoint to get gallery data
app.get('/api/gallery', async (req, res) => {
    try {
        console.log(`Scanning directory: ${SCAN_DIR}`);
        const images = await scanDirectory(SCAN_DIR, true);
        
        // Group images by directory
        const galleries = {};
        
        for (const image of images) {
            if (!galleries[image.directory]) {
                galleries[image.directory] = [];
            }
            
            // Get thumbnail URL
            const thumbnailUrl = await getThumbnail(image);
            
            galleries[image.directory].push({
                ...image,
                thumbnail: thumbnailUrl,
                url: `/image/${encodeURIComponent(image.relativePath)}`
            });
        }
        
        res.json({
            scanDirectory: SCAN_DIR,
            totalImages: images.length,
            galleries
        });
    } catch (error) {
        console.error('Error scanning directory:', error);
        res.status(500).json({ error: 'Failed to scan directory' });
    }
});

// Serve individual images
app.get('/image/:path(*)', async (req, res) => {
    try {
        const imagePath = path.join(SCAN_DIR, decodeURIComponent(req.params.path));
        
        // Security check: ensure path is within scan directory
        const resolvedPath = path.resolve(imagePath);
        const resolvedScanDir = path.resolve(SCAN_DIR);
        
        if (!resolvedPath.startsWith(resolvedScanDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await fs.access(imagePath);
        res.sendFile(resolvedPath);
    } catch (error) {
        res.status(404).json({ error: 'Image not found' });
    }
});

// Serve the main gallery page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
async function startServer() {
    await ensureDirectories();
    
    // Find an available port
    PORT = await findAvailablePort(PORT);
    
    app.listen(PORT, () => {
        console.log(`🖼️  Image Gallery Server running on http://localhost:${PORT}`);
        console.log(`📁 Scanning directory: ${SCAN_DIR}`);
        console.log(`💡 To scan a different directory, run: node server.js /path/to/images`);
    });
}

startServer().catch(console.error);
#!/usr/bin/env node

// Server runner for background execution
// This file is executed as a detached child process

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const net = require('net');
const open = require('open').default;
const chokidar = require('chokidar');

// Configuration from command line arguments
const config = JSON.parse(process.argv[2]);
const { scanDir, port, openBrowser, packageDir } = config;

// Setup paths
const PUBLIC_DIR = path.join(packageDir, 'public');
const METADATA_DIR = path.join(process.cwd(), '.gallery-cache', 'metadata');
const THUMBNAILS_DIR = path.join(process.cwd(), '.gallery-cache', 'thumbnails');

// Supported media extensions
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.svg'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.ogg', '.m4v', '.3gp', '.wmv', '.flv'];

// Global scanning state
let scanningState = {
    isScanning: false,
    currentDirectory: '',
    filesFound: 0,
    directoriesScanned: 0,
    progress: 0
};

let sseClients = new Set();
let server;
let actualPort = port;

// Cache system
let galleryCache = {
    data: null,
    lastScan: 0,
    isStale: true
};

let fileWatcher = null;
const CACHE_DURATION = 30000; // 30 seconds cache

// Helper functions
function isImage(filename) {
    const ext = path.extname(filename).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

function isVideo(filename) {
    const ext = path.extname(filename).toLowerCase();
    return VIDEO_EXTENSIONS.includes(ext);
}

function isMedia(filename) {
    return isImage(filename) || isVideo(filename);
}

// Check if a file is likely a generated thumbnail
function isLikelyThumbnail(filePath, filename) {
    // Skip files in .gallery-cache directories
    if (filePath.includes('.gallery-cache')) {
        return true;
    }
    
    // Skip files that match thumbnail naming pattern (base64 encoded + .jpg)
    if (filename.match(/^[A-Za-z0-9+/]+=*\.jpg$/)) {
        return true;
    }
    
    // Skip common thumbnail directory patterns
    const thumbnailDirs = ['thumbnails', 'thumb', 'thumbs', '.thumbnails'];
    const dirParts = path.dirname(filePath).toLowerCase().split(path.sep);
    if (thumbnailDirs.some(thumbDir => dirParts.includes(thumbDir))) {
        return true;
    }
    
    return false;
}

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

async function scanDirectory(dir, isRoot = false) {
    const images = [];
    
    if (isRoot) {
        scanningState.isScanning = true;
        scanningState.filesFound = 0;
        scanningState.directoriesScanned = 0;
        broadcastProgress();
    }
    
    try {
        scanningState.currentDirectory = path.relative(scanDir, dir) || 'Root';
        scanningState.directoriesScanned++;
        broadcastProgress();
        
        const items = await fs.readdir(dir, { withFileTypes: true });
        
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            
            if (item.isDirectory()) {
                if (!item.name.startsWith('.') && item.name !== 'node_modules' && item.name !== '.gallery-cache') {
                    const subImages = await scanDirectory(fullPath, false);
                    images.push(...subImages);
                }
            } else if (item.isFile() && isMedia(item.name) && !isLikelyThumbnail(fullPath, item.name)) {
                const stats = await fs.stat(fullPath);
                images.push({
                    name: item.name,
                    path: fullPath,
                    relativePath: path.relative(scanDir, fullPath),
                    directory: path.relative(scanDir, dir) || '.',
                    size: stats.size,
                    modified: stats.mtime.toISOString(),
                    type: isImage(item.name) ? 'image' : 'video'
                });
                scanningState.filesFound++;
                
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

async function generateThumbnail(mediaPath, thumbnailPath, mediaType) {
    if (mediaType === 'image') {
        return await generateImageThumbnail(mediaPath, thumbnailPath);
    } else if (mediaType === 'video') {
        try {
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

async function getThumbnail(media) {
    const thumbnailName = `${Buffer.from(media.relativePath).toString('base64')}.jpg`;
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);
    
    try {
        await fs.access(thumbnailPath);
        return `/static/thumbnails/${thumbnailName}`;
    } catch {
        if (await generateThumbnail(media.path, thumbnailPath, media.type)) {
            return `/static/thumbnails/${thumbnailName}`;
        }
        return null;
    }
}

// Check if thumbnail exists without generating it
async function hasThumbnail(media) {
    const thumbnailName = `${Buffer.from(media.relativePath).toString('base64')}.jpg`;
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);
    
    try {
        await fs.access(thumbnailPath);
        return `/static/thumbnails/${thumbnailName}`;
    } catch {
        return null;
    }
}

// Broadcast thumbnail progress to clients
function broadcastThumbnailProgress(media, status, progress = 0) {
    const updateData = {
        type: 'thumbnail_progress',
        media: {
            relativePath: media.relativePath,
            name: media.name
        },
        status, // 'starting', 'processing', 'complete', 'error'
        progress // 0-100
    };
    
    sseClients.forEach(client => {
        try {
            client.write(`data: ${JSON.stringify(updateData)}\n\n`);
        } catch (error) {
            sseClients.delete(client);
        }
    });
}

// Generate thumbnail with progress updates
async function generateThumbnailWithProgress(media) {
    const thumbnailName = `${Buffer.from(media.relativePath).toString('base64')}.jpg`;
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);
    
    try {
        // Check if thumbnail already exists
        await fs.access(thumbnailPath);
        return `/static/thumbnails/${thumbnailName}`;
    } catch {
        // Thumbnail doesn't exist, generate it with progress
        broadcastThumbnailProgress(media, 'starting', 0);
        
        try {
            broadcastThumbnailProgress(media, 'processing', 25);
            
            if (media.type === 'image') {
                broadcastThumbnailProgress(media, 'processing', 50);
                await sharp(media.path)
                    .resize(300, 300, { 
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: 80 })
                    .toFile(thumbnailPath);
                broadcastThumbnailProgress(media, 'processing', 90);
            } else if (media.type === 'video') {
                broadcastThumbnailProgress(media, 'processing', 50);
                // Create video placeholder
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
                broadcastThumbnailProgress(media, 'processing', 90);
            }
            
            const thumbnailUrl = `/static/thumbnails/${thumbnailName}`;
            
            // Broadcast completion with final thumbnail
            const completionData = {
                type: 'thumbnail_ready',
                media: {
                    ...media,
                    thumbnail: thumbnailUrl,
                    url: `/image/${encodeURIComponent(media.relativePath)}`
                }
            };
            
            sseClients.forEach(client => {
                try {
                    client.write(`data: ${JSON.stringify(completionData)}\n\n`);
                } catch (error) {
                    sseClients.delete(client);
                }
            });
            
            broadcastThumbnailProgress(media, 'complete', 100);
            return thumbnailUrl;
            
        } catch (error) {
            console.warn(`Failed to generate thumbnail for ${media.path}:`, error.message);
            broadcastThumbnailProgress(media, 'error', 0);
            return null;
        }
    }
}

// Invalidate cache and broadcast update
function invalidateCache(reason = 'File system change') {
    console.log(`📁 Cache invalidated: ${reason}`);
    galleryCache.isStale = true;
    
    // Broadcast cache invalidation to connected clients
    const data = JSON.stringify({ 
        ...scanningState,
        cacheInvalidated: true,
        reason 
    });
    sseClients.forEach(client => {
        try {
            client.write(`data: ${data}\n\n`);
        } catch (error) {
            sseClients.delete(client);
        }
    });
}

// Setup file watching for automatic cache invalidation
function setupFileWatching() {
    if (fileWatcher) {
        fileWatcher.close();
    }
    
    console.log(`👀 Watching for file changes in: ${scanDir}`);
    
    fileWatcher = chokidar.watch(scanDir, {
        ignored: [
            /(^|[\/\\])\../, // ignore dotfiles
            '**/node_modules/**',
            '**/.gallery-cache/**'
        ],
        ignoreInitial: true,
        depth: 10 // Reasonable depth limit
    });
    
    const mediaExtensions = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];
    
    fileWatcher
        .on('add', (filePath) => {
            if (mediaExtensions.some(ext => filePath.toLowerCase().endsWith(ext))) {
                invalidateCache(`New file: ${path.basename(filePath)}`);
            }
        })
        .on('unlink', (filePath) => {
            if (mediaExtensions.some(ext => filePath.toLowerCase().endsWith(ext))) {
                invalidateCache(`Deleted file: ${path.basename(filePath)}`);
                // Also remove thumbnail if it exists
                const relativePath = path.relative(scanDir, filePath);
                const thumbnailName = `${Buffer.from(relativePath).toString('base64')}.jpg`;
                const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);
                fs.unlink(thumbnailPath)
                    .then(() => console.log(`🗑️  Removed thumbnail for: ${path.basename(filePath)}`))
                    .catch(() => {}); // Ignore errors if thumbnail doesn't exist
            }
        })
        .on('error', error => console.warn('File watcher error:', error));
}

// Clean up orphaned thumbnails
async function cleanupOrphanedThumbnails() {
    try {
        const thumbnailFiles = await fs.readdir(THUMBNAILS_DIR);
        let cleanedCount = 0;
        
        for (const thumbnailFile of thumbnailFiles) {
            if (!thumbnailFile.endsWith('.jpg')) continue;
            
            // Decode the original file path from base64 filename
            const base64Path = thumbnailFile.replace('.jpg', '');
            try {
                const originalPath = Buffer.from(base64Path, 'base64').toString('utf8');
                const fullOriginalPath = path.join(scanDir, originalPath);
                
                // Check if original file still exists
                try {
                    await fs.access(fullOriginalPath);
                } catch {
                    // Original file doesn't exist, remove thumbnail
                    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFile);
                    await fs.unlink(thumbnailPath);
                    console.log(`🧹 Cleaned orphaned thumbnail: ${thumbnailFile}`);
                    cleanedCount++;
                }
            } catch (error) {
                // Invalid base64 or other error, skip
                console.warn(`⚠️  Could not decode thumbnail filename: ${thumbnailFile}`);
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`✅ Cleaned up ${cleanedCount} orphaned thumbnails`);
        }
        
        return cleanedCount;
    } catch (error) {
        console.warn('Error during thumbnail cleanup:', error.message);
        return 0;
    }
}

// Get cached or fresh gallery data with progressive loading
async function getCachedGalleryData() {
    const now = Date.now();
    
    // Return cached data if still valid
    if (galleryCache.data && 
        !galleryCache.isStale && 
        (now - galleryCache.lastScan) < CACHE_DURATION) {
        console.log('📋 Using cached gallery data');
        return galleryCache.data;
    }
    
    // Scan and cache new data with progressive loading
    console.log('🔍 Scanning for fresh gallery data...');
    
    // Clean up orphaned thumbnails during fresh scan
    await cleanupOrphanedThumbnails();
    
    const images = await scanDirectory(scanDir, true);
    const galleries = {};
    const pendingThumbnails = [];
    
    // First pass: Add all images, checking for existing thumbnails
    for (const image of images) {
        if (!galleries[image.directory]) {
            galleries[image.directory] = [];
        }
        
        // Check if thumbnail already exists (no generation)
        const existingThumbnail = await hasThumbnail(image);
        
        const imageData = {
            ...image,
            thumbnail: existingThumbnail,
            url: `/image/${encodeURIComponent(image.relativePath)}`,
            thumbnailReady: !!existingThumbnail
        };
        
        galleries[image.directory].push(imageData);
        
        // Queue for thumbnail generation if needed
        if (!existingThumbnail) {
            pendingThumbnails.push(image);
        }
    }
    
    const result = {
        scanDirectory: scanDir,
        totalImages: images.length,
        galleries,
        lastScan: now,
        cached: false,
        pendingThumbnails: pendingThumbnails.length
    };
    
    // Update cache
    galleryCache.data = result;
    galleryCache.lastScan = now;
    galleryCache.isStale = false;
    
    // Start background thumbnail generation for pending items
    if (pendingThumbnails.length > 0) {
        console.log(`🖼️  Starting background generation of ${pendingThumbnails.length} thumbnails...`);
        
        // Don't await this - let it run in background
        generateThumbnailsInBackground(pendingThumbnails);
    }
    
    return result;
}

// Generate thumbnails in background with progress updates
async function generateThumbnailsInBackground(pendingImages) {
    const batchSize = 3; // Process 3 thumbnails concurrently
    
    for (let i = 0; i < pendingImages.length; i += batchSize) {
        const batch = pendingImages.slice(i, i + batchSize);
        
        // Process batch concurrently
        const promises = batch.map(async (image) => {
            try {
                await generateThumbnailWithProgress(image);
            } catch (error) {
                console.warn(`Failed to generate thumbnail for ${image.name}:`, error.message);
            }
        });
        
        await Promise.all(promises);
        
        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < pendingImages.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    console.log(`✅ Background thumbnail generation completed`);
}

// Write PID file for process management
async function writePidFile() {
    const pidFile = path.join(process.cwd(), '.gallery-cache', 'gallery.pid');
    await fs.writeFile(pidFile, process.pid.toString());
}

// Setup server
async function setupServer() {
    // Ensure required directories exist
    await fs.mkdir(METADATA_DIR, { recursive: true });
    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
    
    const app = express();
    
    // Serve static files
    app.use('/static', express.static(path.join(process.cwd(), '.gallery-cache')));
    app.use('/public', express.static(PUBLIC_DIR));
    
    // Server-Sent Events endpoint
    app.get('/api/scan-progress', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        
        sseClients.add(res);
        res.write(`data: ${JSON.stringify(scanningState)}\n\n`);
        
        req.on('close', () => {
            sseClients.delete(res);
        });
    });
    
    // API endpoint to get gallery data (cached)
    app.get('/api/gallery', async (req, res) => {
        try {
            const data = await getCachedGalleryData();
            res.json(data);
        } catch (error) {
            console.error('Error getting gallery data:', error);
            res.status(500).json({ error: 'Failed to get gallery data' });
        }
    });
    
    // API endpoint to force rescan
    app.post('/api/rescan', async (req, res) => {
        try {
            console.log('🔄 Manual rescan requested');
            invalidateCache('Manual rescan');
            const data = await getCachedGalleryData();
            res.json({ message: 'Rescan completed', ...data });
        } catch (error) {
            console.error('Error during rescan:', error);
            res.status(500).json({ error: 'Failed to rescan' });
        }
    });
    
    // API endpoint to get cache status
    app.get('/api/cache-status', (req, res) => {
        res.json({
            cached: !!galleryCache.data,
            lastScan: galleryCache.lastScan,
            isStale: galleryCache.isStale,
            cacheDuration: CACHE_DURATION,
            age: galleryCache.lastScan ? Date.now() - galleryCache.lastScan : null
        });
    });
    
    // Serve individual images
    app.get('/image/:path(*)', async (req, res) => {
        try {
            const imagePath = path.join(scanDir, decodeURIComponent(req.params.path));
            const resolvedPath = path.resolve(imagePath);
            const resolvedScanDir = path.resolve(scanDir);
            
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
        res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
    });
    
    return app;
}

// Start server
async function startServer() {
    try {
        const app = await setupServer();
        actualPort = await findAvailablePort(port);
        
        server = app.listen(actualPort, () => {
            console.log(`▦ Gallery server started on http://localhost:${actualPort}`);
            console.log(`📁 Scanning: ${scanDir}`);
            
            if (openBrowser) {
                setTimeout(() => {
                    open(`http://localhost:${actualPort}`);
                }, 1000);
            }
        });
        
        await writePidFile();
        
        // Setup file watching for automatic updates
        setupFileWatching();
        
        // Handle graceful shutdown
        const shutdown = () => {
            console.log('\n🔄 Shutting down gallery server...');
            if (fileWatcher) {
                fileWatcher.close();
            }
            server.close(() => {
                process.exit(0);
            });
        };
        
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();
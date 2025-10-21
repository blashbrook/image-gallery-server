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

// Setup paths - everything goes in .gallery-cache in the working directory
const GALLERY_CACHE_DIR = path.join(process.cwd(), '.gallery-cache');
const METADATA_DIR = path.join(GALLERY_CACHE_DIR, 'metadata');
const THUMBNAILS_DIR = path.join(GALLERY_CACHE_DIR, 'thumbnails');
const HTML_FILE = path.join(GALLERY_CACHE_DIR, 'index.html');

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

// Performance configuration for thumbnail generation
const THUMBNAIL_CONFIG = {
    // Adaptive batch sizes based on gallery size
    batchSize: {
        large: 10,    // For 500+ images (3.3x faster)
        medium: 6,    // For 100-500 images (2x faster)
        small: 3      // For <100 images (original speed, more responsive)
    },
    // How often to broadcast progress (reduces SSE overhead)
    broadcastRatio: 50,  // Broadcast every N images (1/50th of total, min 10)
    // Delay between batches (ms)
    batchDelay: {
        large: 50,    // Minimal delay for large galleries
        small: 100    // Slightly longer for small galleries
    },
    // Thumbnail quality settings
    quality: {
        jpeg: 80,     // JPEG quality (1-100)
        size: 300     // Max dimension in pixels
    }
};

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
    broadcastToClients(scanningState);
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

// Broadcast data to SSE clients with robust error handling
function broadcastToClients(data) {
    const clientsToRemove = [];
    
    sseClients.forEach(client => {
        try {
            // Check if client is still writable
            if (client.destroyed || client.writableEnded) {
                clientsToRemove.push(client);
                return;
            }
            
            client.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (error) {
            console.warn('SSE client write error:', error.message);
            clientsToRemove.push(client);
        }
    });
    
    // Clean up disconnected clients
    clientsToRemove.forEach(client => {
        sseClients.delete(client);
    });
    
    if (clientsToRemove.length > 0) {
        console.log(`🧹 Cleaned up ${clientsToRemove.length} disconnected SSE clients`);
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
    
    broadcastToClients(updateData);
}

// Fast thumbnail generation without tiny previews (for large galleries)
async function generateThumbnailFast(media) {
    const thumbnailName = `${Buffer.from(media.relativePath).toString('base64')}.jpg`;
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);
    
    try {
        // Check if thumbnail already exists
        await fs.access(thumbnailPath);
        return `/static/thumbnails/${thumbnailName}`;
    } catch {
        // Generate thumbnail without progress broadcasts
        const size = THUMBNAIL_CONFIG.quality.size;
        const quality = THUMBNAIL_CONFIG.quality.jpeg;
        
        if (media.type === 'image') {
            await sharp(media.path)
                .resize(size, size, { 
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .jpeg({ quality })
                .toFile(thumbnailPath);
        } else {
            // Create video placeholder
            await sharp({
                create: {
                    width: size,
                    height: Math.round(size * 0.67),
                    channels: 3,
                    background: { r: 52, g: 73, b: 94 }
                }
            })
            .composite([{
                input: Buffer.from(`<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="30" fill="white" opacity="0.8"/>
                    <polygon points="40,35 40,65 65,50" fill="#2c3e50"/>
                </svg>`),
                left: Math.round(size / 3),
                top: Math.round(size / 6)
            }])
            .jpeg({ quality })
            .toFile(thumbnailPath);
        }
        
        const thumbnailUrl = `/static/thumbnails/${thumbnailName}`;
        
        // Minimal broadcast for completion (batched updates will show progress)
        broadcastToClients({
            type: 'thumbnail_ready',
            media: {
                ...media,
                thumbnail: thumbnailUrl,
                url: `/image/${encodeURIComponent(media.relativePath)}`
            }
        });
        
        return thumbnailUrl;
    }
}

// Generate tiny preview (64x64) for instant feedback - kept for small galleries
async function generateTinyPreview(media) {
    const previewName = `${Buffer.from(media.relativePath).toString('base64')}_tiny.jpg`;
    const previewPath = path.join(THUMBNAILS_DIR, previewName);
    
    try {
        if (media.type === 'image') {
            await sharp(media.path)
                .resize(64, 64, { 
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 60 })
                .toFile(previewPath);
        } else {
            // Simple tiny video placeholder
            await sharp({
                create: {
                    width: 64,
                    height: 64,
                    channels: 3,
                    background: { r: 52, g: 73, b: 94 }
                }
            })
            .composite([{
                input: Buffer.from(`<svg width="20" height="20" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="10" cy="10" r="8" fill="white" opacity="0.8"/>
                    <polygon points="7,6 7,14 15,10" fill="#2c3e50"/>
                </svg>`),
                left: 22,
                top: 22
            }])
            .jpeg({ quality: 60 })
            .toFile(previewPath);
        }
        return `/static/thumbnails/${previewName}`;
    } catch (error) {
        console.warn(`Failed to generate tiny preview for ${media.path}:`, error.message);
        return null;
    }
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
        
        // First, generate a tiny preview for instant feedback
        const tinyPreview = await generateTinyPreview(media);
        if (tinyPreview) {
            const previewData = {
                type: 'tiny_preview_ready',
                media: {
                    ...media,
                    tinyPreview,
                    url: `/image/${encodeURIComponent(media.relativePath)}`
                }
            };
            
            broadcastToClients(previewData);
        }
        
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
            
            broadcastToClients(completionData);
            
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
    broadcastToClients({ 
        ...scanningState,
        cacheInvalidated: true,
        reason 
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
        
        // Sort by directory and filename for consistent visual order (top-left to bottom-right)
        const sortedThumbnails = pendingThumbnails.sort((a, b) => {
            // First sort by directory
            const dirCompare = a.directory.localeCompare(b.directory);
            if (dirCompare !== 0) return dirCompare;
            // Then sort by filename within directory
            return a.name.localeCompare(b.name);
        });
        
        // Don't await this - let it run in background
        generateThumbnailsInBackground(sortedThumbnails);
    }
    
    return result;
}

// Global thumbnail generation state
let thumbnailGenerationState = {
    isGenerating: false,
    total: 0,
    completed: 0,
    currentFile: '',
    progress: 0
};

// Broadcast global thumbnail progress
function broadcastGlobalProgress() {
    broadcastToClients({
        type: 'global_thumbnail_progress',
        ...thumbnailGenerationState
    });
}

// Generate thumbnails in background with progress updates
async function generateThumbnailsInBackground(pendingImages) {
    // Adaptive batch size based on gallery size
    const batchSize = pendingImages.length > 500 
        ? THUMBNAIL_CONFIG.batchSize.large
        : (pendingImages.length > 100 
            ? THUMBNAIL_CONFIG.batchSize.medium 
            : THUMBNAIL_CONFIG.batchSize.small);
    
    const broadcastInterval = Math.max(10, Math.floor(pendingImages.length / THUMBNAIL_CONFIG.broadcastRatio));
    
    let processedCount = 0;
    let errorCount = 0;
    let lastBroadcast = 0;
    
    // Initialize global progress state
    thumbnailGenerationState = {
        isGenerating: true,
        total: pendingImages.length,
        completed: 0,
        currentFile: '',
        progress: 0
    };
    
    broadcastGlobalProgress();
    
    console.log(`🔄 Processing ${pendingImages.length} thumbnails in batches of ${batchSize}...`);
    console.log(`⚡ Optimized mode: Broadcasting every ${broadcastInterval} images`);
    
    for (let i = 0; i < pendingImages.length; i += batchSize) {
        const batch = pendingImages.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(pendingImages.length / batchSize);
        
        // Only log every 10th batch for large galleries
        if (batchNumber % 10 === 1 || pendingImages.length < 100) {
            console.log(`🖼️  Processing batch ${batchNumber}/${totalBatches}`);
        }
        
        // Process batch concurrently with individual error handling
        const promises = batch.map(async (image) => {
            try {
                await generateThumbnailFast(image);
                processedCount++;
                
                // Only broadcast periodically to reduce overhead
                const shouldBroadcast = (processedCount - lastBroadcast) >= broadcastInterval;
                if (shouldBroadcast) {
                    thumbnailGenerationState.completed = processedCount + errorCount;
                    thumbnailGenerationState.progress = Math.round((thumbnailGenerationState.completed / thumbnailGenerationState.total) * 100);
                    thumbnailGenerationState.currentFile = image.name;
                    broadcastGlobalProgress();
                    lastBroadcast = processedCount;
                }
                
                return { success: true, image };
            } catch (error) {
                errorCount++;
                console.warn(`✗ Failed: ${image.name} - ${error.message}`);
                return { success: false, image, error };
            }
        });
        
        try {
            await Promise.all(promises);
        } catch (error) {
            console.error(`❗ Batch ${batchNumber} failed:`, error.message);
            errorCount += batch.length;
        }
        
        // Minimal delay for large galleries, slightly longer for small ones
        if (i + batchSize < pendingImages.length) {
            const delay = pendingImages.length > 500 
                ? THUMBNAIL_CONFIG.batchDelay.large 
                : THUMBNAIL_CONFIG.batchDelay.small;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    const totalProcessed = processedCount + errorCount;
    
    // Mark global progress as complete
    thumbnailGenerationState = {
        isGenerating: false,
        total: pendingImages.length,
        completed: totalProcessed,
        currentFile: '',
        progress: 100
    };
    broadcastGlobalProgress();
    
    console.log(`✅ Background thumbnail generation completed`);
    console.log(`📊 Final stats: ${processedCount} success, ${errorCount} errors, ${totalProcessed}/${pendingImages.length} processed`);
    
    // Clean up any stale SSE connections
    console.log(`🌐 Active SSE connections: ${sseClients.size}`);
}

// Generate the index.html file in .gallery-cache
async function generateIndexHTML() {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gallery</title>
    <style>
        :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f8f9fa;
            --text-primary: #2c3e50;
            --text-secondary: #7f8c8d;
            --modal-bg: rgba(0,0,0,0.95);
            --button-bg: rgba(255,255,255,0.15);
            --button-bg-hover: rgba(255,255,255,0.25);
            --button-text: #ffffff;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: var(--bg-secondary);
            color: var(--text-primary);
        }
        .header {
            background: var(--bg-primary);
            padding: 0.75rem 1.5rem;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            margin-bottom: 1.5rem;
            position: sticky;
            top: 0;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header-left { display: flex; align-items: center; gap: 0.75rem; }
        .header-icon { width: 28px; height: 28px; }
        .header-content h1 { font-size: 1.5rem; margin: 0; line-height: 1.2; }
        .header-path { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.15rem; }
        .info { font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.25rem; }
        .header-actions { display: flex; gap: 0.5rem; align-items: center; }
        .header-btn {
            padding: 0.4rem 0.75rem;
            border: 1px solid rgba(0,0,0,0.1);
            background: var(--bg-secondary);
            color: var(--text-primary);
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: all 0.2s;
        }
        .header-btn:hover { background: #e9ecef; transform: translateY(-1px); }
        .gallery { column-count: 5; column-gap: 15px; padding: 0 2rem 2rem; }
        .gallery-item {
            break-inside: avoid;
            margin-bottom: 15px;
            cursor: pointer;
            transition: transform 0.2s;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .gallery-item:hover { transform: translateY(-5px); box-shadow: 0 8px 20px rgba(0,0,0,0.15); }
        .gallery-item img { width: 100%; height: auto; display: block; }
        .modal {
            display: none;
            position: fixed;
            z-index: 2000;
            left: 0; top: 0;
            width: 100%; height: 100%;
            background-color: var(--modal-bg);
            justify-content: center;
            align-items: center;
        }
        .modal.active { display: flex; }
        .modal-image {
            max-width: 90%; max-height: 90%;
            object-fit: contain;
            border-radius: 8px;
            cursor: grab;
        }
        .modal-image.panning { cursor: grabbing; }
        .modal-video { max-width: 90%; max-height: 90%; border-radius: 8px; }
        /* Round, Visible Close Button */
        .close {
            position: fixed; top: 20px; right: 20px;
            width: 56px; height: 56px; border-radius: 50%;
            background: var(--button-bg); backdrop-filter: blur(10px);
            border: 2px solid rgba(255,255,255,0.3);
            color: var(--button-text); font-size: 28px;
            cursor: pointer; z-index: 2001;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .close:hover { background: var(--button-bg-hover); transform: scale(1.1) rotate(90deg); box-shadow: 0 6px 20px rgba(0,0,0,0.6); }
        .zoom-controls {
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            display: none; gap: 12px; z-index: 2001;
        }
        .zoom-controls.active { display: flex; }
        .zoom-btn {
            width: 48px; height: 48px; border-radius: 50%;
            background: var(--button-bg); backdrop-filter: blur(10px);
            border: 2px solid rgba(255,255,255,0.3);
            color: var(--button-text); font-size: 22px;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .zoom-btn:hover { background: var(--button-bg-hover); transform: scale(1.15); box-shadow: 0 6px 20px rgba(0,0,0,0.6); }
        .zoom-info {
            position: fixed; top: 30px; left: 30px;
            background: var(--button-bg); backdrop-filter: blur(10px);
            border: 2px solid rgba(255,255,255,0.3);
            color: var(--button-text); padding: 10px 20px; border-radius: 24px;
            font-size: 14px; font-weight: 600; z-index: 2001;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: none;
        }
        .zoom-info.active { display: block; }
        @media (max-width: 1200px) { .gallery { column-count: 4; } }
        @media (max-width: 900px) { .gallery { column-count: 3; } }
        @media (max-width: 600px) { .gallery { column-count: 2; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="header-left">
            <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
            </svg>
            <div class="header-content">
                <h1>Gallery</h1>
                <div class="header-path" id="gallery-path"></div>
                <div class="info" id="gallery-info">Loading...</div>
            </div>
        </div>
        <div class="header-actions">
            <button class="header-btn" id="rescanBtn" onclick="rescanGallery()">🔄 Rescan</button>
            <button class="header-btn" id="themeBtn" onclick="toggleTheme()">🌙 Theme</button>
        </div>
    </div>
    <div class="gallery" id="gallery"></div>
    <div class="modal" id="imageModal">
        <div class="close" id="closeModal">✕</div>
        <div class="zoom-info" id="zoomInfo">100%</div>
        <img class="modal-image" id="modalImage" style="display: none;">
        <video class="modal-video" id="modalVideo" controls style="display: none;"></video>
        <div class="zoom-controls" id="zoomControls">
            <button class="zoom-btn" id="zoomOut">−</button>
            <button class="zoom-btn" id="resetZoom">⌂</button>
            <button class="zoom-btn" id="zoomIn">+</button>
        </div>
    </div>
    <script>
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');
        const modalVideo = document.getElementById('modalVideo');
        const zoomControls = document.getElementById('zoomControls');
        const zoomInfo = document.getElementById('zoomInfo');
        let scale = 1, translateX = 0, translateY = 0, isDragging = false, lastX = 0, lastY = 0;
        
        async function loadGallery() {
            const response = await fetch('/api/gallery');
            const data = await response.json();
            document.getElementById('gallery-info').textContent = 'Found ' + data.totalImages + ' media files';
            document.getElementById('gallery-path').textContent = window.location.hostname + ':' + window.location.port;
            Object.values(data.galleries).flat().forEach(media => {
                const item = document.createElement('div');
                item.className = 'gallery-item';
                const img = document.createElement('img');
                img.src = media.thumbnail;
                img.alt = media.name;
                img.loading = 'lazy';
                item.appendChild(img);
                item.onclick = () => openModal(media);
                document.getElementById('gallery').appendChild(item);
            });
        }
        
        async function rescanGallery() {
            document.getElementById('rescanBtn').textContent = '⏳ Scanning...';
            try {
                await fetch('/api/rescan', { method: 'POST' });
                window.location.reload();
            } catch (e) {
                document.getElementById('rescanBtn').textContent = '❌ Error';
                setTimeout(() => { document.getElementById('rescanBtn').textContent = '🔄 Rescan'; }, 2000);
            }
        }
        
        function toggleTheme() {
            const root = document.documentElement;
            const btn = document.getElementById('themeBtn');
            const current = root.style.getPropertyValue('--bg-primary') || '#ffffff';
            if (current === '#ffffff') {
                root.style.setProperty('--bg-primary', '#1a1a1a');
                root.style.setProperty('--bg-secondary', '#2d2d2d');
                root.style.setProperty('--text-primary', '#e0e0e0');
                root.style.setProperty('--text-secondary', '#a0a0a0');
                btn.textContent = '☀️ Theme';
            } else {
                root.style.setProperty('--bg-primary', '#ffffff');
                root.style.setProperty('--bg-secondary', '#f8f9fa');
                root.style.setProperty('--text-primary', '#2c3e50');
                root.style.setProperty('--text-secondary', '#7f8c8d');
                btn.textContent = '🌙 Theme';
            }
        }
        
        function openModal(media) {
            if (media.type === 'video') {
                modalImg.style.display = 'none';
                modalVideo.style.display = 'block';
                modalVideo.src = media.url;
                zoomControls.classList.remove('active');
                zoomInfo.classList.remove('active');
            } else {
                modalVideo.style.display = 'none';
                modalImg.style.display = 'block';
                modalImg.src = media.url;
                zoomControls.classList.add('active');
                zoomInfo.classList.add('active');
                resetZoom();
            }
            modal.classList.add('active');
        }
        
        function closeModal() {
            modal.classList.remove('active');
            if (modalVideo.style.display === 'block') { modalVideo.pause(); modalVideo.src = ''; }
            modalImg.src = ''; resetZoom();
        }
        
        function zoom(delta) {
            scale = Math.max(0.1, Math.min(5, scale + delta));
            modalImg.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
            zoomInfo.textContent = Math.round(scale * 100) + '%';
        }
        
        function resetZoom() { scale = 1; translateX = 0; translateY = 0; zoom(0); }
        
        document.getElementById('closeModal').onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
        document.getElementById('zoomIn').onclick = () => zoom(0.2);
        document.getElementById('zoomOut').onclick = () => zoom(-0.2);
        document.getElementById('resetZoom').onclick = resetZoom;
        modalImg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY > 0 ? -0.1 : 0.1); });
        modalImg.addEventListener('mousedown', (e) => { if (scale > 1) { isDragging = true; lastX = e.clientX; lastY = e.clientY; e.preventDefault(); } });
        document.addEventListener('mousemove', (e) => { if (isDragging) { translateX += e.clientX - lastX; translateY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; zoom(0); } });
        document.addEventListener('mouseup', () => { isDragging = false; });
        loadGallery();
    </script>
</body>
</html>`;
    
    await fs.writeFile(HTML_FILE, htmlContent, 'utf8');
    console.log(`✅ Generated index.html in .gallery-cache`);
}

// Write PID file for process management
async function writePidFile() {
    const pidFile = path.join(GALLERY_CACHE_DIR, 'gallery.pid');
    await fs.writeFile(pidFile, process.pid.toString());
}

// Setup server
async function setupServer() {
    // Ensure required directories exist
    await fs.mkdir(METADATA_DIR, { recursive: true });
    await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
    
    // Generate the index.html file
    await generateIndexHTML();
    
    const app = express();
    
    // Serve static files from .gallery-cache
    app.use('/static', express.static(GALLERY_CACHE_DIR));
    
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
            age: galleryCache.lastScan ? Date.now() - galleryCache.lastScan : null,
            sseClients: sseClients.size
        });
    });
    
    // Debug endpoint to check server status
    app.get('/api/debug', (req, res) => {
        res.json({
            serverStatus: 'running',
            scanningState,
            galleryCache: {
                hasData: !!galleryCache.data,
                lastScan: galleryCache.lastScan,
                isStale: galleryCache.isStale,
                pendingThumbnails: galleryCache.data?.pendingThumbnails || 0
            },
            connections: {
                sseClients: sseClients.size
            },
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            }
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
    
    // Serve the main gallery page from .gallery-cache
    app.get('/', (req, res) => {
        res.sendFile(HTML_FILE);
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
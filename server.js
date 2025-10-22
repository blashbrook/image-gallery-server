#!/usr/bin/env node

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const net = require('net');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

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
    await fs.mkdir(GALLERY_CACHE_DIR, { recursive: true });
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

// Check if a file is likely a generated thumbnail
function isLikelyThumbnail(filePath, filename) {
    // Skip files in static/thumbnails or metadata directories
    if (filePath.includes('static' + path.sep + 'thumbnails') || filePath.includes('metadata')) {
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

// Generate gallery HTML file
async function generateGalleryHTML() {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Gallery</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
            background: #1a1a1a;
            color: #fff;
            padding: 20px;
        }

        .header {
            max-width: 1400px;
            margin: 0 auto 40px;
        }

        .header h1 {
            font-size: 2rem;
            margin-bottom: 10px;
        }

        .header .info {
            font-size: 0.9rem;
            color: #999;
        }

        .loading {
            text-align: center;
            padding: 40px;
            color: #999;
        }

        .spinner {
            display: inline-block;
            width: 30px;
            height: 30px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 0.8s linear infinite;
            margin-right: 10px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .gallery-container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .gallery-section {
            margin-bottom: 50px;
        }

        .gallery-title {
            font-size: 1.3rem;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #333;
            color: #ccc;
        }

        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
        }

        .thumbnail-item {
            position: relative;
            aspect-ratio: 1;
            background: #2a2a2a;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            border: 1px solid #333;
        }

        .thumbnail-item:hover {
            transform: scale(1.02);
            box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
        }

        .thumbnail-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .thumbnail-item.loading-state {
            background: linear-gradient(90deg, #333 0%, #444 50%, #333 100%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        .video-badge {
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(0, 0, 0, 0.7);
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.active {
            display: flex;
        }

        .modal-content {
            position: relative;
            max-width: 90vw;
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .modal-image {
            max-width: 100%;
            max-height: 80vh;
            border-radius: 8px;
        }

        .modal-close {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            border: none;
            color: #fff;
            font-size: 2rem;
            cursor: pointer;
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background 0.2s;
        }

        .modal-close:hover {
            background: rgba(0, 0, 0, 0.9);
        }

        .modal-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0, 0, 0, 0.7);
            border: none;
            color: #fff;
            font-size: 1.5rem;
            cursor: pointer;
            padding: 20px;
            border-radius: 8px;
            transition: background 0.2s;
        }

        .modal-nav:hover {
            background: rgba(0, 0, 0, 0.9);
        }

        .modal-nav.prev {
            left: 20px;
        }

        .modal-nav.next {
            right: 20px;
        }

        .error-message {
            color: #ff6b6b;
            text-align: center;
            padding: 20px;
            background: rgba(255, 107, 107, 0.1);
            border-radius: 8px;
            margin: 20px auto;
            max-width: 1400px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🖼️ Image Gallery</h1>
        <div class="info">
            <span id="stats">Loading...</span>
        </div>
    </div>

    <div class="loading" id="initialLoading">
        <div class="spinner"></div>
        <span>Scanning directory...</span>
    </div>

    <div id="error" class="error-message" style="display: none;"></div>

    <div class="gallery-container" id="gallery" style="display: none;"></div>

    <!-- Modal for full-size image viewing -->
    <div class="modal" id="modal">
        <button class="modal-close" onclick="closeModal()">×</button>
        <button class="modal-nav prev" onclick="prevImage()">‹</button>
        <div class="modal-content">
            <img class="modal-image" id="modalImage" />
        </div>
        <button class="modal-nav next" onclick="nextImage()">›</button>
    </div>

    <script>
        let galleryData = null;
        let useLazyLoading = false;
        let allImages = [];
        let currentImageIndex = 0;
        let imageObserver = null;

        // Load gallery data
        async function loadGallery() {
            try {
                const response = await fetch('/api/gallery');
                galleryData = await response.json();
                useLazyLoading = galleryData.useLazyLoading;
                
                document.getElementById('initialLoading').style.display = 'none';
                renderGallery();
                
                if (useLazyLoading) {
                    setupLazyLoading();
                }
                
                document.getElementById('gallery').style.display = 'block';
                updateStats();
            } catch (error) {
                showError('Failed to load gallery: ' + error.message);
            }
        }

        // Render gallery sections
        function renderGallery() {
            const gallery = document.getElementById('gallery');
            gallery.innerHTML = '';
            
            Object.entries(galleryData.galleries).forEach(([directory, images]) => {
                const section = document.createElement('div');
                section.className = 'gallery-section';
                
                const title = document.createElement('h2');
                title.className = 'gallery-title';
                title.textContent = directory === '.' ? 'Root Directory' : directory;
                section.appendChild(title);
                
                const grid = document.createElement('div');
                grid.className = 'gallery-grid';
                
                images.forEach(image => {
                    allImages.push(image);
                    const item = createThumbnailItem(image);
                    grid.appendChild(item);
                });
                
                section.appendChild(grid);
                gallery.appendChild(section);
            });
        }

        // Create thumbnail item element
        function createThumbnailItem(image) {
            const item = document.createElement('div');
            item.className = 'thumbnail-item';
            if (useLazyLoading) {
                item.classList.add('loading-state');
            }
            item.id = 'img-' + btoa(image.relativePath);
            
            const img = document.createElement('img');
            img.src = image.thumbnail;
            img.alt = image.name;
            img.dataset.relativePath = image.relativePath;
            img.dataset.index = allImages.length - 1;
            
            if (image.type === 'video') {
                const badge = document.createElement('div');
                badge.className = 'video-badge';
                badge.innerHTML = '▶ VIDEO';
                item.appendChild(badge);
            }
            
            item.appendChild(img);
            item.addEventListener('click', () => openModal(allImages.length - 1));
            
            return item;
        }

        // Setup lazy loading with Intersection Observer
        function setupLazyLoading() {
            imageObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const relativePath = img.dataset.relativePath;
                        
                        // Load high-res thumbnail
                        loadHighResThumbnail(relativePath, img);
                        imageObserver.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '100px' // Start loading 100px before visible
            });
            
            // Observe all images
            document.querySelectorAll('.gallery-grid img').forEach(img => {
                imageObserver.observe(img);
            });
        }

        // Load high-resolution thumbnail
        async function loadHighResThumbnail(relativePath, imgElement) {
            try {
                const response = await fetch('/api/thumbnail/' + encodeURIComponent(relativePath));
                const data = await response.json();
                
                if (data.thumbnail) {
                    imgElement.src = data.thumbnail;
                    imgElement.parentElement.classList.remove('loading-state');
                }
            } catch (error) {
                console.warn('Failed to load high-res thumbnail for ' + relativePath + ':', error);
            }
        }

        // Modal functions
        function openModal(index) {
            currentImageIndex = index;
            const image = allImages[index];
            const modalImage = document.getElementById('modalImage');
            modalImage.src = image.url;
            document.getElementById('modal').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeModal() {
            document.getElementById('modal').classList.remove('active');
            document.body.style.overflow = 'auto';
        }

        function nextImage() {
            currentImageIndex = (currentImageIndex + 1) % allImages.length;
            openModal(currentImageIndex);
        }

        function prevImage() {
            currentImageIndex = (currentImageIndex - 1 + allImages.length) % allImages.length;
            openModal(currentImageIndex);
        }

        // Update statistics
        function updateStats() {
            const total = galleryData.totalImages;
            const modeText = useLazyLoading ? ' (Lazy Loading Enabled)' : '';
            document.getElementById('stats').textContent = 'Total: ' + total + ' images' + modeText;
        }

        // Show error message
        function showError(message) {
            document.getElementById('initialLoading').style.display = 'none';
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!document.getElementById('modal').classList.contains('active')) return;
            
            if (e.key === 'ArrowRight') nextImage();
            else if (e.key === 'ArrowLeft') prevImage();
            else if (e.key === 'Escape') closeModal();
        });

        // Close modal on background click
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('modal')) closeModal();
        });

        // Load gallery on page load
        window.addEventListener('load', loadGallery);
    </script>
</body>
</html>`;

    try {
        await fs.writeFile(GENERATED_HTML_FILE, html);
        console.log(`Generated gallery HTML to ${GENERATED_HTML_FILE}`);
    } catch (error) {
        console.warn(`Failed to generate gallery HTML:`, error.message);
    }
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
            } else if (item.isFile() && isMedia(item.name) && !isLikelyThumbnail(fullPath, item.name)) {
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

// Extract frame from video using FFmpeg
async function extractVideoFrame(videoPath, outputPath, timeSeconds = 1) {
    try {
        await execFileAsync('ffmpeg', [
            '-ss', timeSeconds.toString(),
            '-i', videoPath,
            '-vf', 'scale=300:300:force_original_aspect_ratio=decrease,pad=300:300:(ow-iw)/2:(oh-ih)/2:color=black',
            '-vframes', '1',
            '-f', 'image2',
            '-y',
            outputPath
        ]);
        return true;
    } catch (error) {
        console.warn(`Failed to extract frame from ${videoPath}:`, error.message);
        return false;
    }
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

// Generate low-resolution thumbnail for lazy loading
async function generateLowResVideoThumbnail(videoPath, thumbnailPath) {
    try {
        // Extract a frame and resize to low-res
        const tempFramePath = thumbnailPath.replace('.jpg', '_temp.jpg');
        const frameExtracted = await extractVideoFrame(videoPath, tempFramePath);
        
        if (frameExtracted) {
            await sharp(tempFramePath)
                .resize(150, 150, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 40, progressive: true })
                .toFile(thumbnailPath);
            
            // Clean up temp file
            try {
                await fs.unlink(tempFramePath);
            } catch (e) {
                // Ignore cleanup errors
            }
            return true;
        }
        return false;
    } catch (error) {
        console.warn(`Failed to generate low-res video thumbnail for ${videoPath}:`, error.message);
        return false;
    }
}

// Generate thumbnail (for both images and videos)
async function generateThumbnail(mediaPath, thumbnailPath, mediaType) {
    if (mediaType === 'image') {
        return await generateImageThumbnail(mediaPath, thumbnailPath);
    } else if (mediaType === 'video') {
        try {
            // Try to extract a frame from the video using FFmpeg
            const frameExtracted = await extractVideoFrame(mediaPath, thumbnailPath);
            
            if (frameExtracted) {
                // Optimize the extracted frame with Sharp
                try {
                    await sharp(thumbnailPath)
                        .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toFile(thumbnailPath);
                } catch (error) {
                    // If optimization fails, use the extracted frame as-is
                    console.warn(`Failed to optimize video frame, using as-is:`, error.message);
                }
                return true;
            }
            
            // Fallback: create a simple placeholder if FFmpeg fails
            console.warn(`FFmpeg extraction failed for ${mediaPath}, using placeholder`);
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

// Get or create thumbnail with specified resolution
async function getThumbnail(media, resolution = 'high') {
    const base64Name = Buffer.from(media.relativePath).toString('base64');
    const suffix = resolution === 'low' ? '_low' : '';
    const thumbnailName = `${base64Name}${suffix}.jpg`;
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailName);
    
    try {
        await fs.access(thumbnailPath);
        return `/static/thumbnails/${thumbnailName}`;
    } catch {
        // Thumbnail doesn't exist, create it
        let generator;
        if (resolution === 'low') {
            // For low-res, use video-specific generator if video, otherwise use image generator
            generator = media.type === 'video' ? generateLowResVideoThumbnail : generateLowResThumbnail;
        } else {
            // For high-res, use general thumbnail generator
            generator = generateThumbnail;
        }
        
        if (await generator(media.path, thumbnailPath, media.type)) {
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
        const useLazyLoading = images.length >= 500;
        
        // Group images by directory
        const galleries = {};
        
        for (const image of images) {
            if (!galleries[image.directory]) {
                galleries[image.directory] = [];
            }
            
            let thumbnail, thumbnailHigh;
            if (useLazyLoading) {
                // For large collections, generate low-res thumbnail only
                thumbnail = await getThumbnail(image, 'low');
                thumbnailHigh = null; // Will be generated on-demand
            } else {
                // For small collections, generate high-res immediately
                thumbnail = await getThumbnail(image, 'high');
                thumbnailHigh = null;
            }
            
            galleries[image.directory].push({
                ...image,
                thumbnail,
                thumbnailHigh,
                url: `/image/${encodeURIComponent(image.relativePath)}`
            });
        }
        
        res.json({
            scanDirectory: SCAN_DIR,
            totalImages: images.length,
            useLazyLoading,
            galleries
        });
    } catch (error) {
        console.error('Error scanning directory:', error);
        res.status(500).json({ error: 'Failed to scan directory' });
    }
});

// Request high-resolution thumbnail (for lazy loading)
app.get('/api/thumbnail/:path(*)', async (req, res) => {
    try {
        const imagePath = path.join(SCAN_DIR, decodeURIComponent(req.params.path));
        
        // Security check: ensure path is within scan directory
        const resolvedPath = path.resolve(imagePath);
        const resolvedScanDir = path.resolve(SCAN_DIR);
        
        if (!resolvedPath.startsWith(resolvedScanDir)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        // Check if file exists
        await fs.access(imagePath);
        
        const relativePath = path.relative(SCAN_DIR, imagePath);
        const isImageFile = isImage(path.basename(imagePath));
        const isVideoFile = isVideo(path.basename(imagePath));
        
        if (!isImageFile && !isVideoFile) {
            return res.status(400).json({ error: 'Not a media file' });
        }
        
        const media = {
            path: imagePath,
            relativePath,
            type: isImageFile ? 'image' : 'video'
        };
        
        const thumbnail = await getThumbnail(media, 'high');
        
        if (thumbnail) {
            res.json({ thumbnail });
        } else {
            res.status(500).json({ error: 'Failed to generate thumbnail' });
        }
    } catch (error) {
        res.status(404).json({ error: 'Media file not found' });
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
    res.sendFile(GENERATED_HTML_FILE, (err) => {
        if (err) {
            res.status(500).json({ error: 'Gallery HTML not available' });
        }
    });
});

// Start server
async function startServer() {
    await ensureDirectories();
    await generateGalleryHTML();
    
    // Find an available port
    PORT = await findAvailablePort(PORT);
    
    app.listen(PORT, () => {
        console.log(`🖼️  Image Gallery Server running on http://localhost:${PORT}`);
        console.log(`📁 Scanning directory: ${SCAN_DIR}`);
        console.log(`💡 To scan a different directory, run: node server.js /path/to/images`);
    });
}

startServer().catch(console.error);

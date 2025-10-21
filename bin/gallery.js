#!/usr/bin/env node

const { Command } = require('commander');
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const net = require('net');
const open = require('open').default;
const { spawn, fork } = require('child_process');

const program = new Command();

// Configuration
let PORT = 3000;

// Configuration
const PACKAGE_DIR = path.dirname(__dirname);
const PUBLIC_DIR = path.join(PACKAGE_DIR, 'public');

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
async function scanDirectory(dir, SCAN_DIR, THUMBNAILS_DIR, isRoot = false) {
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
                    const subImages = await scanDirectory(fullPath, SCAN_DIR, THUMBNAILS_DIR, false);
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
async function getThumbnail(media, THUMBNAILS_DIR) {
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

// Launch server as background process
async function launchBackgroundServer(scanDir, port, openBrowser = true) {
    const config = {
        scanDir,
        port,
        openBrowser,
        packageDir: PACKAGE_DIR
    };
    
    const serverRunnerPath = path.join(PACKAGE_DIR, 'bin', 'server-runner.js');
    
    // Spawn fully detached child process
    const child = spawn('node', [serverRunnerPath, JSON.stringify(config)], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'], // Fully detach all stdio
        cwd: process.cwd()
    });
    
    // Let the process run independently
    child.unref();
    
    // Give the process a moment to start, then resolve
    return new Promise((resolve, reject) => {
        child.on('error', (error) => {
            reject(error);
        });
        
        // Simple delay to let process start
        setTimeout(() => {
            resolve({ pid: child.pid });
        }, 1000);
    });
}

// Read PID from file
async function readPidFile(directory = process.cwd()) {
    const pidFile = path.join(directory, '.gallery-cache', 'gallery.pid');
    try {
        const pid = await fs.readFile(pidFile, 'utf8');
        return parseInt(pid.trim());
    } catch {
        return null;
    }
}

// Remove PID file
async function removePidFile(directory = process.cwd()) {
    const pidFile = path.join(directory, '.gallery-cache', 'gallery.pid');
    try {
        await fs.unlink(pidFile);
    } catch {
        // Ignore if file doesn't exist
    }
}

// Check if process is running
function isProcessRunning(pid) {
    try {
        process.kill(pid, 0); // Signal 0 just checks if process exists
        return true;
    } catch {
        return false;
    }
}

// Stop gallery server in current directory
async function stopGalleryServer(directory = process.cwd()) {
    const pid = await readPidFile(directory);
    
    if (pid && isProcessRunning(pid)) {
        try {
            process.kill(pid, 'SIGTERM');
            console.log(`🛑 Stopped gallery server (PID: ${pid}) in ${directory}`);
            await removePidFile(directory);
            return true;
        } catch (error) {
            console.warn(`Could not stop process ${pid}:`, error.message);
            await removePidFile(directory); // Clean up stale PID file
            return false;
        }
    } else {
        if (pid) {
            console.log('Gallery server is not running (stale PID file)');
            await removePidFile(directory); // Clean up stale PID file
        } else {
            console.log('No gallery server running in current directory');
        }
        return false;
    }
}

// Find and kill all gallery processes
async function killAllGalleryProcesses() {
    let stoppedCount = 0;
    
    // First, try to stop server in current directory
    if (await stopGalleryServer()) {
        stoppedCount++;
    }
    
    // Then look for other gallery processes using ps
    return new Promise((resolve) => {
        const ps = spawn('ps', ['aux']);
        const grep = spawn('grep', ['server-runner.js']);
        const grep2 = spawn('grep', ['-v', 'grep']);
        
        ps.stdout.pipe(grep.stdin);
        grep.stdout.pipe(grep2.stdin);
        
        let output = '';
        grep2.stdout.on('data', (data) => {
            output += data.toString();
        });
        
        grep2.on('close', (code) => {
            const lines = output.trim().split('\n').filter(line => line.length > 0);
            const pids = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                return parseInt(parts[1]); // PID is second column
            }).filter(pid => pid && !isNaN(pid));
            
            if (pids.length > 0) {
                console.log(`Found ${pids.length} additional gallery server(s)...`);
                pids.forEach(pid => {
                    try {
                        process.kill(pid, 'SIGTERM');
                        console.log(`🛑 Stopped gallery server (PID: ${pid})`);
                        stoppedCount++;
                    } catch (error) {
                        console.warn(`Could not stop process ${pid}:`, error.message);
                    }
                });
            }
            
            if (stoppedCount === 0) {
                console.log('No gallery servers found running');
            } else {
                console.log(`✅ Stopped ${stoppedCount} gallery server(s)`);
            }
            
            resolve();
        });
        
        ps.on('error', () => resolve());
        grep.on('error', () => resolve());
        grep2.on('error', () => resolve());
    });
}

// Delete gallery cache files recursively
async function deleteGalleryFiles(dir) {
    try {
        const items = await fs.readdir(dir, { withFileTypes: true });
        let deletedCount = 0;
        
        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            
            if (item.isDirectory()) {
                if (item.name === '.gallery-cache') {
                    // Delete entire .gallery-cache directory
                    await fs.rm(fullPath, { recursive: true, force: true });
                    console.log(`🗑️  Deleted: ${fullPath}`);
                    deletedCount++;
                } else if (!item.name.startsWith('.') && item.name !== 'node_modules') {
                    // Recursively search subdirectories
                    deletedCount += await deleteGalleryFiles(fullPath);
                }
            }
        }
        
        return deletedCount;
    } catch (error) {
        console.warn(`Unable to scan directory ${dir}:`, error.message);
        return 0;
    }
}

// No longer needed - CLI doesn't run servers directly

// CLI Commands
program
    .name('gallery')
    .description('Image Gallery Server CLI')
    .version('1.0.0');

program
    .command('up')
    .description('Start the gallery server')
    .option('-d, --directory <path>', 'Directory to scan', process.cwd())
    .option('-p, --port <number>', 'Port to run server on', '3000')
    .option('--no-open', 'Don\'t open browser automatically')
    .action(async (options) => {
        const scanDir = path.resolve(options.directory);
        const port = parseInt(options.port);
        const openBrowser = options.open;
        
        try {
            // Check if server is already running in this directory
            const existingPid = await readPidFile(process.cwd());
            if (existingPid && isProcessRunning(existingPid)) {
                console.log(`⚠️  Gallery server already running (PID: ${existingPid})`);
                if (openBrowser) {
                    // Try to determine the port and open browser
                    // For simplicity, we'll just use the default port
                    setTimeout(() => {
                        open(`http://localhost:${port}`);
                    }, 500);
                }
                return;
            }
            
            const result = await launchBackgroundServer(scanDir, port, openBrowser);
            console.log(`✅ Gallery server starting in background (PID: ${result.pid})`);
            console.log(`🌐 Server will be available at: http://localhost:${port}`);
            console.log('💡 Use "gallery down" to stop the server');
            
            // Exit the CLI process to return control to the terminal
            process.exit(0);
            
        } catch (error) {
            console.error('Failed to start gallery server:', error.message);
            process.exit(1);
        }
    });

program
    .command('scan')
    .description('Scan directory and display results without starting server')
    .option('-d, --directory <path>', 'Directory to scan', process.cwd())
    .action(async (options) => {
        const scanDir = path.resolve(options.directory);
        
        try {
            console.log(`Scanning directory: ${scanDir}`);
            const THUMBNAILS_DIR = path.join(process.cwd(), '.gallery-cache', 'thumbnails');
            const images = await scanDirectory(scanDir, scanDir, THUMBNAILS_DIR, true);
            
            console.log(`\n📊 Scan Results:`);
            console.log(`   Total media files: ${images.length}`);
            console.log(`   Images: ${images.filter(img => img.type === 'image').length}`);
            console.log(`   Videos: ${images.filter(img => img.type === 'video').length}`);
            
            const directories = [...new Set(images.map(img => img.directory))];
            console.log(`   Directories: ${directories.length}`);
            
            if (directories.length > 0) {
                console.log(`\n📁 Directories with media:`);
                directories.sort().forEach(dir => {
                    const count = images.filter(img => img.directory === dir).length;
                    console.log(`   ${dir === '.' ? 'Root' : dir}: ${count} files`);
                });
            }
        } catch (error) {
            console.error('Failed to scan directory:', error.message);
            process.exit(1);
        }
    });

program
    .command('down')
    .description('Stop all running gallery servers')
    .action(async () => {
        try {
            console.log('🛑 Stopping gallery servers...');
            await killAllGalleryProcesses();
        } catch (error) {
            console.error('Failed to stop gallery servers:', error.message);
            process.exit(1);
        }
    });

// Alias 'stop' to 'down' for backwards compatibility
program
    .command('stop')
    .description('Stop all running gallery servers (alias for down)')
    .action(async () => {
        console.log('💡 Note: "stop" is deprecated, use "gallery down" instead');
        try {
            console.log('🛑 Stopping gallery servers...');
            await killAllGalleryProcesses();
        } catch (error) {
            console.error('Failed to stop gallery servers:', error.message);
            process.exit(1);
        }
    });

program
    .command('rescan')
    .description('Force rescan of current directory gallery')
    .action(async () => {
        try {
            const pid = await readPidFile();
            if (!pid || !isProcessRunning(pid)) {
                console.log('⚠️  No gallery server running in current directory');
                console.log('💡 Start a server with: gallery up');
                return;
            }
            
            // Try to trigger rescan via API
            const response = await fetch('http://localhost:3000/api/rescan', {
                method: 'POST'
            }).catch(async () => {
                // Try other common ports if 3000 fails
                for (let port = 3001; port <= 3010; port++) {
                    try {
                        return await fetch(`http://localhost:${port}/api/rescan`, { method: 'POST' });
                    } catch {
                        continue;
                    }
                }
                throw new Error('Could not connect to gallery server');
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('✅ Gallery rescanned successfully');
                console.log(`▦ Found ${result.totalImages} media files`);
            } else {
                console.error('❌ Failed to rescan gallery');
            }
            
        } catch (error) {
            console.error('Failed to rescan gallery:', error.message);
            console.log('💡 The server might be running on a different port');
            process.exit(1);
        }
    });

program
    .command('cleanup')
    .description('Clean up orphaned thumbnail files in current directory')
    .action(async () => {
        try {
            const thumbnailsDir = path.join(process.cwd(), '.gallery-cache', 'thumbnails');
            
            // Check if thumbnails directory exists
            try {
                await fs.access(thumbnailsDir);
            } catch {
                console.log('ℹ️  No thumbnail cache found in current directory');
                return;
            }
            
            console.log('🧹 Cleaning up orphaned thumbnails...');
            
            const thumbnailFiles = await fs.readdir(thumbnailsDir);
            let cleanedCount = 0;
            let totalThumbnails = 0;
            
            for (const thumbnailFile of thumbnailFiles) {
                if (!thumbnailFile.endsWith('.jpg')) continue;
                totalThumbnails++;
                
                // Decode the original file path from base64 filename
                const base64Path = thumbnailFile.replace('.jpg', '');
                try {
                    const originalPath = Buffer.from(base64Path, 'base64').toString('utf8');
                    const fullOriginalPath = path.join(process.cwd(), originalPath);
                    
                    // Check if original file still exists
                    try {
                        await fs.access(fullOriginalPath);
                    } catch {
                        // Original file doesn't exist, remove thumbnail
                        const thumbnailPath = path.join(thumbnailsDir, thumbnailFile);
                        await fs.unlink(thumbnailPath);
                        console.log(`🗑️  Removed: ${thumbnailFile}`);
                        cleanedCount++;
                    }
                } catch (error) {
                    // Invalid base64 or other error, skip
                    console.warn(`⚠️  Could not decode thumbnail: ${thumbnailFile}`);
                }
            }
            
            console.log(`\n✅ Cleanup complete:`);
            console.log(`   Total thumbnails: ${totalThumbnails}`);
            console.log(`   Cleaned: ${cleanedCount}`);
            console.log(`   Remaining: ${totalThumbnails - cleanedCount}`);
            
        } catch (error) {
            console.error('Failed to cleanup thumbnails:', error.message);
            process.exit(1);
        }
    });

program
    .command('delete')
    .description('Delete all gallery cache files (.gallery-cache directories)')
    .option('-d, --directory <path>', 'Directory to clean (searches recursively)', process.cwd())
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (options) => {
        const searchDir = path.resolve(options.directory);
        
        try {
            if (!options.force) {
                console.log(`\n⚠️  This will delete all .gallery-cache directories in:`);
                console.log(`   ${searchDir}`);
                console.log(`\n   This includes all thumbnails and metadata files.`);
                console.log(`\n   Continue? (y/N):`);
                
                // Simple confirmation (in a real CLI, you'd use a proper prompt library)
                const response = await new Promise((resolve) => {
                    process.stdin.once('data', (data) => {
                        resolve(data.toString().trim().toLowerCase());
                    });
                });
                
                if (response !== 'y' && response !== 'yes') {
                    console.log('❌ Operation cancelled');
                    process.exit(0);
                }
            }
            
            console.log(`\n🗑️  Deleting gallery cache files in: ${searchDir}`);
            const deletedCount = await deleteGalleryFiles(searchDir);
            
            if (deletedCount > 0) {
                console.log(`\n✅ Deleted ${deletedCount} .gallery-cache director${deletedCount === 1 ? 'y' : 'ies'}`);
            } else {
                console.log('\n📂 No .gallery-cache directories found');
            }
        } catch (error) {
            console.error('Failed to delete gallery files:', error.message);
            process.exit(1);
        }
    });

program.parse();
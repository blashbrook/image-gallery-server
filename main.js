const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let serverProcess;
let serverPort = 3000;

// Check if port is available
function checkPort(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

// Find an available port
async function findAvailablePort(startPort = 3000) {
    let port = startPort;
    while (port < startPort + 100) {
        if (await checkPort(port)) {
            return port;
        }
        port++;
    }
    throw new Error('No available ports found');
}

// Start the Express server
async function startServer(scanDir) {
    if (!scanDir) {
        throw new Error('No directory selected');
    }
    
    try {
        serverPort = await findAvailablePort();
        
        const args = [scanDir];
        
        const env = {
            ...process.env,
            PORT: serverPort.toString(),
            ELECTRON_MODE: 'true',
            GALLERY_DIR: scanDir
        };
        
        serverProcess = spawn('node', ['server.js', ...args], {
            cwd: __dirname,
            env,
            stdio: 'inherit'
        });
        
        serverProcess.on('error', (error) => {
            console.error('Failed to start server:', error);
        });
        
        serverProcess.on('exit', (code) => {
            console.log(`Server process exited with code ${code}`);
        });
        
        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return `http://localhost:${serverPort}`;
    } catch (error) {
        console.error('Error starting server:', error);
        throw error;
    }
}

// Create the main window
async function createWindow(scanDir = null) {
    // If no scan directory provided, prompt user to select one
    if (!scanDir) {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select Directory to Scan for Images',
            buttonLabel: 'Select Gallery Directory'
        });
        
        if (result.canceled || result.filePaths.length === 0) {
            dialog.showMessageBox({
                type: 'info',
                title: 'No Directory Selected',
                message: 'You must select a directory to create a gallery.',
                buttons: ['Quit', 'Select Directory']
            }).then(response => {
                if (response.response === 1) {
                    // Try again
                    createWindow();
                } else {
                    app.quit();
                }
            });
            return;
        }
        
        scanDir = result.filePaths[0];
    }
    
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        },
        title: `Image Gallery - ${path.basename(scanDir)}`,
        icon: path.join(__dirname, 'public', 'favicon.ico')
    });
    
    // Create application menu
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'Select Directory',
                    accelerator: 'CmdOrCtrl+O',
                    click: async () => {
                        const result = await dialog.showOpenDialog(mainWindow, {
                            properties: ['openDirectory']
                        });
                        
                        if (!result.canceled && result.filePaths.length > 0) {
                            const selectedDir = result.filePaths[0];
                            // Restart server with new directory
                            if (serverProcess) {
                                serverProcess.kill();
                            }
                            const serverUrl = await startServer(selectedDir);
                            mainWindow.loadURL(serverUrl);
                        }
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(process.platform === 'darwin' ? [
                    { type: 'separator' },
                    { role: 'front' }
                ] : [])
            ]
        }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    
    try {
        const serverUrl = await startServer(scanDir);
        await mainWindow.loadURL(serverUrl);
    } catch (error) {
        console.error('Failed to start application:', error);
        dialog.showErrorBox('Error', 'Failed to start the server. Please try again.');
        app.quit();
    }
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Handle IPC messages from renderer
ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// App lifecycle
app.whenReady().then(() => {
    // Check for command line argument (directory to scan)
    const args = process.argv.slice(2);
    const scanDir = args.length > 0 ? args[0] : null;
    
    createWindow(scanDir);
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow(scanDir);
        }
    });
});

app.on('window-all-closed', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
});

// Handle process termination
process.on('SIGINT', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    app.quit();
});

process.on('SIGTERM', () => {
    if (serverProcess) {
        serverProcess.kill();
    }
    app.quit();
});

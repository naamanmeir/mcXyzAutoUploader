const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

// Configuration
const FOLDER_PATH = 'c:/Users/naaman/AppData/Roaming/.minecraft/screenshots';
const REMOTE_UPLOAD_URL = 'https://flowflowxyz.niva.monster/upload';

// Track previously seen files and watcher
let previousFiles = new Set();
let mainWindow;
let isMonitoring = false;
let fileWatcher;

function createWindow() {
    // Hide menu
    Menu.setApplicationMenu(null);
    
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, 'icon.ico'),
        autoHideMenuBar: true,
        title: 'Location Tracker Uploader'
    });

    mainWindow.loadFile('index.html');
    
    // Start monitoring automatically
    startMonitoring();
}

function uploadFile(file, filePath, stats) {
    sendToRenderer('upload-start', `Uploading: ${file}`);
    
    fs.readFile(filePath, (readErr, fileBuffer) => {
        if (readErr) {
            sendToRenderer('upload-error', `Error reading ${file}: ${readErr.message}`);
            return;
        }
        
        // Detect MIME type based on file extension
        const ext = path.extname(file).toLowerCase();
        let mimeType = 'image/png';
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.webp') mimeType = 'image/webp';
        
        const requestBody = {
            imageData: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
            autoadd: 1
        };
        
        const parsedUrl = url.parse(REMOTE_UPLOAD_URL);
        const jsonBody = JSON.stringify(requestBody);
        
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(jsonBody)
            }
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    sendToRenderer('upload-success', file);
                    sendToRenderer('upload-response', `Response: ${responseData}`);
                } else {
                    sendToRenderer('upload-error', `Failed to upload ${file}: ${res.statusCode} - ${responseData}`);
                }
            });
        });
        
        req.on('error', (error) => {
            sendToRenderer('upload-error', `Upload error for ${file}: ${error.message}`);
        });
        
        req.setTimeout(30000, () => {
            req.abort();
            sendToRenderer('upload-error', `Upload timeout for ${file}`);
        });
        
        req.write(jsonBody);
        req.end();
    });
}

function checkForNewFiles() {
    fs.readdir(FOLDER_PATH, (err, files) => {
        if (err) {
            sendToRenderer('folder-error', `Error reading folder: ${err.message}`);
            return;
        }

        const currentFiles = new Set();
        const newFiles = [];

        files.forEach(file => {
            const filePath = path.join(FOLDER_PATH, file);
            
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                
                if (stats.isFile()) {
                    currentFiles.add(file);
                    
                    if (!previousFiles.has(file)) {
                        newFiles.push({ file, filePath, stats });
                    }
                }
            });
        });

        setTimeout(() => {
            if (newFiles.length > 0) {
                sendToRenderer('new-files-detected', newFiles.length);
                newFiles.forEach(({ file, filePath, stats }) => {
                    uploadFile(file, filePath, stats);
                });
            }
            previousFiles = currentFiles;
        }, 100);
    });
}

function startMonitoring() {
    if (isMonitoring) return;
    
    isMonitoring = true;
    sendToRenderer('monitoring-started');
    
    // Initial scan
    checkForNewFiles();
    
    // Watch for file system changes
    try {
        fileWatcher = fs.watch(FOLDER_PATH, { persistent: true }, (eventType, filename) => {
            if (eventType === 'rename' && filename) {
                // Small delay to ensure file is fully written
                setTimeout(() => checkForNewFiles(), 500);
            }
        });
    } catch (error) {
        sendToRenderer('folder-error', `Error watching folder: ${error.message}`);
    }
}

function stopMonitoring() {
    if (!isMonitoring) return;
    
    isMonitoring = false;
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
    sendToRenderer('monitoring-stopped');
}

function sendToRenderer(type, data = null) {
    if (mainWindow) {
        mainWindow.webContents.send('app-event', { type, data, timestamp: new Date().toLocaleTimeString() });
    }
}

// IPC handlers
ipcMain.handle('start-monitoring', () => {
    startMonitoring();
    return isMonitoring;
});

ipcMain.handle('stop-monitoring', () => {
    stopMonitoring();
    return isMonitoring;
});

ipcMain.handle('get-status', () => {
    return {
        isMonitoring,
        folderPath: FOLDER_PATH,
        uploadUrl: REMOTE_UPLOAD_URL
    };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

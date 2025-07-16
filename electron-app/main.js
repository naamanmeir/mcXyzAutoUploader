const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

// Configuration
const DEFAULT_FOLDER_PATH = 'c:/Users/naaman/AppData/Roaming/.minecraft/screenshots';
const UPLOADED_FILES_PATH = path.join(app.getPath('userData'), 'uploaded-files.json');
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// App configuration
let config = {
    folderPath: DEFAULT_FOLDER_PATH,
    remoteUploadUrl: 'https://flowflowxyz.niva.monster/upload'
};

// Track previously seen files and watcher
let previousFiles = new Set();
let mainWindow;
let isMonitoring = false;
let fileWatcher;

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            const savedConfig = JSON.parse(data);
            config = { ...config, ...savedConfig }; // Merge defaults with saved config
        }
        saveConfig(); // Save back to ensure new properties are added to the file
    } catch (error) {
        console.error('Error loading config, using defaults:', error);
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (error) {
        console.error('Error saving config:', error);
    }
}

function loadUploadedFiles() {
    try {
        if (fs.existsSync(UPLOADED_FILES_PATH)) {
            const data = fs.readFileSync(UPLOADED_FILES_PATH, 'utf8');
            const uploaded = JSON.parse(data);
            previousFiles = new Set(uploaded);
        } else {
            fs.writeFileSync(UPLOADED_FILES_PATH, JSON.stringify([]));
            previousFiles = new Set();
        }
    } catch (error) {
        sendToRenderer('upload-error', `Error loading uploaded files list: ${error.message}`);
        previousFiles = new Set();
    }
}

function saveUploadedFile(fileName) {
    previousFiles.add(fileName);
    try {
        fs.writeFileSync(UPLOADED_FILES_PATH, JSON.stringify(Array.from(previousFiles)));
    } catch (error) {
        sendToRenderer('upload-error', `Error saving uploaded files list: ${error.message}`);
    }
}

function createWindow() {
    // Hide menu
    Menu.setApplicationMenu(null);
    
    loadConfig();

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
    
    loadUploadedFiles();
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
        
        const parsedUrl = url.parse(config.remoteUploadUrl);
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
                    saveUploadedFile(file);
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
    fs.readdir(config.folderPath, (err, files) => {
        if (err) {
            sendToRenderer('folder-error', `Error reading folder: ${err.message}`);
            return;
        }

        const currentFiles = new Set();
        const newFiles = [];

        files.forEach(file => {
            const filePath = path.join(config.folderPath, file);
            
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
        fileWatcher = fs.watch(config.folderPath, { persistent: true }, (eventType, filename) => {
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
        folderPath: config.folderPath,
        uploadUrl: config.remoteUploadUrl
    };
});

ipcMain.handle('change-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (!canceled && filePaths.length > 0) {
        const newPath = filePaths[0];
        stopMonitoring();
        config.folderPath = newPath;
        saveConfig();
        startMonitoring();
        return newPath;
    }
    return null;
});

ipcMain.handle('set-server-url', async (event, newUrl) => {
    if (newUrl && (newUrl.startsWith('http://') || newUrl.startsWith('https://'))) {
        stopMonitoring();
        config.remoteUploadUrl = newUrl;
        saveConfig();
        startMonitoring();
        return newUrl;
    }
    return null;
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

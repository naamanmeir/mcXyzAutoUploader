const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// Configuration
const FOLDER_PATH = 'c:/Users/naaman/AppData/Roaming/.minecraft/screenshots'; // Change to your folder path
const REMOTE_UPLOAD_URL = 'http://flowflowxyz.niva.monster/upload'; // Change to your server endpoint

// Track previously seen files and watcher
let previousFiles = new Set();
let isMonitoring = false;
let fileWatcher;

function uploadFile(file, filePath, stats) {
    console.log(`[${new Date().toLocaleTimeString()}] Upload Start: Uploading: ${file}`);
    
    // Read file as buffer for body
    fs.readFile(filePath, (readErr, fileBuffer) => {
        if (readErr) {
            console.log(`[${new Date().toLocaleTimeString()}] Upload Error: Error reading ${file}: ${readErr.message}`);
            return;
        }
        
        // Detect MIME type based on file extension
        const ext = path.extname(file).toLowerCase();
        let mimeType = 'image/png'; // default
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.webp') mimeType = 'image/webp';
        
        // Create request body with data URL format
        const requestBody = {
            imageData: `data:${mimeType};base64,${fileBuffer.toString('base64')}`,
            autoadd: 1
        };
        
        const parsedUrl = url.parse(REMOTE_UPLOAD_URL);
        const jsonBody = JSON.stringify(requestBody);
        
        // HTTP request options
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 80,
            path: parsedUrl.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(jsonBody)
            }
        };
        
        // Create HTTP request
        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`[${new Date().toLocaleTimeString()}] Upload Success: ${file}`);
                } else {
                    console.log(`[${new Date().toLocaleTimeString()}] Upload Error: Failed to upload ${file}: ${res.statusCode}`);
                }
            });
        });
        
        req.on('error', (error) => {
            console.log(`[${new Date().toLocaleTimeString()}] Upload Error: Upload error for ${file}: ${error.message}`);
        });
        
        req.setTimeout(30000);
        req.write(jsonBody);
        req.end();
    });
}

function checkForNewFiles() {
    fs.readdir(FOLDER_PATH, (err, files) => {
        if (err) {
            console.log(`[${new Date().toLocaleTimeString()}] Folder Error: Error reading folder: ${err.message}`);
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
                    
                    // Check if this is a new file
                    if (!previousFiles.has(file)) {
                        newFiles.push({ file, filePath, stats });
                    }
                }
            });
        });

        setTimeout(() => {
            if (newFiles.length > 0) {
                console.log(`[${new Date().toLocaleTimeString()}] New Files Detected: ${newFiles.length} new file(s)`);
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
    console.log(`[${new Date().toLocaleTimeString()}] Monitoring Started`);
    console.log(`Watching folder: ${FOLDER_PATH}`);
    console.log(`Upload URL: ${REMOTE_UPLOAD_URL}`);
    
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
        console.log(`[${new Date().toLocaleTimeString()}] Folder Error: Error watching folder: ${error.message}`);
    }
}

function stopMonitoring() {
    if (!isMonitoring) return;
    
    isMonitoring = false;
    if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
    }
    console.log(`[${new Date().toLocaleTimeString()}] Monitoring Stopped`);
}

function getStatus() {
    return {
        isMonitoring,
        folderPath: FOLDER_PATH,
        uploadUrl: REMOTE_UPLOAD_URL
    };
}

// Command line interface
console.log('MC Screenshot Uploader - Local Version');
console.log('=====================================');
console.log('Commands:');
console.log('  start  - Start monitoring');
console.log('  stop   - Stop monitoring');
console.log('  status - Show current status');
console.log('  quit   - Exit application');
console.log('');

// Start monitoring automatically
startMonitoring();

// Handle command line input
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
    let chunk;
    while ((chunk = process.stdin.read()) !== null) {
        const command = chunk.trim().toLowerCase();
        
        switch (command) {
            case 'start':
                startMonitoring();
                break;
            case 'stop':
                stopMonitoring();
                break;
            case 'status':
                const status = getStatus();
                console.log(`Status: ${status.isMonitoring ? 'Monitoring' : 'Stopped'}`);
                console.log(`Folder: ${status.folderPath}`);
                console.log(`Upload URL: ${status.uploadUrl}`);
                break;
            case 'quit':
            case 'exit':
                stopMonitoring();
                process.exit(0);
                break;
            default:
                console.log('Unknown command. Available: start, stop, status, quit');
        }
    }
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nShutting down...');
    stopMonitoring();
    process.exit(0);
});

process.on('SIGTERM', () => {
    stopMonitoring();
    process.exit(0);
});
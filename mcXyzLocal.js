const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

// Configuration
const FOLDER_PATH = 'c:/Users/naaman/AppData/Roaming/.minecraft/screenshots'; // Change to your folder path
const REMOTE_UPLOAD_URL = 'http://flowflowxyz.niva.monster/upload'; // Change to your server endpoint
const CHECK_INTERVAL = 5000; // 5 seconds

// Track previously seen files
let previousFiles = new Set();

console.log('Starting continuous file monitoring...');
console.log('Folder path:', FOLDER_PATH);
console.log('Upload URL:', REMOTE_UPLOAD_URL);
console.log(`Checking for new files every ${CHECK_INTERVAL / 1000} seconds`);

function uploadFile(file, filePath, stats) {
    console.log(`${file} is a new file, preparing for upload...`);
    
    // Read file as buffer for body
    fs.readFile(filePath, (readErr, fileBuffer) => {
        if (readErr) {
            console.error(`Error reading file buffer for ${file}:`, readErr);
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
        
        console.log(`Request body created for: ${file}`);
        console.log(`Sending POST request to upload ${file}...`);
        console.log(`File size: ${stats.size} bytes`);
        
        // Parse the URL for http request
        const parsedUrl = url.parse(REMOTE_UPLOAD_URL);
        console.log(`Parsed URL - Host: ${parsedUrl.hostname}, Port: ${parsedUrl.port}, Path: ${parsedUrl.pathname}`);
        
        // Prepare request body as JSON string
        const jsonBody = JSON.stringify(requestBody);
        console.log(`JSON body prepared, length: ${jsonBody.length} bytes`);
        
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
        
        console.log(`HTTP request options configured for ${file}`);
        console.log(`Request headers:`, options.headers);
        
        // Create HTTP request
        const req = http.request(options, (res) => {
            console.log(`Response status for ${file}: ${res.statusCode}`);
            console.log(`Response headers for ${file}:`, res.headers);
            
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
                console.log(`Received data chunk for ${file}, size: ${chunk.length} bytes`);
            });
            
            res.on('end', () => {
                console.log(`Response completed for ${file}`);
                console.log(`Full response data for ${file}:`, responseData);
                
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Successfully uploaded ${file}: ${res.statusCode}`);
                    try {
                        const parsedResponse = JSON.parse(responseData);
                        console.log(`Parsed response data for ${file}:`, parsedResponse);
                    } catch (parseErr) {
                        console.log(`Response is not JSON for ${file}:`, responseData);
                    }
                } else {
                    console.error(`❌ Failed to upload ${file}: ${res.statusCode}`);
                    console.error(`Error response for ${file}:`, responseData);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`❌ Request error for ${file}:`, error.message);
            console.error(`Error code: ${error.code}`);
            console.error(`File details - Name: ${file}, Size: ${stats.size} bytes, Path: ${filePath}`);
        });
        
        req.on('timeout', () => {
            console.error(`❌ Request timeout for ${file}`);
            req.destroy();
        });
        
        // Set timeout
        req.setTimeout(30000);
        
        console.log(`Writing request body for ${file}...`);
        // Write the JSON body to the request
        req.write(jsonBody);
        console.log(`Request body written for ${file}, ending request...`);
        req.end();
    });
}

function checkForNewFiles() {
    console.log(`[${new Date().toLocaleTimeString()}] Checking for new files...`);
    
    fs.readdir(FOLDER_PATH, (err, files) => {
        if (err) {
            console.error('Error reading folder:', err);
            return;
        }

        const currentFiles = new Set();
        let newFileCount = 0;

        files.forEach(file => {
            const filePath = path.join(FOLDER_PATH, file);
            
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`Error reading file stats for ${file}:`, err);
                    return;
                }
                
                if (stats.isFile()) {
                    currentFiles.add(file);
                    
                    // Check if this is a new file
                    if (!previousFiles.has(file)) {
                        console.log(`📁 New file detected: ${file}`);
                        newFileCount++;
                        uploadFile(file, filePath, stats);
                    }
                }
            });
        });

        // Update the previous files list
        setTimeout(() => {
            previousFiles = currentFiles;
            if (newFileCount === 0) {
                console.log(`[${new Date().toLocaleTimeString()}] No new files found`);
            } else {
                console.log(`[${new Date().toLocaleTimeString()}] Found ${newFileCount} new files`);
            }
        }, 1000); // Small delay to ensure all stat operations complete
    });
}

// Initial scan
checkForNewFiles();

// Set up continuous monitoring
setInterval(checkForNewFiles, CHECK_INTERVAL);

console.log('File monitor is running. Press Ctrl+C to stop.');
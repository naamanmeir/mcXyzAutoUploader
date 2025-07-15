const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const FormData = require('form-data');

// Configuration
const FOLDER_PATH = 'c:/Users/naaman/AppData/Roaming/.minecraft/screenshots'; // Change to your folder path
const REMOTE_UPLOAD_URL = 'http://flowflowxyz.niva.monster/upload'; // Change to your server endpoint

console.log('Starting file upload process...');
console.log('Folder path:', FOLDER_PATH);
console.log('Upload URL:', REMOTE_UPLOAD_URL);

// Read all files in the folder
console.log('Reading folder contents...');
fs.readdir(FOLDER_PATH, (err, files) => {
    if (err) {
        console.error('Error reading folder:', err);
        return;
    }

    console.log(`Found ${files.length} items in folder:`, files);

    files.forEach(file => {
        console.log(`Processing item: ${file}`);
        const filePath = path.join(FOLDER_PATH, file);
        
        fs.stat(filePath, (err, stats) => {
            if (err) {
                console.error(`Error reading file stats for ${file}:`, err);
                return;
            }
            
            if (stats.isFile()) {
                console.log(`${file} is a file, preparing for upload...`);
                console.log(`Creating read stream for file: ${filePath}`);
                const fileStream = fs.createReadStream(filePath);
                console.log(`Reading file buffer for: ${file}`);
                
                // Read file as buffer for body
                fs.readFile(filePath, (readErr, fileBuffer) => {
                    if (readErr) {
                        console.error(`Error reading file buffer for ${file}:`, readErr);
                        return;
                    }
                    
                    console.log(`Creating form data for: ${file}`);
                    const formData = new FormData();
                    formData.append('file', fileStream, {
                        filename: file,
                        contentType: 'application/octet-stream'
                    });
                    
                    // Create request body with file object
                    const requestBody = {
                        imageData: {
                            name: file,
                            size: stats.size,
                            data: fileBuffer.toString('base64'),
                            type: 'application/octet-stream'
                        }
                    };
                    
                    console.log(`Form data headers prepared for: ${file}`);
                    console.log(`Form data field name: 'file'`);
                    console.log(`Form data filename: ${file}`);
                    console.log(`Request body created with imageData object for: ${file}`);

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
                        },
                        body: JSON.stringify({imageData: uploadedImageBase64})
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
            } else {
                console.log(`${file} is not a file, skipping...`);
            }
        });
    });
});
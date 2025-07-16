const { ipcRenderer } = require('electron');

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const folderPath = document.getElementById('folder-path');
const uploadUrl = document.getElementById('upload-url');
const uploadProgress = document.getElementById('upload-progress');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const clearFeedBtn = document.getElementById('clear-feed');
const activityFeed = document.getElementById('activity-feed');
const changeFolderBtn = document.getElementById('change-folder-btn');
const changeServerBtn = document.getElementById('change-server-btn');

let isMonitoring = false;
let uploadsInProgress = 0;

// Initialize
async function init() {
    const status = await ipcRenderer.invoke('get-status');
    updateConfig(status);
}

function updateConfig(status) {
    folderPath.textContent = status.folderPath;
    uploadUrl.textContent = status.uploadUrl;
    updateMonitoringStatus(status.isMonitoring);
}

function updateMonitoringStatus(monitoring) {
    isMonitoring = monitoring;
    
    if (monitoring) {
        statusIndicator.className = 'status-indicator active';
        statusText.textContent = 'Monitoring Active';
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        statusIndicator.className = 'status-indicator inactive';
        statusText.textContent = 'Monitoring Stopped';
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function updateUploadProgress() {
    if (uploadsInProgress > 0) {
        uploadProgress.style.display = 'block';
    } else {
        uploadProgress.style.display = 'none';
    }
}

function addActivityItem(type, message, data = null) {
    const item = document.createElement('div');
    item.className = `activity-item ${type}`;
    
    const timestamp = new Date().toLocaleTimeString();
    let content = '';
    
    switch (type) {
        case 'info':
            content = `<strong>ℹ️ Info:</strong> ${message}<br><small>${timestamp}</small>`;
            break;
        case 'new-files':
            content = `<strong>${data} new file(s) detected</strong><br><small>${timestamp}</small>`;
            break;
        case 'upload-start':
            content = `<strong>📤 Uploading:</strong> ${message}<br><small>${timestamp}</small>`;
            uploadsInProgress++;
            break;
        case 'upload-success':
            content = `<strong>✅ Uploaded:</strong> ${message}<br><small>${timestamp}</small>`;
            uploadsInProgress = Math.max(0, uploadsInProgress - 1);
            break;
        case 'upload-error':
            content = `<strong>❌ Error:</strong> ${message}<br><small>${timestamp}</small>`;
            uploadsInProgress = Math.max(0, uploadsInProgress - 1);
            break;
        case 'monitoring-started':
            content = `<strong>🟢 Monitoring Started</strong><br><small>${timestamp}</small>`;
            break;
        case 'monitoring-stopped':
            content = `<strong>🔴 Monitoring Stopped</strong><br><small>${timestamp}</small>`;
            break;
        default:
            content = `<strong>${message}</strong><br><small>${timestamp}</small>`;
    }
    
    item.innerHTML = content;
    activityFeed.appendChild(item);
    activityFeed.scrollTop = activityFeed.scrollHeight;
    
    updateUploadProgress();
    
    // Keep only last 50 entries
    while (activityFeed.children.length > 50) {
        activityFeed.removeChild(activityFeed.firstChild);
    }
}

// Event listeners
startBtn.addEventListener('click', async () => {
    await ipcRenderer.invoke('start-monitoring');
    updateMonitoringStatus(true);
});

stopBtn.addEventListener('click', async () => {
    await ipcRenderer.invoke('stop-monitoring');
    updateMonitoringStatus(false);
});

clearFeedBtn.addEventListener('click', () => {
    activityFeed.innerHTML = '';
});

changeFolderBtn.addEventListener('click', async () => {
    const newPath = await ipcRenderer.invoke('change-folder');
    if (newPath) {
        folderPath.textContent = newPath;
        addActivityItem('info', `Monitoring folder changed to: ${newPath}`);
    }
});

changeServerBtn.addEventListener('click', async () => {
    const currentUrl = uploadUrl.textContent;
    const newUrl = prompt('Enter the new server URL:', currentUrl);

    if (newUrl && newUrl !== currentUrl) {
        const result = await ipcRenderer.invoke('set-server-url', newUrl);
        if (result) {
            uploadUrl.textContent = result;
            addActivityItem('info', `Server URL changed to: ${result}`);
        } else {
            addActivityItem('upload-error', 'Invalid server URL provided. Must start with http:// or https://');
        }
    }
});

// Listen for app events
ipcRenderer.on('app-event', (event, { type, data }) => {
    switch (type) {
        case 'monitoring-started':
            updateMonitoringStatus(true);
            addActivityItem('monitoring-started');
            break;
        case 'monitoring-stopped':
            updateMonitoringStatus(false);
            addActivityItem('monitoring-stopped');
            break;
        case 'new-files-detected':
            addActivityItem('new-files', null, data);
            break;
        case 'upload-start':
            addActivityItem('upload-start', data);
            break;
        case 'upload-success':
            addActivityItem('upload-success', data);
            break;
        case 'upload-error':
            addActivityItem('upload-error', data);
            break;
        case 'folder-error':
            addActivityItem('upload-error', data);
            break;
    }
});

// Initialize on load
init();

// Global state
let currentFileId = null;
let currentData = [];
let isAdmin = false;
let isCompleted = false;
let columnVisibility = {};
let currentVideoFile = null;
let hoverVideoElement = null;
let fullVideoElement = null;
let videoPlayInterval = null;
let videoMode = 'hover'; // 'hover' or 'full'
let selectedRowIndex = null;
let folders = [];
let selectedFolder = null;
let cachedFiles = []; // cache of all files returned from loadFiles
let currentFileList = []; // ordered list for navigation
let currentFileIndex = -1; // position within currentFileList
let fileToMove = null;
let videoComments = [];
let uploadMode = 'bulk'; // 'bulk' or 'single'
let selectedFiles = new Set(); // For bulk delete
let saveTimeout = null; // For debouncing save function
let uploadAbortController = null; // For cancelling uploads
const videoExtensions = ['.mp4', '.webm', '.mov', '.avi'];
let allowSrtCaptions = false;
let autoScrollCaptions = false; // default off
let isEditingCaption = false; // block jumps while editing
let loopVideoPlayback = false; // default off
let translationEnabled = false;
let translatedFileId = null;
let translatedData = null;
let originalData = [];

function isVideoFileName(name) {
    const lower = name.toLowerCase();
    return videoExtensions.some(ext => lower.endsWith(ext));
}

function isCaptionFileName(name) {
    const lower = name.toLowerCase();
    if (allowSrtCaptions) {
        return lower.endsWith('.csv') || lower.endsWith('.srt');
    }
    return lower.endsWith('.csv');
}

function normalizeCaptionBaseName(name) {
    if (!name) return '';
    return name.replace(/\.(csv|srt)$/i, '').replace(/_split$/i, '');
}

function stripCaptionExtension(name) {
    if (!name) return '';
    return name.replace(/\.(csv|srt)$/i, '');
}

function getCaptionFileDescription() {
    return allowSrtCaptions ? 'CSV or SRT file' : 'CSV file';
}

function getCaptionPluralDescription() {
    return allowSrtCaptions ? 'caption files (CSV/SRT)' : 'CSV files';
}

function getCaptionExtensionsText() {
    return allowSrtCaptions ? '.csv or .srt' : '.csv';
}

function updateDropZoneText() {
    const dropZoneText = document.getElementById('dropZoneText');
    const dropZoneSubtext = document.getElementById('dropZoneSubtext');
    if (dropZoneText) {
        if (uploadMode === 'bulk') {
            dropZoneText.textContent = `Select folders with videos and ${getCaptionPluralDescription()}`;
        } else {
            dropZoneText.textContent = `Drag & drop 1 video + 1 ${allowSrtCaptions ? 'caption (CSV/SRT)' : 'CSV'} file here`;
        }
    }
    if (dropZoneSubtext) {
        dropZoneSubtext.textContent = uploadMode === 'bulk'
            ? 'Click button multiple times to select multiple folders'
            : `Need an ${allowSrtCaptions ? '.srt' : '.csv'}? Toggle the checkbox above as needed.`;
    }
}

function updateCaptionModeUI() {
    updateDropZoneText();
    const captionHighlight = document.getElementById('captionStepHighlight');
    const captionExtension = document.getElementById('captionStepExtension');
    const fileInput = document.getElementById('fileInput');
    if (captionHighlight) {
        captionHighlight.textContent = allowSrtCaptions ? 'CSV or SRT file' : 'CSV file';
    }
    if (captionExtension) {
        captionExtension.textContent = allowSrtCaptions ? '(.csv or .srt)' : '(.csv)';
    }
    if (fileInput) {
        const captionAccept = allowSrtCaptions ? '.csv,.srt' : '.csv';
        fileInput.setAttribute('accept', `${captionAccept},.mp4,.webm,.mov,.avi`);
    }
}

function handleSrtToggleChange(e) {
    allowSrtCaptions = e.target.checked;
    clearSelectedFiles();
    updateCaptionModeUI();
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check if viewing a specific folder from URL
    const urlPath = window.location.pathname;
    const folderMatch = urlPath.match(/\/folder\/(\d+)/);
    if (folderMatch) {
        selectedFolder = folderMatch[1];
    }
    
    // Hide sections by default
    const editorSection = document.getElementById('editorSection');
    const fullVideoSection = document.getElementById('fullVideoSection');
    
    if (editorSection) editorSection.style.display = 'none';
    if (fullVideoSection) fullVideoSection.style.display = 'none';
    
    // Check auth first, then load files (so admin buttons render correctly)
    await checkAuthStatus();
    loadFolders();
    loadFiles();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    document.getElementById('loginBtn').addEventListener('click', openLoginModal);
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('uploadBtn').addEventListener('click', openUploadModal);
    const prevBtn = document.getElementById('prevFileBtn');
    const nextBtn = document.getElementById('nextFileBtn');
    if (prevBtn) prevBtn.addEventListener('click', goToPrevFile);
    if (nextBtn) nextBtn.addEventListener('click', goToNextFile);
    // Header toggle buttons (table mode)
    const autoScrollBtn = document.getElementById('autoScrollBtn');
    if (autoScrollBtn) {
        autoScrollBtn.textContent = 'Auto-scroll: Off';
        autoScrollBtn.addEventListener('click', () => {
            autoScrollCaptions = !autoScrollCaptions;
            autoScrollBtn.textContent = `Auto-scroll: ${autoScrollCaptions ? 'On' : 'Off'}`;
        });
    }
    const loopVideoBtn = document.getElementById('loopVideoBtn');
    if (loopVideoBtn) {
        loopVideoBtn.textContent = 'Loop: Off (Table mode)';
        loopVideoBtn.addEventListener('click', () => {
            loopVideoPlayback = !loopVideoPlayback;
            loopVideoBtn.textContent = `Loop: ${loopVideoPlayback ? 'On' : 'Off'} (Table mode)`;
            if (fullVideoElement) fullVideoElement.loop = loopVideoPlayback;
            if (hoverVideoElement) hoverVideoElement.loop = loopVideoPlayback;
        });
    }
    const translationToggleBtn = document.getElementById('translationToggleBtn');
    if (translationToggleBtn) {
        translationToggleBtn.textContent = 'Translations: Off';
        translationToggleBtn.addEventListener('click', async () => {
            // Prefer inline translation loaded with the file; fallback to sibling file lookup
            if (!translatedData && translatedFileId) {
                await loadTranslatedCaptions();
            }
            if (!translatedData) {
                showNotification('No translated captions found for this file.', 'error');
                return;
            }
            if (!translationEnabled) {
                currentData = translatedData;
                translationEnabled = true;
                translationToggleBtn.textContent = 'Translations: On';
            } else {
                currentData = originalData;
                translationEnabled = false;
                translationToggleBtn.textContent = 'Translations: Off';
            }
            renderTable();
            renderCaptionCheckTable();
            updateStats();
            updateCaptionCheckTableHighlight();
        });
    }
    const downloadTranslatedBtn = document.getElementById('downloadTranslatedBtn');
    if (downloadTranslatedBtn) {
        downloadTranslatedBtn.disabled = true;
        downloadTranslatedBtn.addEventListener('click', async () => {
            if (!currentFileId) return;
            try {
                const resp = await fetch(`/api/files/${currentFileId}/export-translation-text`);
                if (!resp.ok) {
                    showNotification('No translated captions found', 'error');
                    return;
                }
                const blob = await resp.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const baseName = document.getElementById('currentFileName').textContent || 'captions';
                a.download = `${baseName}_translated.txt`;
                a.click();
                window.URL.revokeObjectURL(url);
                showNotification('Translation downloaded', 'success');
            } catch (e) {
                showNotification('Error downloading translation', 'error');
            }
        });
    }
    
    // Add escape key to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const loginModal = document.getElementById('loginModal');
            const uploadModal = document.getElementById('uploadModal');
            if (loginModal && loginModal.classList.contains('active')) {
                closeLoginModal();
            }
            if (uploadModal && uploadModal.classList.contains('active')) {
                closeUploadModal();
            }
        }
    });
    
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        console.log('Upload form found, attaching submit handler');
        uploadForm.addEventListener('submit', handleUpload);
    } else {
        console.error('Upload form not found!');
    }
    document.getElementById('saveBtn').addEventListener('click', saveChanges);
    document.getElementById('downloadBtn').addEventListener('click', downloadFile);
    document.getElementById('closeEditorBtn').addEventListener('click', closeEditor);
    document.getElementById('filterKeep').addEventListener('change', applyFilters);
    document.getElementById('filterCut').addEventListener('change', applyFilters);
    document.getElementById('completionCheckbox').addEventListener('change', toggleCompletion);
    document.getElementById('columnToggleBtn').addEventListener('click', toggleColumnPanel);
    document.getElementById('exportSrtBtn').addEventListener('click', exportSrt);
    
    const videoUploadForm = document.getElementById('videoUploadForm');
    if (videoUploadForm) videoUploadForm.addEventListener('submit', handleVideoUpload);
    
    document.getElementById('videoModeBtn').addEventListener('click', toggleVideoMode);
    document.getElementById('showCaptionsToggle').addEventListener('change', toggleCaptionDisplay);
    document.getElementById('videoCommentsMode').addEventListener('change', toggleVideoCommentsMode);
    
    // These buttons don't exist in new layout - make optional
    const addCommentBtn = document.getElementById('addCommentBtn');
    if (addCommentBtn) addCommentBtn.addEventListener('click', addCommentAtTimestamp);
    
    const jumpToSegmentBtn = document.getElementById('jumpToSegmentBtn');
    if (jumpToSegmentBtn) jumpToSegmentBtn.addEventListener('click', jumpToSelectedSegment);
    
    const scrollToCurrentBtn = document.getElementById('scrollToCurrentBtn');
    if (scrollToCurrentBtn) scrollToCurrentBtn.addEventListener('click', scrollToCurrentSegment);
    
    const exportCommentsBtn = document.getElementById('exportCommentsBtn');
    if (exportCommentsBtn) exportCommentsBtn.addEventListener('click', exportComments);
    
    const toggleEditorControlsBtn = document.getElementById('toggleEditorControlsBtn');
    if (toggleEditorControlsBtn) toggleEditorControlsBtn.addEventListener('click', toggleEditorControls);
    
    document.getElementById('newFolderBtn').addEventListener('click', openCreateFolderModal);
    document.getElementById('createFolderForm').addEventListener('submit', handleCreateFolder);
    document.getElementById('addGeneralCommentBtn').addEventListener('click', addGeneralComment);
    document.getElementById('uploadModeToggle').addEventListener('change', toggleUploadMode);
    const generateBtn = document.getElementById('generateThumbnailsBtn');
    if (generateBtn) generateBtn.addEventListener('click', generateAllThumbnails);
    
    const selectAllBtn = document.getElementById('selectAllFiles');
    if (selectAllBtn) selectAllBtn.addEventListener('change', toggleSelectAll);
    
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', deleteSelectedFiles);
    
    const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
    if (cancelSelectionBtn) cancelSelectionBtn.addEventListener('click', cancelSelection);
    
    hoverVideoElement = document.getElementById('hoverVideoElement');
    fullVideoElement = document.getElementById('fullVideoElement');
    
    // Configure video element to prevent fullscreen and native controls
    if (fullVideoElement) {
        fullVideoElement.controls = false;
        fullVideoElement.setAttribute('playsinline', '');
        fullVideoElement.setAttribute('webkit-playsinline', '');
        fullVideoElement.setAttribute('x5-playsinline', '');
        
        // Prevent fullscreen on click/tap
        fullVideoElement.addEventListener('click', (e) => {
            // Only prevent if clicking directly on video (not on custom controls)
            if (e.target === fullVideoElement) {
                e.preventDefault();
                e.stopPropagation();
                // Toggle play/pause instead
                if (fullVideoElement.paused) {
                    fullVideoElement.play();
                } else {
                    fullVideoElement.pause();
                }
            }
        });
        
        // Prevent fullscreen events
        fullVideoElement.addEventListener('webkitbeginfullscreen', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
        
        fullVideoElement.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement === fullVideoElement) {
                document.exitFullscreen().catch(() => {});
            }
        });
        
        // Update timestamp display and captions
        fullVideoElement.addEventListener('timeupdate', updateTimestampDisplay);
    }
    
    // Update caption size on window resize
    window.addEventListener('resize', () => {
        if (fullVideoElement && fullVideoElement.videoWidth > 0) {
            updateCaptionSize();
        }
    });

    const srtToggle = document.getElementById('allowSrtCheckbox');
    if (srtToggle) {
        allowSrtCaptions = srtToggle.checked;
        srtToggle.addEventListener('change', handleSrtToggleChange);
    }
    updateCaptionModeUI();
    
    // Custom video controls
    const playPauseBtn = document.getElementById('playPauseBtn');
    const skipBackBtn = document.getElementById('skipBackBtn');
    const skipForwardBtn = document.getElementById('skipForwardBtn');
    const opacitySlider = document.getElementById('buttonOpacitySlider');
    const videoProgressBar = document.getElementById('videoProgressBar');
    
    if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);
    if (skipBackBtn) skipBackBtn.addEventListener('click', () => skipVideo(-15));
    if (skipForwardBtn) skipForwardBtn.addEventListener('click', () => skipVideo(15));
    if (opacitySlider) opacitySlider.addEventListener('input', updateButtonOpacity);
    if (videoProgressBar) videoProgressBar.addEventListener('click', seekVideo);
    
    const saveMobileCommentBtn = document.getElementById('saveMobileCommentBtn');
    if (saveMobileCommentBtn) saveMobileCommentBtn.addEventListener('click', saveMobileComment);
    
    // Update play/pause icon when video state changes
    if (fullVideoElement) {
        fullVideoElement.addEventListener('play', updatePlayPauseIcon);
        fullVideoElement.addEventListener('pause', updatePlayPauseIcon);
        fullVideoElement.addEventListener('timeupdate', updateVideoProgress);
        fullVideoElement.addEventListener('timeupdate', updateMobileCommentTimestamp);
    }
}

function updateMobileCommentTimestamp() {
    const timestampSpan = document.getElementById('mobileCommentTimestamp');
    if (!timestampSpan || !fullVideoElement) return;
    
    const time = fullVideoElement.currentTime;
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    timestampSpan.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function saveMobileComment() {
    const textarea = document.getElementById('mobileCommentText');
    if (!textarea || !fullVideoElement || !currentFileId) return;
    
    const text = textarea.value.trim();
    if (!text) {
        showNotification('Please enter a comment', 'error');
        return;
    }
    
    const timestamp = fullVideoElement.currentTime;
    
    try {
        const response = await fetch(`/api/files/${currentFileId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, timestamp })
        });
        
        if (response.ok) {
            const result = await response.json();
            videoComments.push(result.comment);
            textarea.value = '';
            showNotification('Comment added', 'success');
            loadGeneralComments(); // Update desktop panel too
            renderVideoCommentMarkers();
        } else {
            showNotification('Error adding comment', 'error');
        }
    } catch (error) {
        console.error('Comment error:', error);
        showNotification('Error adding comment', 'error');
    }
}

function updateButtonOpacity(e) {
    const opacity = e.target.value / 100;
    // Apply to all video overlays and controls
    const elements = document.querySelectorAll('.video-control-btn, .mobile-caption-overlay, .mobile-comment-input, .video-comments-timeline, .comment-marker, .opacity-control');
    elements.forEach(el => {
        el.style.opacity = opacity;
    });
}

function normalizeBaseName(name) {
    if (!name) return '';
    return name.replace(/\.(csv|srt|mp4|webm|mov|avi)$/i, '').replace(/_translated$/i, '');
}

function findTranslatedFileId(originalName) {
    const base = normalizeBaseName(originalName);
    const translatedBase = `${base}_translated`;
    const match = cachedFiles.find(f => normalizeBaseName(f.name) === translatedBase);
    return match ? match.id : null;
}

async function loadTranslatedCaptions() {
    if (!translatedFileId) return;
    if (translatedData) return;
    try {
        const response = await fetch(`/api/files/${translatedFileId}`);
        if (!response.ok) {
            showNotification('Error loading translated captions', 'error');
            return;
        }
        const fileData = await response.json();
        translatedData = fileData.data;
    } catch (error) {
        console.error('Translated load error:', error);
        showNotification('Error loading translated captions', 'error');
    }
}

function updateVideoProgress() {
    if (!fullVideoElement) return;
    const progressFill = document.getElementById('videoProgressFill');
    const timeDisplay = document.getElementById('videoTimelineTime');
    if (!progressFill) return;
    
    const percent = (fullVideoElement.currentTime / fullVideoElement.duration) * 100;
    progressFill.style.width = `${percent}%`;
    
    // Update time display
    if (timeDisplay) {
        const currentTime = fullVideoElement.currentTime;
        const minutes = Math.floor(currentTime / 60);
        const seconds = Math.floor(currentTime % 60);
        timeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

function seekVideo(e) {
    if (!fullVideoElement) return;
    const progressBar = document.getElementById('videoProgressBar');
    const rect = progressBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    fullVideoElement.currentTime = percent * fullVideoElement.duration;
}

// Enable drag-to-seek on progress bar
let isDragging = false;

document.addEventListener('DOMContentLoaded', () => {
    const progressBar = document.getElementById('videoProgressBar');
    if (!progressBar) return;
    
    const startDrag = (e) => {
        isDragging = true;
        progressBar.classList.add('dragging');
        updateSeekPosition(e);
    };
    
    const updateSeekPosition = (e) => {
        if (!isDragging || !fullVideoElement) return;
        e.preventDefault();
        
        const rect = progressBar.getBoundingClientRect();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clickX = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, clickX / rect.width));
        fullVideoElement.currentTime = percent * fullVideoElement.duration;
    };
    
    const endDrag = () => {
        isDragging = false;
        progressBar.classList.remove('dragging');
    };
    
    // Mouse events
    progressBar.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', updateSeekPosition);
    document.addEventListener('mouseup', endDrag);
    
    // Touch events for mobile
    progressBar.addEventListener('touchstart', startDrag);
    document.addEventListener('touchmove', updateSeekPosition);
    document.addEventListener('touchend', endDrag);
});

function togglePlayPause() {
    if (!fullVideoElement) return;
    if (fullVideoElement.paused) {
        fullVideoElement.play();
    } else {
        fullVideoElement.pause();
    }
}

function skipVideo(seconds) {
    if (!fullVideoElement) return;
    fullVideoElement.currentTime = Math.max(0, fullVideoElement.currentTime + seconds);
}

function updatePlayPauseIcon() {
    const icon = document.getElementById('playPauseIcon');
    if (!icon || !fullVideoElement) return;
    icon.textContent = fullVideoElement.paused ? '▶' : '⏸';
}

// Auth functions
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        isAdmin = data.isAdmin;
        updateUIForAuth();
    } catch (error) {
        console.error('Error checking auth:', error);
    }
}

function updateUIForAuth() {
    console.log('updateUIForAuth called, isAdmin:', isAdmin);
    
    if (isAdmin) {
        document.getElementById('adminPanel').style.display = 'flex';
        document.getElementById('loginBtn').style.display = 'none';
        document.getElementById('downloadBtn').style.display = 'inline-block';
        document.getElementById('exportSrtBtn').style.display = 'inline-block';
        document.getElementById('folderControls').style.display = 'block';
        document.getElementById('thumbnailGenSection').style.display = 'block';
        document.getElementById('bulkActionsBar').style.display = 'flex';
    } else {
        document.getElementById('adminPanel').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'inline-block';
        document.getElementById('downloadBtn').style.display = 'none';
        document.getElementById('exportSrtBtn').style.display = 'none';
        document.getElementById('folderControls').style.display = 'none';
        document.getElementById('thumbnailGenSection').style.display = 'none';
        document.getElementById('bulkActionsBar').style.display = 'none';
    }
    updateBulkDeleteUI();
    
    // Reload files to show/hide admin buttons
    loadFiles();
    
    // Update shared mode UI if editor is open
    if (currentFileId) {
        updateUIForSharedMode();
    }
}

async function generateAllThumbnails() {
    if (!confirm('Generate thumbnails for all videos? This may take a few minutes.')) return;
    
    const btn = document.getElementById('generateThumbnailsBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;
    
    try {
        const response = await fetch('/api/generate-thumbnails', {
            method: 'POST'
        });
        
        if (response.ok) {
            const result = await response.json();
            showNotification(result.message, 'success');
            btn.textContent = originalText;
            btn.disabled = false;
            loadFiles(); // Reload to show thumbnails
        } else {
            const error = await response.json();
            showNotification('Error: ' + (error.error || 'Failed'), 'error');
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function openLoginModal() {
    document.getElementById('loginModal').classList.add('active');
    document.getElementById('loginError').textContent = '';
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
    document.getElementById('loginForm').reset();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            isAdmin = true;
            closeLoginModal();
            updateUIForAuth();
            showNotification('Logged in successfully', 'success');
        } else {
            document.getElementById('loginError').textContent = 'Invalid credentials';
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'Login failed';
    }
}

async function handleLogout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        isAdmin = false;
        updateUIForAuth();
        closeEditor();
        showNotification('Logged out successfully', 'success');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Upload functions
function toggleUploadMode() {
    const isBulk = document.getElementById('uploadModeToggle').checked;
    uploadMode = isBulk ? 'bulk' : 'single';
    
    const bulkInfo = document.getElementById('bulkUploadInfo');
    const singleInfo = document.getElementById('singleUploadInfo');
    const dropZoneText = document.getElementById('dropZoneText');
    const browseBtn = document.getElementById('browseBtn');
    const fileInput = document.getElementById('fileInput');
    
    // Clear any selected files when switching modes
    clearSelectedFiles();
    
    if (uploadMode === 'bulk') {
        bulkInfo.style.display = 'block';
        singleInfo.style.display = 'none';
        browseBtn.textContent = 'Browse Folders';
        fileInput.setAttribute('webkitdirectory', '');
        fileInput.setAttribute('directory', '');
    } else {
        bulkInfo.style.display = 'none';
        singleInfo.style.display = 'block';
        browseBtn.textContent = 'Browse Files';
        fileInput.removeAttribute('webkitdirectory');
        fileInput.removeAttribute('directory');
    }
    
    updateDropZoneText();
}

function openUploadModal() {
    document.getElementById('uploadModal').classList.add('active');
    document.getElementById('uploadError').textContent = '';
    document.getElementById('selectedFilesList').style.display = 'none';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadSubmitBtn').disabled = true;
    
    // Reset upload mode
    document.getElementById('uploadModeToggle').checked = true;
    uploadMode = 'bulk';
    toggleUploadMode();
    
    // Update folder dropdown in upload modal
    const uploadToFolder = document.getElementById('uploadToFolder');
    const folderOptions = folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    uploadToFolder.innerHTML = '<option value="">All Files (No Folder)</option>' + folderOptions;
    
    // Setup drag and drop
    setupUploadDropZone();
    
    // Setup file input change
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileSelection);
}

function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
    document.getElementById('uploadForm').reset();
    document.getElementById('selectedFilesList').style.display = 'none';
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadSubmitBtn').disabled = true;
    document.getElementById('uploadError').textContent = '';
    document.getElementById('uploadError').style.color = '';
    
    const clearBtn = document.getElementById('clearFilesBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    
    const filesList = document.getElementById('filesList');
    if (filesList) filesList.innerHTML = '';
    
    const fileCount = document.getElementById('fileCount');
    if (fileCount) fileCount.textContent = '0';
    
    // Clear selected files
    window.selectedFiles = null;
}

function setupUploadDropZone() {
    const dropZone = document.getElementById('dropZone');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        });
    });
    
    dropZone.addEventListener('drop', (e) => {
        let files = Array.from(e.dataTransfer.files);
        
        if (uploadMode === 'bulk') {
            // Filter to only caption and video files
            files = files.filter(f => isCaptionFileName(f.name) || isVideoFileName(f.name));
            
            if (files.length === 0) {
                showNotification('No valid files found. Please drag folders with caption and video files.', 'error');
                return;
            }
            
            // Accumulate in bulk mode too
            if (window.selectedFiles && window.selectedFiles.length > 0) {
                files = [...window.selectedFiles, ...files];
            }
            
            displaySelectedFiles(files);
        } else {
            // Single mode: Accumulate files (keep 1 caption file and 1 video max)
            const newCaptionFiles = files.filter(f => isCaptionFileName(f.name));
            const newVideoFiles = files.filter(f => isVideoFileName(f.name));
            
            // Get existing files if any
            const existingFiles = window.selectedFiles || [];
            const existingCaptions = existingFiles.filter(f => isCaptionFileName(f.name));
            const existingVideos = existingFiles.filter(f => isVideoFileName(f.name));
            
            // Logic: Keep 1 caption file and 1 video. New files replace old ones of same type.
            let finalCaption = null;
            let finalVideo = null;
            
            // If new caption dropped, use it (replaces old). Otherwise keep existing.
            if (newCaptionFiles.length > 0) {
                finalCaption = newCaptionFiles[0];
            } else if (existingCaptions.length > 0) {
                finalCaption = existingCaptions[0];
            }
            
            // If new video dropped, use it (replaces old). Otherwise keep existing.
            if (newVideoFiles.length > 0) {
                finalVideo = newVideoFiles[0];
            } else if (existingVideos.length > 0) {
                finalVideo = existingVideos[0];
            }
            
            files = [];
            if (finalCaption) files.push(finalCaption);
            if (finalVideo) files.push(finalVideo);
            
            console.log('Final files for single mode:', files.length, '- Captions:', !!finalCaption, 'Video:', !!finalVideo);
            
            if (files.length > 0) {
                displaySelectedFiles(files);
            } else {
                showNotification('Please drop caption and/or video files', 'error');
            }
        }
    });
}

function handleFileSelection(e) {
    let files = Array.from(e.target.files);
    
    if (uploadMode === 'bulk') {
        // Bulk mode: Accumulate files from multiple folder selections
        files = files.filter(f => isCaptionFileName(f.name) || isVideoFileName(f.name));
        
        if (files.length === 0) {
            const errorText = `No ${getCaptionPluralDescription()} or video files found`;
            showNotification('No valid files found in selected folder', 'error');
            document.getElementById('uploadError').textContent = errorText;
            return;
        }
        
        // Append to existing selected files
        if (window.selectedFiles && window.selectedFiles.length > 0) {
            const existingFiles = window.selectedFiles;
            files = [...existingFiles, ...files];
        }
    } else {
        // Single mode: Accumulate until we have 1 caption file and 1 video
        const newCaptionFiles = files.filter(f => isCaptionFileName(f.name));
        const newVideoFiles = files.filter(f => isVideoFileName(f.name));
        
        // Get existing files if any
        const existingFiles = window.selectedFiles || [];
        const existingCaptions = existingFiles.filter(f => isCaptionFileName(f.name));
        const existingVideos = existingFiles.filter(f => isVideoFileName(f.name));
        
        // Combine: take 1 caption file and 1 video
        const allCaptions = [...existingCaptions, ...newCaptionFiles];
        const allVideos = [...existingVideos, ...newVideoFiles];
        
        files = [];
        if (allCaptions.length > 0) files.push(allCaptions[0]); // Take first caption file
        if (allVideos.length > 0) files.push(allVideos[0]); // Take first video
        
        if (files.length === 0) {
            showNotification('Please select caption and/or video files', 'error');
            return;
        }
    }
    
    if (files.length > 0) {
        displaySelectedFiles(files);
    }
    
    // Reset the file input so files can be selected again
    e.target.value = '';
}

function displaySelectedFiles(files) {
    console.log('displaySelectedFiles called with:', files.length, 'files');
    
    const selectedFilesList = document.getElementById('selectedFilesList');
    const filesList = document.getElementById('filesList');
    const fileCount = document.getElementById('fileCount');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    const uploadError = document.getElementById('uploadError');
    const clearBtn = document.getElementById('clearFilesBtn');
    
    selectedFilesList.style.display = 'block';
    fileCount.textContent = files.length;
    
    // Show clear button
    if (clearBtn) clearBtn.style.display = 'inline-block';
    
    // Separate by type
    const captionFiles = files.filter(f => isCaptionFileName(f.name));
    const videoFiles = files.filter(f => isVideoFileName(f.name));
    const translatedCaptionFiles = captionFiles.filter(f => /_translated\.(srt|csv)$/i.test(f.name));
    const originalCaptionFiles = captionFiles.filter(f => !/_translated\.(srt|csv)$/i.test(f.name));
    
    console.log('Caption files:', captionFiles.length, 'Videos:', videoFiles.length);
    
    // Validate in single mode
    if (uploadMode === 'single') {
        if (captionFiles.length !== 1 || videoFiles.length !== 1) {
            if (captionFiles.length === 0 && videoFiles.length === 0) {
                uploadError.textContent = `Please select 1 video and 1 ${getCaptionFileDescription()}`;
            } else if (captionFiles.length === 0) {
                uploadError.textContent = `✓ VIDEO selected. Now drop a ${getCaptionFileDescription()} (not another video!).`;
            } else if (videoFiles.length === 0) {
                uploadError.textContent = `✓ ${getCaptionFileDescription()} selected. Now drop a VIDEO FILE (.mp4, .mov, .webm, .avi).`;
            } else {
                uploadError.textContent = `Too many files. Single mode needs exactly 1 ${getCaptionFileDescription()} + 1 video`;
            }
            uploadError.style.color = '#f59e0b';
            uploadError.style.fontWeight = 'bold';
            submitBtn.disabled = true;
        } else {
            // Have exactly 1 caption file and 1 video - check names
            const captionName = normalizeCaptionBaseName(captionFiles[0].name);
            const videoName = videoFiles[0].name.replace(/\.(mp4|webm|mov|avi)$/i, '');
            
            if (captionName !== videoName) {
                uploadError.textContent = `⚠️ Names don't match! Caption: "${captionName}" vs Video: "${videoName}"`;
                uploadError.style.color = '#f59e0b';
            } else {
                uploadError.textContent = '✓ Ready to upload! Names match perfectly.';
                uploadError.style.color = '#10b981';
            }
            submitBtn.disabled = false;
        }
    } else {
        // Bulk mode info
        if (captionFiles.length > 0 && videoFiles.length > 0) {
            uploadError.textContent = `✓ Ready: ${captionFiles.length} caption file(s), ${videoFiles.length} videos`;
            uploadError.style.color = '#10b981';
            submitBtn.disabled = false;
        } else if (captionFiles.length > 0) {
            uploadError.textContent = `✓ ${captionFiles.length} caption file(s) selected. Add videos folder for pairing.`;
            uploadError.style.color = '#f59e0b';
            submitBtn.disabled = false; // Allow uploading caption files without videos
        } else if (videoFiles.length > 0) {
            uploadError.textContent = `✓ ${videoFiles.length} videos selected. Add ${getCaptionPluralDescription()} for pairing.`;
            uploadError.style.color = '#f59e0b';
            submitBtn.disabled = false;
        } else {
            uploadError.textContent = '';
            submitBtn.disabled = true;
        }
    }
    
    filesList.innerHTML = `
        ${originalCaptionFiles.length > 0 ? `<div class="file-type-group">
            <strong>📄 Original Captions (${originalCaptionFiles.length}):</strong>
            ${originalCaptionFiles.map(f => `<div class="file-item">${f.name} (${(f.size / 1024).toFixed(1)} KB)</div>`).join('')}
        </div>` : ''}
        ${translatedCaptionFiles.length > 0 ? `<div class="file-type-group">
            <strong>🌐 Translated Captions (${translatedCaptionFiles.length}):</strong>
            ${translatedCaptionFiles.map(f => `<div class="file-item">${f.name} (${(f.size / 1024).toFixed(1)} KB)</div>`).join('')}
        </div>` : ''}
        ${videoFiles.length > 0 ? `<div class="file-type-group">
            <strong>🎥 Video Files (${videoFiles.length}):</strong>
            ${videoFiles.map(f => `<div class="file-item">${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)</div>`).join('')}
        </div>` : ''}
    `;
    
    submitBtn.disabled = false;
    
    // Store files for upload
    window.selectedFiles = files;
}

function clearSelectedFiles() {
    console.log('Clearing selected files');
    window.selectedFiles = null;
    document.getElementById('selectedFilesList').style.display = 'none';
    document.getElementById('uploadError').textContent = '';
    document.getElementById('uploadError').style.color = '';
    document.getElementById('uploadSubmitBtn').disabled = true;
    
    const filesList = document.getElementById('filesList');
    if (filesList) filesList.innerHTML = '';
    
    const fileCount = document.getElementById('fileCount');
    if (fileCount) fileCount.textContent = '0';
    
    const clearBtn = document.getElementById('clearFilesBtn');
    if (clearBtn) clearBtn.style.display = 'none';
}

async function handleUpload(e) {
    e.preventDefault();
    
    console.log('Upload triggered!');
    console.log('Upload mode:', uploadMode);
    console.log('Selected files:', window.selectedFiles);
    
    const files = window.selectedFiles || [];
    if (files.length === 0) {
        console.log('No files selected!');
        document.getElementById('uploadError').textContent = 'Please select files to upload';
        showNotification('Please select files to upload', 'error');
        return;
    }
    
    console.log('Starting upload with', files.length, 'files');
    
    const folderId = document.getElementById('uploadToFolder').value || null;
    const folderName = folderId ? (folders.find(f => f.id === folderId)?.name || 'folder') : 'All Files';
    
    // Show progress
    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const submitBtn = document.getElementById('uploadSubmitBtn');
    
    progressDiv.style.display = 'block';
    submitBtn.disabled = true;
    
    if (uploadMode === 'bulk') {
        // Bulk upload: send all files at once
        progressText.textContent = `Uploading ${files.length} files...`;
        progressBar.style.width = '50%';
        
        const formData = new FormData();
        files.forEach(file => {
            formData.append('files', file);
        });
        if (folderId) {
            formData.append('folderId', folderId);
        }
        
        try {
            console.log('Sending bulk upload request...');
            
            // Create abort controller for cancellation
            uploadAbortController = new AbortController();
            
            const response = await fetch('/api/upload-bulk', {
                method: 'POST',
                body: formData,
                credentials: 'include', // ensure cookies are sent (session)
                signal: uploadAbortController.signal
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', response.headers.get('content-type'));
            
            if (response.status === 401) {
                progressText.textContent = 'Error: Session expired. Please log in again.';
                showNotification('Session expired. Please log in again.', 'error');
                submitBtn.disabled = false;
                openLoginModal();
                return;
            } else if (response.ok) {
                const results = await response.json();
                progressBar.style.width = '100%';
                
                let message = `✓ Created ${results.created.length} file(s)`;
                if (results.matched.length > 0) {
                    message += `\n✓ Matched ${results.matched.length} video(s)`;
                }
                if (results.stacked && results.stacked.length > 0) {
                    message += `\n📚 Stacked ${results.stacked.length} version(s)`;
                }
                if (results.warnings && results.warnings.length > 0) {
                    message += `\n⚠ ${results.warnings.length} warning(s)`;
                }
                if (results.unmatched.captions.length > 0) {
                    message += `\n⚠ ${results.unmatched.captions.length} caption file(s) without matching video`;
                }
                if (results.unmatched.videos.length > 0) {
                    message += `\n⚠ ${results.unmatched.videos.length} video(s) without matching caption file (deleted)`;
                }
                if (results.errors.length > 0) {
                    message += `\n❌ ${results.errors.length} error(s)`;
                }
                
                progressText.textContent = message;
                
                // Show version warnings
                if (results.warnings && results.warnings.length > 0) {
                    let warningMessage = '⚠️ Version Upload Warnings:\n\n';
                    results.warnings.forEach(warning => {
                        warningMessage += `${warning.message}\n\n`;
                    });
                    warningMessage += '💡 Tip: Upload the matching caption file (.csv or .srt) with the same name as the new video version to update the captions.';
                    
                    setTimeout(() => {
                        alert(warningMessage);
                    }, 500);
                }
                
                // Show mismatches alert if any
                if (results.unmatched.captions.length > 0 || results.unmatched.videos.length > 0) {
                    let alertMessage = 'Upload complete with mismatches:\n\n';
                    
                    if (results.unmatched.captions.length > 0) {
                        alertMessage += `Caption files without matching video (${results.unmatched.captions.length}):\n`;
                        results.unmatched.captions.forEach(caption => {
                            alertMessage += `  • ${caption}\n`;
                        });
                        alertMessage += '\n';
                    }
                    
                    if (results.unmatched.videos.length > 0) {
                        alertMessage += `Videos without matching caption file (deleted) (${results.unmatched.videos.length}):\n`;
                        results.unmatched.videos.forEach(video => {
                            alertMessage += `  • ${video}\n`;
                        });
                    }
                    
                    setTimeout(() => {
                        alert(alertMessage);
                    }, results.warnings && results.warnings.length > 0 ? 2000 : 500);
                }
                
                setTimeout(() => {
                    closeUploadModal();
                    const successMsg = results.stacked && results.stacked.length > 0 
                        ? `Bulk upload complete: ${results.created.length} files created, ${results.stacked.length} versions stacked`
                        : `Bulk upload complete: ${results.created.length} files created`;
                    showNotification(successMsg, 'success');
                    loadFiles();
                }, 2500);
            } else {
                console.error('Upload failed with status:', response.status);
                const contentType = response.headers.get('content-type');
                let errorMessage = 'Upload failed';
                
                if (contentType && contentType.includes('application/json')) {
                    const error = await response.json();
                    errorMessage = error.error || error.details || 'Upload failed';
                    console.error('Error details:', error);
                } else {
                    const text = await response.text();
                    console.error('Non-JSON response:', text.substring(0, 500));
                    errorMessage = `Server error (${response.status})`;
                }
                
                progressText.textContent = `Error: ${errorMessage}`;
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('Upload exception:', error);
            if (error.name === 'AbortError') {
                progressText.textContent = 'Upload cancelled';
                showNotification('Upload cancelled', 'info');
            } else {
                progressText.textContent = `Error: ${error.message}`;
            }
            submitBtn.disabled = false;
        } finally {
            uploadAbortController = null;
        }
    } else {
        // Single mode: upload caption file first, then attach video
        const captionFile = files.find(f => isCaptionFileName(f.name));
        const videoFile = files.find(f => {
            const name = f.name.toLowerCase();
            return name.endsWith('.mp4') || name.endsWith('.webm') || 
                   name.endsWith('.mov') || name.endsWith('.avi');
        });
        
        // Validate names match
        const captionName = normalizeCaptionBaseName(captionFile.name);
        const videoName = videoFile.name.replace(/\.(mp4|webm|mov|avi)$/i, '');
        
        if (captionName !== videoName) {
            const proceed = confirm(`File names don't match!\nCaption: "${captionName}"\nVideo: "${videoName}"\n\nDo you want to proceed anyway?`);
            if (!proceed) {
                progressDiv.style.display = 'none';
                submitBtn.disabled = false;
                return;
            }
        }
        
        // Upload caption file
        progressText.textContent = `Uploading captions: ${captionFile.name}`;
        progressBar.style.width = '30%';
        
        const captionFormData = new FormData();
        captionFormData.append('file', captionFile);
        if (folderId) {
            captionFormData.append('folderId', folderId);
        }
        
        try {
            // Create abort controller for cancellation
            uploadAbortController = new AbortController();
            
            const captionResponse = await fetch('/api/upload', {
                method: 'POST',
                body: captionFormData,
                credentials: 'include', // include session cookie
                signal: uploadAbortController.signal
            });
            
            if (captionResponse.ok) {
                const captionResult = await captionResponse.json();
                const fileId = captionResult.fileId;
                
                // Upload video
                progressText.textContent = `Uploading video: ${videoFile.name}`;
                progressBar.style.width = '70%';
                
                const videoFormData = new FormData();
                videoFormData.append('video', videoFile);
                
                const videoResponse = await fetch(`/api/files/${fileId}/upload-video`, {
                    method: 'POST',
                    body: videoFormData,
                    credentials: 'include', // include session cookie
                    signal: uploadAbortController.signal
                });
                
                if (videoResponse.ok) {
                    const videoResult = await videoResponse.json();
                    progressBar.style.width = '100%';
                    
                    if (videoResult.isNewVersion && videoResult.warning) {
                        progressText.textContent = `Complete! New version uploaded. ${videoResult.warning}`;
                        setTimeout(() => {
                            alert(`⚠️ ${videoResult.warning}`);
                        }, 500);
                    } else {
                        progressText.textContent = `Complete! Caption file and video uploaded successfully`;
                    }
                    
                    setTimeout(() => {
                        closeUploadModal();
                        showNotification(videoResult.isNewVersion ? 'New version uploaded successfully' : 'File pair uploaded successfully', 'success');
                        loadFiles();
                    }, 1500);
                } else {
                    progressText.textContent = `Captions uploaded, but video upload failed`;
                    submitBtn.disabled = false;
                }
            } else {
                progressText.textContent = `Caption upload failed`;
                submitBtn.disabled = false;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                progressText.textContent = 'Upload cancelled';
                showNotification('Upload cancelled', 'info');
            } else {
                progressText.textContent = `Error: ${error.message}`;
            }
            submitBtn.disabled = false;
        } finally {
            uploadAbortController = null;
        }
    }
}

// Cancel upload function
function cancelUpload() {
    if (uploadAbortController) {
        uploadAbortController.abort();
        console.log('Upload cancelled by user');
    }
}

// Folder management
async function loadFolders() {
    try {
        const response = await fetch('/api/folders');
        folders = await response.json();
        updateFolderSelects();
    } catch (error) {
        console.error('Error loading folders:', error);
    }
}

function updateFolderSelects() {
    const targetFolder = document.getElementById('targetFolder');
    
    const folderOptions = folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    
    if (targetFolder) {
        targetFolder.innerHTML = '<option value="">All Files (No Folder)</option>' + folderOptions;
    }
}

function copyShareUrl(url) {
    navigator.clipboard.writeText(url);
    showNotification('Share link copied to clipboard!', 'success');
}

function openCreateFolderModal() {
    document.getElementById('createFolderModal').classList.add('active');
    document.getElementById('folderError').textContent = '';
    document.getElementById('folderName').focus();
}

function closeCreateFolderModal() {
    document.getElementById('createFolderModal').classList.remove('active');
    document.getElementById('createFolderForm').reset();
}

async function handleCreateFolder(e) {
    e.preventDefault();
    const name = document.getElementById('folderName').value.trim();
    
    try {
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            closeCreateFolderModal();
            showNotification('Folder created successfully', 'success');
            await loadFolders();
            loadFiles();
        } else {
            document.getElementById('folderError').textContent = 'Failed to create folder';
        }
    } catch (error) {
        document.getElementById('folderError').textContent = 'Failed to create folder';
    }
}

function openAssignFolderModal(event, fileId) {
    event.stopPropagation();
    fileToMove = fileId;
    document.getElementById('assignFolderModal').classList.add('active');
}

function closeAssignFolderModal() {
    document.getElementById('assignFolderModal').classList.remove('active');
    fileToMove = null;
}

async function assignToFolder() {
    if (!fileToMove) return;
    
    const folderId = document.getElementById('targetFolder').value || null;
    
    try {
        const response = await fetch(`/api/files/${fileToMove}/folder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId })
        });
        
        if (response.ok) {
            closeAssignFolderModal();
            showNotification('File moved successfully', 'success');
            loadFiles();
        }
    } catch (error) {
        showNotification('Error moving file', 'error');
    }
}

// File management
async function loadFiles() {
    try {
        const response = await fetch('/api/files');
        const allFiles = await response.json();
        cachedFiles = allFiles;
        
        console.log('Loaded files:', allFiles);
        
        // Render explorer view
        renderFolderExplorer(allFiles);
    } catch (error) {
        console.error('Error loading files:', error);
    }
}

function toggleGroupView() {
    const isGrouped = document.getElementById('groupViewToggle').checked;
    loadFiles(); // Reload with grouping
}

function renderFolderExplorer(allFiles) {
    // If viewing shared folder, only show that folder's content
    if (selectedFolder) {
        const folderFiles = allFiles.filter(f => f.folderId === selectedFolder);
        const folder = folders.find(f => f.id === selectedFolder);
        
        const foldersContainer = document.getElementById('foldersContainer');
        const allFilesSection = document.querySelector('.explorer-section');
        
        // Hide "All Files" section
        if (allFilesSection) {
            allFilesSection.style.display = 'none';
        }
        
        // Show only the selected folder
        if (folder) {
            foldersContainer.innerHTML = `
                <div class="explorer-section">
                    <div class="explorer-header">
                        <span class="toggle-icon">▼</span>
                        <strong>📁 ${folder.name}</strong>
                        <span class="file-count-badge">${folderFiles.length}</span>
                    </div>
                    <div id="folder_${folder.id}" class="explorer-content">
                        <div class="file-grid">
                            ${folderFiles.length === 0 ? 
                                '<p class="loading" style="margin: 10px 0;">No files in this folder</p>' :
                                folderFiles.map(file => renderFileCard(file)).join('')
                            }
                        </div>
                    </div>
                </div>
            `;
        }
        return;
    }
    
    // Normal view: show all folders
    // Group files by folder
    const unorganized = allFiles.filter(f => !f.folderId);
    const organized = {};
    
    allFiles.forEach(file => {
        if (file.folderId) {
            if (!organized[file.folderId]) {
                organized[file.folderId] = [];
            }
            organized[file.folderId].push(file);
        }
    });
    
    // Render "All Files" section
    const allFilesList = document.getElementById('allFilesList');
    if (unorganized.length === 0) {
        allFilesList.innerHTML = '<p class="loading" style="margin: 10px 0;">No unorganized files. Drag files here to remove from folders.</p>';
    } else {
        allFilesList.innerHTML = unorganized.map(file => renderFileCard(file)).join('');
    }
    document.getElementById('allFilesCount').textContent = unorganized.length;
    
    // Make "All Files" section a drop target
    const allFilesContent = document.getElementById('allFilesContent');
    setupDropZone(allFilesContent, null);
    
    // Render folder sections
    const foldersContainer = document.getElementById('foldersContainer');
    if (folders.length === 0) {
        foldersContainer.innerHTML = '';
    } else {
        foldersContainer.innerHTML = folders.map(folder => {
            const folderFiles = organized[folder.id] || [];
            const shareUrl = `${window.location.origin}/folder/${folder.id}`;
            
            return `
                <div class="explorer-section">
                    <div class="explorer-header collapsed" onclick="toggleSection('folder_${folder.id}')">
                        <span class="toggle-icon">▼</span>
                        <strong>📁 ${folder.name}</strong>
                        <span class="file-count-badge">${folderFiles.length}</span>
                        ${isAdmin ? `
                            <div class="folder-actions">
                                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); copyShareUrl('${shareUrl}')">🔗 Copy Link</button>
                                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteFolder('${folder.id}')">Delete</button>
                            </div>
                        ` : ''}
                    </div>
                    <div id="folder_${folder.id}" class="explorer-content collapsed" data-folder-id="${folder.id}">
                        <div class="file-grid">
                            ${folderFiles.length === 0 ? 
                                '<p class="loading" style="margin: 10px 0;">Drop files here to add them to this folder</p>' :
                                folderFiles.map(file => renderFileCard(file)).join('')
                            }
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Setup drop zones for all folders
        folders.forEach(folder => {
            const folderContent = document.getElementById(`folder_${folder.id}`);
            if (folderContent) {
                setupDropZone(folderContent, folder.id);
            }
        });
    }
    
    // Make file cards draggable
    if (isAdmin) {
        setTimeout(() => {
            document.querySelectorAll('.file-card').forEach(card => {
                card.setAttribute('draggable', 'true');
                card.addEventListener('dragstart', handleDragStart);
                card.addEventListener('dragend', handleDragEnd);
            });
        }, 100);
    }
}

// Drag and Drop functionality
let draggedFileId = null;

function handleDragStart(e) {
    draggedFileId = e.currentTarget.dataset.fileId;
    e.currentTarget.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.currentTarget.style.opacity = '1';
}

function setupDropZone(element, folderId) {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        element.style.background = '#ede9fe';
    });
    
    element.addEventListener('dragleave', (e) => {
        element.style.background = '';
    });
    
    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        element.style.background = '';
        
        if (!draggedFileId) return;
        
        try {
            const response = await fetch(`/api/files/${draggedFileId}/folder`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folderId: folderId })
            });
            
            if (response.ok) {
                const folderName = folderId ? (folders.find(f => f.id === folderId)?.name || 'folder') : 'All Files';
                showNotification(`File moved to ${folderName}`, 'success');
                loadFiles();
            }
        } catch (error) {
            showNotification('Error moving file', 'error');
        }
        
        draggedFileId = null;
    });
}

function renderFileCard(file) {
    // Remove caption extension from display name
    const displayName = stripCaptionExtension(file.name);
    
    const videoBadge = file.hasVideo ? '<span class="video-badge">🎥</span>' : '';
    const commentBadge = file.commentCount > 0 ? `<span class="comment-badge">💬 ${file.commentCount}</span>` : '';
    
    // Version badge for stacked files
    const versionBadge = file.isStacked && file.versionCount > 0 
        ? `<span class="version-badge" title="${file.versionCount} version(s) stacked">📚 v${file.versionCount}</span>` 
        : '';
    
    // Thumbnail display
    let thumbnailHtml = '';
    if (file.thumbnailFile) {
        thumbnailHtml = `<div class="file-thumbnail"><img src="/api/thumbnails/${file.thumbnailFile}" alt="Video thumbnail" onerror="this.parentElement.innerHTML='<div class=\\'thumbnail-placeholder\\'>🎥</div>'"></div>`;
    } else if (file.hasVideo) {
        thumbnailHtml = '<div class="file-thumbnail"><div class="thumbnail-placeholder">🎥</div></div>';
    } else {
        thumbnailHtml = '<div class="file-thumbnail"><div class="thumbnail-placeholder">📄</div></div>';
    }
    
    // Checkbox for bulk selection (admin only)
    const isSelected = selectedFiles.has(file.id);
    const checkboxHtml = isAdmin ? `
        <input type="checkbox" 
               class="file-select-checkbox" 
               data-file-id="${file.id}"
               ${isSelected ? 'checked' : ''}
               onchange="event.stopPropagation(); toggleFileSelection('${file.id}');"
               onclick="event.stopPropagation();">
    ` : '';
    
    // Action buttons (admin only) - ALWAYS show if admin
    const actionButtonsHtml = isAdmin ? `
        <div class="file-actions" style="display: flex !important;">
            <button class="btn-icon btn-move" onclick="openAssignFolderModal(event, '${file.id}')" title="Move to folder">📁</button>
            <button class="btn-icon btn-delete" onclick="deleteFile(event, '${file.id}')" title="Delete file">🗑️</button>
        </div>
    ` : '';
    
    return `
        <div class="file-card ${file.completed ? 'completed' : ''} ${selectedFiles.has(file.id) ? 'selected' : ''} ${file.isStacked ? 'stacked' : ''}"
             data-file-id="${file.id}"
             draggable="true"
             ondragstart="handleDragStart(event)"
             ondragend="handleDragEnd(event)"
             onclick="openFile('${file.id}')">
            ${checkboxHtml}
            ${thumbnailHtml}
            <div class="file-card-content">
                <div class="file-card-left">
                    <span class="completion-badge ${file.completed ? 'completed' : 'in-progress'}">
                        ${file.completed ? '✓' : '⏳'}
                    </span>
                    <div class="file-card-title">
                        <div class="file-name-with-badges">
                            <h3>${displayName}</h3>
                            <div class="file-badges">
                                ${videoBadge}
                                ${commentBadge}
                                ${versionBadge}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="file-card-right">
                    <div class="file-info">
                        <span>📊 ${file.rowCount} rows</span>
                        <span>📅 ${new Date(file.uploadDate).toLocaleDateString()}</span>
                    </div>
                    ${actionButtonsHtml}
                </div>
            </div>
        </div>
    `;
}

function toggleSection(sectionId) {
    const content = document.getElementById(sectionId + 'Content') || document.getElementById(sectionId);
    if (!content) return;
    
    const section = content.closest('.explorer-section');
    const header = section ? section.querySelector('.explorer-header') : content.previousElementSibling;
    
    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        if (header) header.classList.remove('collapsed');
        // If expanding a folder, rebuild cachedFiles order unchanged
    } else {
        content.classList.add('collapsed');
        if (header) header.classList.add('collapsed');
    }
}

async function deleteFolder(folderId) {
    if (!confirm('Delete this folder? Files will be moved to "All Files".')) return;
    
    try {
        const response = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Folder deleted successfully', 'success');
            await loadFolders();
            loadFiles();
        }
    } catch (error) {
        showNotification('Error deleting folder', 'error');
    }
}

function buildCurrentFileList(fileId) {
    // Build ordered list within the same folder (or unorganized if no folder)
    let list = [];
    const current = cachedFiles.find(f => f.id === fileId);
    if (!current) return [];
    
    const folderId = current.folderId || null;
    if (folderId) {
        list = cachedFiles.filter(f => f.folderId === folderId);
    } else {
        list = cachedFiles.filter(f => !f.folderId);
    }
    // Sort by uploadDate desc (same as render order)
    list = list.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    currentFileList = list;
    currentFileIndex = list.findIndex(f => f.id === fileId);
    updateNavButtons();
    return list;
}

function getNeighborFile(direction) {
    if (!currentFileList.length || currentFileIndex === -1) return null;
    let idx = currentFileIndex + direction;
    if (idx < 0 || idx >= currentFileList.length) return null;
    return currentFileList[idx];
}

function updateNavButtons() {
    const prevBtn = document.getElementById('prevFileBtn');
    const nextBtn = document.getElementById('nextFileBtn');
    if (!prevBtn || !nextBtn) return;
    prevBtn.disabled = currentFileIndex <= 0;
    nextBtn.disabled = currentFileIndex === -1 || currentFileIndex >= currentFileList.length - 1;
}

function goToPrevFile() {
    const neighbor = getNeighborFile(-1);
    if (neighbor) openFile(neighbor.id);
}

function goToNextFile() {
    const neighbor = getNeighborFile(1);
    if (neighbor) openFile(neighbor.id);
}

async function openFile(fileId) {
    // Toggle: if same file is clicked, close editor
    if (currentFileId === fileId) {
        closeEditor();
        return;
    }
    
    try {
        const response = await fetch(`/api/files/${fileId}`);
        const fileData = await response.json();

        // Build navigation list within same folder
        buildCurrentFileList(fileId);

        currentFileId = fileId;
        originalData = fileData.data;
        currentData = originalData;
        isCompleted = fileData.completed || false;
        currentVideoFile = fileData.videoFile || null;
        videoComments = fileData.videoComments || [];
        renderVideoCommentMarkers();

        console.log('File opened:', fileData.originalName);
        console.log('Video file:', currentVideoFile);

        document.getElementById('currentFileName').textContent = stripCaptionExtension(fileData.originalName);
        document.getElementById('completionCheckbox').checked = isCompleted;
        
        // Set video mode as default if there's a video
        if (currentVideoFile) {
            videoMode = 'full';
        } else {
            videoMode = 'hover'; // Table mode if no video
        }
        
        // Show editor as modal
        const editorSection = document.getElementById('editorSection');
        editorSection.style.display = 'block';
        editorSection.classList.add('editor-modal-active');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        
        // Setup video section (this will update UI based on videoMode)
        setupVideoSection();
        
        renderTable();
        updateStats();
        updateNavButtons();
        
        // Render caption check table by default (in video mode)
        renderCaptionCheckTable();
        
        // Initialize mode toggle labels (Caption Checking Mode is default)
        const videoCommentsMode = document.getElementById('videoCommentsMode');
        const modeLabelLeft = document.getElementById('modeLabelLeft');
        const modeLabelRight = document.getElementById('modeLabelRight');
        if (videoCommentsMode && !videoCommentsMode.checked) {
            if (modeLabelLeft) modeLabelLeft.classList.add('active');
            if (modeLabelRight) modeLabelRight.classList.remove('active');
        }
        
        // Hide elements for shared folder view
        updateUIForSharedMode();

        // Reset translation state, wire translation data if present
        translationEnabled = false;
        translatedData = fileData.translation?.data || null;
        // Fallback: if backend didn't inline it, find sibling translated entry
        translatedFileId = translatedData ? null : findTranslatedFileId(fileData.originalName);
        const translationToggleBtn = document.getElementById('translationToggleBtn');
        if (translationToggleBtn) {
            translationToggleBtn.textContent = 'Translations: Off';
            translationToggleBtn.disabled = !(translatedData || translatedFileId);
        }
        const downloadTranslatedBtn = document.getElementById('downloadTranslatedBtn');
        if (downloadTranslatedBtn) {
            downloadTranslatedBtn.disabled = !(translatedData || translatedFileId);
        }
    } catch (error) {
        showNotification('Error loading file', 'error');
    }
}

// Check if we're in shared / read-only mode (any viewer who is NOT admin)
function isSharedMode() {
    return !isAdmin;
}

// Hide/show elements based on shared mode
function updateUIForSharedMode() {
    const sharedMode = isSharedMode();
    
    // Elements to hide in shared mode
    const elementsToHide = [
        { id: 'filterKeep', type: 'label' },
        { id: 'filterCut', type: 'label' },
        { id: 'statsKeep', type: 'element' },
        { id: 'statsCut', type: 'element' },
        { id: 'statsKeepDuration', type: 'element' },
        { id: 'columnToggleBtn', type: 'element' },
        { id: 'exportCommentsBtn', type: 'element' },
        { id: 'downloadSplitCaptionsBtn', type: 'element' }
    ];
    
    elementsToHide.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            // For labels, hide the parent label element
            if (item.type === 'label') {
                const label = element.closest('label');
                if (label) label.style.display = sharedMode ? 'none' : '';
            } else {
                element.style.display = sharedMode ? 'none' : '';
            }
        }
    });
    
    // Hide/show filter-controls container based on visibility
    const filterControls = document.querySelector('.filter-controls');
    if (filterControls) {
        if (sharedMode) {
            filterControls.style.display = 'none';
        } else {
            filterControls.style.display = '';
        }
    }
}

// Toggle header controls (useful on mobile to free space)
function toggleEditorControls() {
    const editorSection = document.getElementById('editorSection');
    const headerTop = document.querySelector('.editor-header-top');
    const actions = document.querySelector('.editor-actions');
    const btn = document.getElementById('toggleEditorControlsBtn');
    if (!editorSection || !headerTop || !actions || !btn) return;
    
    const collapsed = editorSection.classList.toggle('editor-controls-collapsed');
    if (collapsed) {
        btn.textContent = 'Show Controls';
    } else {
        btn.textContent = 'Hide Controls';
    }
}

async function deleteFile(event, fileId) {
    event.stopPropagation();
    
    console.log('deleteFile called for:', fileId);
    
    if (!confirm('Are you sure you want to delete this file?')) {
        console.log('Delete cancelled by user');
        return;
    }

    try {
        console.log('Sending delete request...');
        const response = await fetch(`/api/files/${fileId}`, {
            method: 'DELETE'
        });

        console.log('Delete response:', response.status, response.ok);

        if (response.ok) {
            showNotification('File deleted successfully', 'success');
            loadFiles();
            if (currentFileId === fileId) {
                closeEditor();
            }
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Delete failed:', errorData);
            showNotification(`Delete failed: ${errorData.error || 'Unknown error'}`, 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showNotification(`Error deleting file: ${error.message}`, 'error');
    }
}

// Column visibility management
function initializeColumnVisibility() {
    if (currentData.length === 0) return;
    
    const columns = Object.keys(currentData[0]);
    
    // Initialize all columns as visible if not already set
    // Hide start_time and end_time by default (we use start_seconds/end_seconds instead)
    columns.forEach(col => {
        if (columnVisibility[col] === undefined) {
            if (col === 'start_time' || col === 'end_time') {
                columnVisibility[col] = false; // Hide these by default
            } else {
                columnVisibility[col] = true;
            }
        }
    });
    
    // Render column toggle panel
    const columnToggles = document.getElementById('columnToggles');
    columnToggles.innerHTML = columns.map(col => `
        <label>
            <input type="checkbox" 
                   class="column-toggle" 
                   data-column="${col}" 
                   ${columnVisibility[col] ? 'checked' : ''}>
            ${col}
        </label>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.column-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const column = e.target.dataset.column;
            columnVisibility[column] = e.target.checked;
            applyColumnVisibility();
        });
    });
}

function toggleColumnPanel() {
    const panel = document.getElementById('columnPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function applyColumnVisibility() {
    const columns = Object.keys(currentData[0]);
    
    columns.forEach((col, index) => {
        const isVisible = columnVisibility[col];
        const cells = document.querySelectorAll(`th:nth-child(${index + 1}), td:nth-child(${index + 1})`);
        
        cells.forEach(cell => {
            if (isVisible) {
                cell.classList.remove('hidden-column');
            } else {
                cell.classList.add('hidden-column');
            }
        });
    });
}

// Table rendering
function renderTable() {
    if (currentData.length === 0) return;

    const columns = Object.keys(currentData[0]);
    const thead = document.getElementById('tableHead');
    const tbody = document.getElementById('tableBody');

    // Initialize column visibility
    initializeColumnVisibility();

    // Render header
    thead.innerHTML = `
        <tr>
            ${columns.map(col => `<th>${col}</th>`).join('')}
        </tr>
    `;

    // Render body
    renderTableBody();
    
    // Apply column visibility
    applyColumnVisibility();
}

function renderTableBody() {
    const tbody = document.getElementById('tableBody');
    const columns = Object.keys(currentData[0]);
    const filterKeep = document.getElementById('filterKeep').checked;
    const filterCut = document.getElementById('filterCut').checked;

    const filteredData = currentData.filter(row => {
        const action = row.action ? row.action.toLowerCase() : '';
        if (action === 'keep' && !filterKeep) return false;
        if (action === 'cut' && !filterCut) return false;
        return true;
    });

    tbody.innerHTML = filteredData.map((row, index) => {
        const actualIndex = currentData.indexOf(row);
        const action = row.action ? row.action.toLowerCase() : '';
        const hasVideo = currentVideoFile ? 'has-video' : '';
        
        return `
            <tr class="row-${action}" 
                data-index="${actualIndex}"
                onclick="highlightRow(${actualIndex})">
                ${columns.map(col => {
                    if (col === 'action') {
                        return `
                            <td class="action-cell">
                                <button class="action-toggle ${action}" onclick="toggleAction(${actualIndex}); event.stopPropagation();">
                                    ${action.toUpperCase()}
                                </button>
                            </td>
                        `;
                    } else if (col === 'reason') {
                        return `
                            <td>
                                <input type="text" class="reason-input" value="${row[col] || ''}" 
                                    onchange="updateReason(${actualIndex}, this.value)"
                                    onclick="event.stopPropagation()">
                            </td>
                        `;
                    } else if (col === 'text') {
                        return `
                            <td class="text-cell ${hasVideo}"
                                onmouseenter="playVideoSegment(${actualIndex})" 
                                onmouseleave="stopVideoSegment()">
                                <input type="text" class="reason-input" value="${row[col] || ''}" 
                                    onchange="updateText(${actualIndex}, this.value)"
                                    onclick="event.stopPropagation()">
                            </td>
                        `;
                    } else {
                        return `<td>${row[col] || ''}</td>`;
                    }
                }).join('')}
            </tr>
        `;
    }).join('');
}

function toggleAction(index) {
    const currentAction = currentData[index].action ? currentData[index].action.toLowerCase() : 'keep';
    currentData[index].action = currentAction === 'keep' ? 'cut' : 'keep';
    renderTableBody();
    updateStats();
}

function updateReason(index, value) {
    currentData[index].reason = value;
}

function updateText(index, value) {
    currentData[index].text = value;
}

function applyFilters() {
    renderTableBody();
}

function updateStats() {
    const keepCount = currentData.filter(row => row.action && row.action.toLowerCase() === 'keep').length;
    const cutCount = currentData.filter(row => row.action && row.action.toLowerCase() === 'cut').length;
    
    // Calculate durations
    let keepDuration = 0;
    let totalDuration = 0;
    
    currentData.forEach(row => {
        const duration = parseFloat(row.duration);
        if (!isNaN(duration)) {
            totalDuration += duration;
            
            if (row.action && row.action.toLowerCase() === 'keep') {
                keepDuration += duration;
            }
        }
    });

    document.getElementById('statsKeep').textContent = `Keep: ${keepCount}`;
    document.getElementById('statsCut').textContent = `Cut: ${cutCount}`;
    document.getElementById('statsKeepDuration').textContent = `Keep Duration: ${keepDuration.toFixed(2)}s`;
    document.getElementById('statsTotalDuration').textContent = `Total Duration: ${totalDuration.toFixed(2)}s`;
}

// Completion toggle
async function toggleCompletion() {
    isCompleted = document.getElementById('completionCheckbox').checked;
    await saveCompletionStatus();
}

async function saveCompletionStatus() {
    if (!currentFileId) return;
    try {
        const payload = { 
            data: currentData,
            completed: isCompleted
        };
        const response = await fetch(`/api/files/${currentFileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            showNotification('Error updating completion status', 'error');
        } else {
            showNotification(isCompleted ? 'Marked as completed' : 'Marked as in progress', 'success');
        }
    } catch (error) {
        console.error('Completion save error:', error);
        showNotification('Error updating completion status', 'error');
    }
}

// Save and download
async function saveChanges() {
    if (!currentFileId) return;

    // Clear any pending save
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    // Debounce: wait 500ms before actually saving
    saveTimeout = setTimeout(async () => {
        // Get current completion status from checkbox
        isCompleted = document.getElementById('completionCheckbox').checked;
        
        console.log('Saving file:', currentFileId);
        console.log('Completed status:', isCompleted);

        try {
            const payload = { 
                data: currentData,
                completed: isCompleted
            };
            
            console.log('Sending payload:', JSON.stringify(payload, null, 2).substring(0, 200) + '...');
            
            const response = await fetch(`/api/files/${currentFileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Save successful:', result);
                showNotification('Changes saved successfully', 'success');
                // Refresh file list to show updated completion status
                await loadFiles();
            } else {
                // Handle different error statuses
                if (response.status === 429) {
                    const errorText = await response.text();
                    showNotification('Too many requests. Please wait a moment before saving again.', 'error');
                    console.error('Rate limit exceeded:', errorText);
                } else {
                    try {
                        const errorData = await response.json();
                        console.error('Save failed:', errorData);
                        showNotification('Error saving changes', 'error');
                    } catch (parseError) {
                        const errorText = await response.text();
                        console.error('Save failed (non-JSON):', errorText);
                        showNotification('Error saving changes', 'error');
                    }
                }
            }
        } catch (error) {
            console.error('Save error:', error);
            if (error.message && error.message.includes('429')) {
                showNotification('Too many requests. Please wait a moment before saving again.', 'error');
            } else {
                showNotification('Error saving changes', 'error');
            }
        }
        
        saveTimeout = null;
    }, 500); // Wait 500ms before saving
}

async function downloadFile() {
    if (!currentFileId) return;

    try {
        const response = await fetch(`/api/files/${currentFileId}/download`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = document.getElementById('currentFileName').textContent;
            a.click();
            window.URL.revokeObjectURL(url);
            showNotification('File downloaded successfully', 'success');
        } else {
            showNotification('Error downloading file', 'error');
        }
    } catch (error) {
        showNotification('Error downloading file', 'error');
    }
}

async function exportSrt() {
    if (!currentFileId) return;

    try {
        const response = await fetch(`/api/files/${currentFileId}/export-srt`);
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const baseName = document.getElementById('currentFileName').textContent || 'captions';
            a.download = `${baseName}.srt`;
            a.click();
            window.URL.revokeObjectURL(url);
            showNotification('SRT file exported successfully', 'success');
        } else {
            showNotification('Error exporting SRT file', 'error');
        }
    } catch (error) {
        console.error('Export SRT error:', error);
        showNotification('Error exporting SRT file', 'error');
    }
}

// Video functionality
function setupVideoSection() {
    const fullVideoSection = document.getElementById('fullVideoSection');
    
    if (currentVideoFile) {
        // Disable native controls and prevent fullscreen
        if (fullVideoElement) {
            fullVideoElement.controls = false;
            fullVideoElement.setAttribute('playsinline', '');
            fullVideoElement.setAttribute('webkit-playsinline', '');
            fullVideoElement.setAttribute('x5-playsinline', '');
            
            // Prevent fullscreen on mobile
            fullVideoElement.addEventListener('webkitbeginfullscreen', (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            });
            
            fullVideoElement.addEventListener('fullscreenchange', (e) => {
                if (document.fullscreenElement === fullVideoElement) {
                    document.exitFullscreen();
                }
            });
        }
        
        // Load videos in both players
        hoverVideoElement.src = `/api/videos/${currentVideoFile}`;
        fullVideoElement.src = `/api/videos/${currentVideoFile}`;
        hoverVideoElement.loop = loopVideoPlayback;
        fullVideoElement.loop = loopVideoPlayback;
        
        // Scale caption based on video dimensions when video loads
        fullVideoElement.addEventListener('loadedmetadata', updateCaptionSize);
        fullVideoElement.addEventListener('resize', updateCaptionSize);
        
        // Show full video section if video exists
        fullVideoSection.style.display = videoMode === 'full' ? 'block' : 'none';
        
        // Initialize mobile overlay on video load
        fullVideoElement.addEventListener('loadedmetadata', () => {
            updateMobileCaptionOverlay(0);
        }, { once: true });
    } else {
        fullVideoSection.style.display = 'none';
    }
    
    updateVideoModeUI();
}

function updateCaptionSize() {
    if (!fullVideoElement) return;
    
    const captionDiv = document.getElementById('videoCaption');
    if (!captionDiv) return;
    
    // Get video's natural dimensions (1090x1920 for your videos)
    const videoWidth = fullVideoElement.videoWidth || 1090;
    const videoHeight = fullVideoElement.videoHeight || 1920;
    
    // Get displayed dimensions
    const displayedHeight = fullVideoElement.clientHeight || fullVideoElement.offsetHeight;
    
    // Premiere Pro settings: 55px font on 1920px height video
    // Calculate scale factor based on displayed height
    const scaleFactor = displayedHeight / videoHeight;
    const baseFontSize = 55; // Premiere Pro font size
    const baseStroke = 5; // Premiere Pro stroke size
    
    // Apply scaled font size and stroke
    const scaledFontSize = baseFontSize * scaleFactor;
    const scaledStroke = Math.max(1, baseStroke * scaleFactor);
    
    captionDiv.style.fontSize = `${scaledFontSize}px`;
    
    // Create text-shadow outline effect (better than webkit-text-stroke)
    // Use a single layer of shadows for a clean outline
    const strokeWidth = Math.round(scaledStroke);
    const shadows = [];
    
    // Create outline with just one layer in 8 directions (not multiple layers)
    shadows.push(`${strokeWidth}px 0 0 #373737`);      // Right
    shadows.push(`${-strokeWidth}px 0 0 #373737`);     // Left
    shadows.push(`0 ${strokeWidth}px 0 #373737`);      // Down
    shadows.push(`0 ${-strokeWidth}px 0 #373737`);     // Up
    shadows.push(`${strokeWidth}px ${strokeWidth}px 0 #373737`); // Bottom-right
    shadows.push(`${-strokeWidth}px ${strokeWidth}px 0 #373737`); // Bottom-left
    shadows.push(`${strokeWidth}px ${-strokeWidth}px 0 #373737`); // Top-right
    shadows.push(`${-strokeWidth}px ${-strokeWidth}px 0 #373737`); // Top-left
    
    captionDiv.style.textShadow = shadows.join(', ');
    captionDiv.style.webkitTextFillColor = '#F7F6F2';
    captionDiv.style.color = '#F7F6F2';
}

function toggleVideoMode() {
    console.log('Toggle video mode clicked. Current:', videoMode);
    videoMode = videoMode === 'hover' ? 'full' : 'hover';
    console.log('New mode:', videoMode);
    updateVideoModeUI();
}

function updateVideoModeUI() {
    const fullVideoSection = document.getElementById('fullVideoSection');
    const videoModeBtn = document.getElementById('videoModeBtn');
    const tableContainer = document.querySelector('.table-container');
    
    console.log('updateVideoModeUI called');
    console.log('Video mode:', videoMode);
    console.log('Table container found:', !!tableContainer);
    console.log('Full video section found:', !!fullVideoSection);
    
    if (!videoModeBtn || !fullVideoSection) {
        console.error('Missing elements!');
        return;
    }
    
    if (currentVideoFile) {
        videoModeBtn.style.display = 'inline-block';
        
        if (videoMode === 'full') {
            // Video Mode: Show video editor, hide main table
            fullVideoSection.style.display = 'block';
            if (tableContainer) {
                tableContainer.style.display = 'none';
                console.log('Table HIDDEN in video mode');
            }
            videoModeBtn.textContent = 'Table Mode';
            // Update caption size after showing video
            setTimeout(() => updateCaptionSize(), 100);
        } else {
            // Table Mode: Hide video editor, show main table
            fullVideoSection.style.display = 'none';
            if (tableContainer) {
                tableContainer.style.display = 'block';
                console.log('Table SHOWN in table mode');
            }
            videoModeBtn.textContent = 'Video Mode';
        }
    } else {
        videoModeBtn.style.display = 'none';
        fullVideoSection.style.display = 'none';
        if (tableContainer) tableContainer.style.display = 'block';
    }
}

async function handleVideoUpload(e) {
    e.preventDefault();
    
    const fileInput = document.getElementById('videoInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const formData = new FormData();
    formData.append('video', file);
    
    try {
        const response = await fetch(`/api/files/${currentFileId}/upload-video`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            currentVideoFile = result.videoFile;
            setupVideoSection();
            showNotification('Video uploaded successfully', 'success');
        } else {
            showNotification('Error uploading video', 'error');
        }
    } catch (error) {
        console.error('Video upload error:', error);
        showNotification('Error uploading video', 'error');
    }
}

function playVideoSegment(index) {
    if (!currentVideoFile || !hoverVideoElement) return;
    
    const row = currentData[index];
    const startTime = parseFloat(row.start_seconds || 0);
    const endTime = parseFloat(row.end_seconds || 0);
    
    if (endTime <= startTime) return;
    
    // Show hover video player
    document.getElementById('hoverVideoPlayer').style.display = 'block';
    
    // Set video to start time
    hoverVideoElement.currentTime = startTime;
    hoverVideoElement.play().catch(err => console.log('Play error:', err));
    
    // Loop the segment
    clearInterval(videoPlayInterval);
    videoPlayInterval = setInterval(() => {
        if (hoverVideoElement.currentTime >= endTime) {
            hoverVideoElement.currentTime = startTime;
        }
    }, 50);
}

function stopVideoSegment() {
    clearInterval(videoPlayInterval);
    if (hoverVideoElement) {
        hoverVideoElement.pause();
    }
    document.getElementById('hoverVideoPlayer').style.display = 'none';
}

function updateTimestampDisplay() {
    if (!fullVideoElement) {
        console.log('No fullVideoElement');
        return;
    }
    
    const currentTime = fullVideoElement.currentTime;
    const hours = Math.floor(currentTime / 3600);
    const minutes = Math.floor((currentTime % 3600) / 60);
    const seconds = Math.floor(currentTime % 60);
    const millis = Math.floor((currentTime % 1) * 1000);
    
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    const timestampDisplay = document.getElementById('currentTimestamp');
    if (timestampDisplay) timestampDisplay.textContent = timeString;
    
    // Find which segment we're in
    const currentSegment = findSegmentAtTime(currentTime);
    const captionDiv = document.getElementById('videoCaption');
    const showCaptionsToggle = document.getElementById('showCaptionsToggle');
    
    console.log('Time:', currentTime.toFixed(2), 'Segment found:', !!currentSegment, 'Caption div:', !!captionDiv, 'Toggle checked:', showCaptionsToggle?.checked);
    
    if (currentSegment) {
        console.log('Current segment text:', currentSegment.text);
        
        // Update video caption overlay
        if (captionDiv && showCaptionsToggle && showCaptionsToggle.checked) {
            captionDiv.textContent = currentSegment.text || '';
            captionDiv.classList.add('visible');
            console.log('Caption should be visible now');
        } else if (captionDiv) {
            captionDiv.classList.remove('visible');
        }
        
        // Update caption check table highlight
        updateCaptionCheckTableHighlight();
        
        // Update mobile caption overlay
        updateMobileCaptionOverlay(currentTime);
    } else {
        if (captionDiv) captionDiv.classList.remove('visible');
        
        // Clear highlight if no segment
        const rows = document.querySelectorAll('#captionCheckBody tr');
        rows.forEach(row => row.classList.remove('current-segment'));
        
        // Update mobile overlay anyway (might be at start/end)
        updateMobileCaptionOverlay(currentTime);
    }
}

function updateMobileCaptionOverlay(currentTime) {
    const mobileBody = document.getElementById('mobileCaptionBody');
    const mobileOverlay = document.getElementById('mobileCaptionOverlay');
    const videoCommentsMode = document.getElementById('videoCommentsMode');
    
    if (!mobileBody || !mobileOverlay) return;
    
    // Only show on mobile AND when in Caption Checking Mode
    const isMobile = window.innerWidth <= 768;
    const isCommentsMode = videoCommentsMode && videoCommentsMode.checked;
    
    if (isMobile && !isCommentsMode) {
        mobileOverlay.style.display = 'block';
    } else {
        mobileOverlay.style.display = 'none';
        return;
    }
    
    // Find current segment index
    let currentIndex = -1;
    for (let i = 0; i < currentData.length; i++) {
        const start = parseFloat(currentData[i].start_seconds || 0);
        const end = parseFloat(currentData[i].end_seconds || 0);
        if (currentTime >= start && currentTime < end) {
            currentIndex = i;
            break;
        }
    }
    
    // Show 4 rows: 1 before current, current, 2 after
    const startIdx = Math.max(0, currentIndex - 1);
    const endIdx = Math.min(currentData.length, startIdx + 4);
    const visibleRows = currentData.slice(startIdx, endIdx);
    
    mobileBody.innerHTML = visibleRows.map((row, localIdx) => {
        const globalIdx = startIdx + localIdx;
        const isCurrent = globalIdx === currentIndex;
        const start = parseFloat(row.start_seconds || 0).toFixed(2);
        const end = parseFloat(row.end_seconds || 0).toFixed(2);
        
        return `
            <tr class="${isCurrent ? 'current-caption-row' : ''}" 
                data-index="${globalIdx}"
                onclick="jumpToMobileCaptionRow(${globalIdx})">
                <td>${start}</td>
                <td>${end}</td>
                <td>
                    <input type="text" 
                           class="mobile-text-edit" 
                           value="${(row.text || '').replace(/"/g, '&quot;')}"
                           data-index="${globalIdx}"
                           onclick="event.stopPropagation()"
                           onchange="updateCaptionTextMobile(${globalIdx}, this.value)">
                </td>
            </tr>
        `;
    }).join('');
}

function updateCaptionTextMobile(index, newText) {
    if (!currentData[index]) return;
    currentData[index].text = newText;
    saveChanges(); // Auto-save on edit
}

// Jump video when tapping caption rows in mobile overlay
window.jumpToMobileCaptionRow = function(index) {
    if (!fullVideoElement || !currentData[index]) return;
    const startTime = parseFloat(currentData[index].start_seconds || 0);
    fullVideoElement.currentTime = startTime;
    
    // Update progress bar immediately
    updateVideoProgress();
    
    fullVideoElement.play();
};

function toggleCaptionDisplay() {
    const captionDiv = document.getElementById('videoCaption');
    const isChecked = document.getElementById('showCaptionsToggle').checked;
    
    if (!isChecked) {
        captionDiv.classList.remove('visible');
        captionDiv.textContent = '';
    }
    // If checked, the timeupdate event will show captions
}

function findSegmentAtTime(time) {
    for (let i = 0; i < currentData.length; i++) {
        const segment = currentData[i];
        const start = parseFloat(segment.start_seconds || 0);
        const end = parseFloat(segment.end_seconds || 0);
        
        // Include the end time for the last segment to handle edge cases
        const isLastSegment = i === currentData.length - 1;
        if (time >= start && (isLastSegment ? time <= end : time < end)) {
            return { ...segment, index: i };
        }
    }
    return null;
}

function toggleVideoCommentsMode() {
    const isChecked = document.getElementById('videoCommentsMode').checked;
    const captionCheckTable = document.getElementById('captionCheckTable');
    const videoCommentsPanel = document.getElementById('videoCommentsPanel');
    const exportBtn = document.getElementById('exportCommentsBtn');
    const modeLabelLeft = document.getElementById('modeLabelLeft');
    const modeLabelRight = document.getElementById('modeLabelRight');
    
    // Mobile overlays
    const mobileCaptionOverlay = document.getElementById('mobileCaptionOverlay');
    const mobileCommentInput = document.getElementById('mobileCommentInput');
    const commentsTimeline = document.getElementById('videoCommentsTimeline');
    const isMobile = window.innerWidth <= 768;
    
    if (isChecked) {
        // Video Comments Mode
        if (captionCheckTable) captionCheckTable.style.display = 'none';
        if (videoCommentsPanel) videoCommentsPanel.style.display = 'block';
        
        // Always hide caption overlay, show comment input on mobile
        if (mobileCaptionOverlay) mobileCaptionOverlay.style.display = 'none';
        if (isMobile && mobileCommentInput) {
            mobileCommentInput.style.display = 'flex';
        } else if (mobileCommentInput) {
            mobileCommentInput.style.display = 'none';
        }
        renderVideoCommentMarkers();
        
        // Only show export button if not in shared mode
        if (exportBtn && !isSharedMode()) {
            exportBtn.style.display = 'inline-block';
        }
        // Update labels
        if (modeLabelLeft) modeLabelLeft.classList.remove('active');
        if (modeLabelRight) modeLabelRight.classList.add('active');
        loadGeneralComments();
    } else {
        // Caption Checking Mode
        if (captionCheckTable) captionCheckTable.style.display = 'block';
        if (videoCommentsPanel) videoCommentsPanel.style.display = 'none';
        
        // Always hide comment input
        if (mobileCommentInput) mobileCommentInput.style.display = 'none';
        
        // Show caption table only on mobile
        if (isMobile && mobileCaptionOverlay) {
            mobileCaptionOverlay.style.display = 'block';
        }
        
        if (exportBtn) exportBtn.style.display = 'none';
        // Update labels
        if (modeLabelLeft) modeLabelLeft.classList.add('active');
        if (modeLabelRight) modeLabelRight.classList.remove('active');
    }
}

function renderVideoCommentMarkers() {
    const timeline = document.getElementById('videoCommentsTimeline');
    if (!timeline || !fullVideoElement) return;
    
    const duration = fullVideoElement.duration || 1;
    
    timeline.innerHTML = videoComments.map(comment => {
        if (!comment.timestamp) return '';
        const percent = (comment.timestamp / duration) * 100;
        return `<div class="comment-marker" style="left: ${percent}%"
                     title="${comment.text}"
                     onclick="jumpToComment(${comment.timestamp})"></div>`;
    }).join('');
    
    timeline.style.display = videoComments.length ? 'block' : 'none';
}

function jumpToComment(timestamp) {
    if (!fullVideoElement) return;
    fullVideoElement.currentTime = timestamp;
    fullVideoElement.play();
}

function renderCaptionCheckTable() {
    const thead = document.getElementById('captionCheckHead');
    const tbody = document.getElementById('captionCheckBody');
    
    if (currentData.length === 0) return;
    
    // Render header with timestamps
    thead.innerHTML = `
        <tr>
            <th style="width: 100px;">Start</th>
            <th style="width: 100px;">End</th>
            <th>Text</th>
        </tr>
    `;
    
    // Helper to format seconds to readable time
    const formatTime = (seconds) => {
        const sec = parseFloat(seconds || 0);
        const mins = Math.floor(sec / 60);
        const secs = (sec % 60).toFixed(2);
        // Don't show "0:" prefix for times under 1 minute
        if (mins === 0) {
            return secs;
        }
        return `${mins}:${secs.padStart(5, '0')}`;
    };
    
    // Render body
    tbody.innerHTML = currentData.map((row, index) => {
        const startTime = formatTime(row.start_seconds);
        const endTime = formatTime(row.end_seconds);
        
        return `
            <tr data-index="${index}" onclick="jumpToCaptionSegment(${index}, event)">
                <td style="text-align: center; font-family: monospace; color: #6b7280;">${startTime}</td>
                <td style="text-align: center; font-family: monospace; color: #6b7280;">${endTime}</td>
                <td class="text-cell">
                    <input type="text" class="reason-input" value="${row.text || ''}" 
                        onchange="updateTextAndRefresh(${index}, this.value)"
                        onfocus="isEditingCaption=true;"
                        onblur="isEditingCaption=false;">
                </td>
            </tr>
        `;
    }).join('');
}

function updateTextAndRefresh(index, value) {
    // Update the data
    currentData[index].text = value;
    
    // Also re-render the main table so changes are reflected
    const tbody = document.getElementById('tableBody');
    if (tbody) {
        renderTableBody();
    }

    // Auto-save text changes (debounced inside saveChanges)
    saveChanges();
}

function jumpToCaptionSegment(index, evt) {
    if (evt && evt.target && evt.target.tagName === 'INPUT') return;
    if (isEditingCaption) return;
    if (!fullVideoElement) return;
    
    const row = currentData[index];
    const startTime = parseFloat(row.start_seconds || 0);
    
    fullVideoElement.currentTime = startTime;
    fullVideoElement.pause(); // do not auto-play when navigating from table
}

function updateCaptionCheckTableHighlight() {
    // Always update if caption check table is visible
    const captionCheckTable = document.getElementById('captionCheckTable');
    if (!captionCheckTable || captionCheckTable.style.display === 'none') return;
    
    if (!fullVideoElement) return;
    
    const currentTime = fullVideoElement.currentTime;
    const currentSegment = findSegmentAtTime(currentTime);
    
    if (currentSegment) {
        const rows = document.querySelectorAll('#captionCheckBody tr');
        rows.forEach(row => {
            const rowIndex = parseInt(row.getAttribute('data-index'));
            
            if (rowIndex === currentSegment.index) {
                row.classList.add('current-segment');
                // Auto-scroll only if enabled
                if (autoScrollCaptions) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                row.classList.remove('current-segment');
            }
        });
    } else {
        // Clear highlight if no segment
        const rows = document.querySelectorAll('#captionCheckBody tr');
        rows.forEach(row => row.classList.remove('current-segment'));
    }
}

function addCommentAtTimestamp() {
    if (!fullVideoElement) return;
    
    const comment = document.getElementById('commentInput').value.trim();
    if (!comment) {
        showNotification('Please enter a comment', 'error');
        return;
    }
    
    const currentTime = fullVideoElement.currentTime;
    const segment = findSegmentAtTime(currentTime);
    
    if (segment) {
        // Update the text field for this segment
        currentData[segment.index].text = comment;
        
        // Re-render table
        renderTableBody();
        
        // Highlight the updated row (without scrolling)
        highlightRow(segment.index, false);
        
        // Clear input
        document.getElementById('commentInput').value = '';
        
        showNotification(`Comment added to segment ${segment.segment}`, 'success');
    } else {
        showNotification('No segment found at current timestamp', 'error');
    }
}

function highlightRow(index, scroll = true) {
    // Remove previous selection
    document.querySelectorAll('tr.selected-row').forEach(row => {
        row.classList.remove('selected-row');
    });
    
    selectedRowIndex = index;
    
    // Add selection to current row
    const rows = document.querySelectorAll('tbody tr');
    rows.forEach((row, i) => {
        const rowIndex = parseInt(row.getAttribute('data-index'));
        if (rowIndex === index) {
            row.classList.add('selected-row');
            if (scroll) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });
}

function jumpToSelectedSegment() {
    if (selectedRowIndex === null || !fullVideoElement) {
        showNotification('No row selected. Click on a row to select it.', 'error');
        return;
    }
    
    const row = currentData[selectedRowIndex];
    const startTime = parseFloat(row.start_seconds || 0);
    
    fullVideoElement.currentTime = startTime;
    fullVideoElement.play();
}

function scrollToCurrentSegment() {
    if (!fullVideoElement) return;
    
    const currentTime = fullVideoElement.currentTime;
    const segment = findSegmentAtTime(currentTime);
    
    if (segment) {
        // Highlight and scroll to the current segment
        highlightRow(segment.index, true);
        showNotification(`Scrolled to segment ${segment.segment || segment.index + 1}`, 'success');
    } else {
        showNotification('No segment at current timestamp', 'error');
    }
}

// General Video Comments
function loadGeneralComments() {
    const commentsList = document.getElementById('generalCommentsList');
    
    if (!commentsList) return;
    
    if (videoComments.length === 0) {
        commentsList.innerHTML = '<p class="no-comments">No comments yet. Add one below!</p>';
    } else {
        commentsList.innerHTML = videoComments.map(comment => {
            const timestamp = comment.timestamp ? 
                `<span class="comment-timestamp">@ ${formatTimestamp(comment.timestamp)}</span>` : '';
            const date = new Date(comment.createdAt).toLocaleString();
            
            return `
                <div class="general-comment-item" data-comment-id="${comment.id}">
                    <div class="comment-header">
                        <span class="comment-author">${comment.author}</span>
                        ${timestamp}
                        <span class="comment-date">${date}</span>
                    </div>
                    <div class="comment-text">${escapeHtml(comment.text)}</div>
                    <div class="comment-actions">
                        ${comment.timestamp ? `<button class="btn-sm btn-secondary" onclick="jumpToCommentTimestamp('${comment.id}')">Jump to Time</button>` : ''}
                        <button class="btn-sm btn-secondary" onclick="editGeneralComment('${comment.id}')">Edit</button>
                        <button class="btn-sm btn-danger" onclick="deleteGeneralComment('${comment.id}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderVideoCommentMarkers();
}

function formatTimestamp(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function addGeneralComment() {
    const textarea = document.getElementById('generalCommentInput');
    const text = textarea.value.trim();
    
    if (!text) {
        showNotification('Please enter a comment', 'error');
        return;
    }
    
    // Always add timestamp if video is available and playing
    let timestamp = null;
    if (fullVideoElement && currentVideoFile) {
        timestamp = fullVideoElement.currentTime || 0;
    }
    
    try {
        const response = await fetch(`/api/files/${currentFileId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, timestamp })
        });
        
        if (response.ok) {
            const result = await response.json();
            videoComments.push(result.comment);
            loadGeneralComments();
            textarea.value = '';
            const timestampMsg = timestamp > 0 ? ` at ${formatTimestamp(timestamp)}` : '';
            showNotification(`Comment added${timestampMsg}`, 'success');
        } else {
            showNotification('Failed to add comment', 'error');
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        showNotification('Error adding comment', 'error');
    }
}

async function editGeneralComment(commentId) {
    const comment = videoComments.find(c => c.id === commentId);
    if (!comment) return;
    
    const newText = prompt('Edit comment:', comment.text);
    if (!newText || newText === comment.text) return;
    
    try {
        const response = await fetch(`/api/files/${currentFileId}/comments/${commentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: newText })
        });
        
        if (response.ok) {
            const result = await response.json();
            const index = videoComments.findIndex(c => c.id === commentId);
            if (index !== -1) {
                videoComments[index] = result.comment;
            }
            loadGeneralComments();
            showNotification('Comment updated', 'success');
        } else {
            showNotification('Failed to update comment', 'error');
        }
    } catch (error) {
        console.error('Error updating comment:', error);
        showNotification('Error updating comment', 'error');
    }
}

async function deleteGeneralComment(commentId) {
    if (!confirm('Delete this comment?')) return;
    
    try {
        const response = await fetch(`/api/files/${currentFileId}/comments/${commentId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            videoComments = videoComments.filter(c => c.id !== commentId);
            loadGeneralComments();
            showNotification('Comment deleted', 'success');
        } else {
            showNotification('Failed to delete comment', 'error');
        }
    } catch (error) {
        console.error('Error deleting comment:', error);
        showNotification('Error deleting comment', 'error');
    }
}

function jumpToCommentTimestamp(commentId) {
    const comment = videoComments.find(c => c.id === commentId);
    if (!comment || !comment.timestamp || !fullVideoElement) return;
    
    // Switch to full video mode if not already
    if (videoMode !== 'full') {
        toggleVideoMode();
    }
    
    fullVideoElement.currentTime = comment.timestamp;
    fullVideoElement.play();
    showNotification(`Jumped to ${formatTimestamp(comment.timestamp)}`, 'success');
}

async function exportComments() {
    if (!currentFileId || videoComments.length === 0) {
        showNotification('No comments to export', 'error');
        return;
    }
    
    try {
        // Format comments as text
        let textContent = `Video Review Comments\n`;
        textContent += `File: ${document.getElementById('currentFileName').textContent}\n`;
        textContent += `Date: ${new Date().toLocaleString()}\n`;
        textContent += `Total Comments: ${videoComments.length}\n`;
        textContent += `\n${'='.repeat(80)}\n\n`;
        
        videoComments.forEach((comment, index) => {
            textContent += `Comment ${index + 1}\n`;
            textContent += `Author: ${comment.author}\n`;
            textContent += `Date: ${new Date(comment.createdAt).toLocaleString()}\n`;
            if (comment.timestamp) {
                textContent += `Video Timestamp: ${formatTimestamp(comment.timestamp)}\n`;
            }
            textContent += `\n${comment.text}\n`;
            textContent += `\n${'-'.repeat(80)}\n\n`;
        });
        
        // Create blob and download
        const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const baseName = document.getElementById('currentFileName').textContent || 'captions';
        a.download = `${baseName}_comments.txt`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        showNotification('Comments exported successfully', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showNotification('Error exporting comments', 'error');
    }
}

async function closeEditor() {
    console.log('Closing editor...');
    
    // Stop any playing video
    stopVideoSegment();
    if (fullVideoElement) {
        fullVideoElement.pause();
        fullVideoElement.src = '';
    }
    if (hoverVideoElement) {
        hoverVideoElement.pause();
        hoverVideoElement.src = '';
    }
    
    // Hide all editor sections
    const editorSection = document.getElementById('editorSection');
    const columnPanel = document.getElementById('columnPanel');
    const hoverVideoPlayer = document.getElementById('hoverVideoPlayer');
    const fullVideoSection = document.getElementById('fullVideoSection');
    const generalCommentsSection = document.getElementById('generalCommentsSection');
    const videoModeBtn = document.getElementById('videoModeBtn');
    
    if (editorSection) {
        editorSection.style.display = 'none';
        editorSection.classList.remove('editor-modal-active');
        console.log('Editor section hidden');
    }
    if (columnPanel) columnPanel.style.display = 'none';
    if (hoverVideoPlayer) hoverVideoPlayer.style.display = 'none';
    if (fullVideoSection) fullVideoSection.style.display = 'none';
    if (videoModeBtn) videoModeBtn.style.display = 'none';
    
    // Re-enable background scrolling
    document.body.style.overflow = '';
    
    // Reset video modes
    document.getElementById('videoCommentsMode').checked = false;
    const exportCommentsBtn = document.getElementById('exportCommentsBtn');
    if (exportCommentsBtn) exportCommentsBtn.style.display = 'none';
    
    // Reset panels to default
    const captionCheckTable = document.getElementById('captionCheckTable');
    const videoCommentsPanel = document.getElementById('videoCommentsPanel');
    if (captionCheckTable) captionCheckTable.style.display = 'block';
    if (videoCommentsPanel) videoCommentsPanel.style.display = 'none';
    
    // Reset state
    currentFileId = null;
    currentData = [];
    isCompleted = false;
    currentVideoFile = null;
    selectedRowIndex = null;
    videoMode = 'hover';
    videoComments = [];
    
    await loadFiles(); // Refresh file list when closing editor
    
    console.log('Editor closed');
}

// Bulk Selection and Delete
function toggleFileSelection(fileId) {
    if (selectedFiles.has(fileId)) {
        selectedFiles.delete(fileId);
    } else {
        selectedFiles.add(fileId);
    }
    updateBulkDeleteUI();
}

function toggleSelectAll(e) {
    const isChecked = e.target.checked;
    const allFileCards = document.querySelectorAll('.file-card');
    
    if (isChecked) {
        // Select all visible files
        allFileCards.forEach(card => {
            const checkbox = card.querySelector('.file-select-checkbox');
            if (checkbox) {
                const fileId = checkbox.dataset.fileId;
                selectedFiles.add(fileId);
                checkbox.checked = true;
                card.classList.add('selected');
            }
        });
    } else {
        // Deselect all
        selectedFiles.clear();
        allFileCards.forEach(card => {
            const checkbox = card.querySelector('.file-select-checkbox');
            if (checkbox) {
                checkbox.checked = false;
                card.classList.remove('selected');
            }
        });
    }
    updateBulkDeleteUI();
}

function updateBulkDeleteUI() {
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    const cancelBtn = document.getElementById('cancelSelectionBtn');
    const selectedCount = document.getElementById('selectedCount');
    const selectedCountDisplay = document.getElementById('selectedCountDisplay');
    const selectAllCheckbox = document.getElementById('selectAllFiles');
    
    if (!deleteBtn || !cancelBtn || !selectedCount) return;
    
    if (selectedFiles.size > 0) {
        deleteBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'inline-block';
        selectedCount.textContent = selectedFiles.size;
        if (selectedCountDisplay) selectedCountDisplay.style.display = 'inline-block';
    } else {
        deleteBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        if (selectedCountDisplay) selectedCountDisplay.style.display = 'none';
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
    
    // Update checkboxes in cards
    document.querySelectorAll('.file-select-checkbox').forEach(checkbox => {
        const fileId = checkbox.dataset.fileId;
        checkbox.checked = selectedFiles.has(fileId);
        const card = checkbox.closest('.file-card');
        if (card) {
            if (selectedFiles.has(fileId)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }
    });
}

function cancelSelection() {
    selectedFiles.clear();
    updateBulkDeleteUI();
}

async function deleteSelectedFiles() {
    if (selectedFiles.size === 0) return;
    
    const count = selectedFiles.size;
    if (!confirm(`Delete ${count} selected file(s)? This cannot be undone!`)) return;
    
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    deleteBtn.textContent = 'Deleting...';
    deleteBtn.disabled = true;
    
    let deleted = 0;
    let failed = 0;
    
    for (const fileId of selectedFiles) {
        try {
            const response = await fetch(`/api/files/${fileId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                deleted++;
            } else {
                failed++;
            }
        } catch (error) {
            console.error('Error deleting file:', fileId, error);
            failed++;
        }
    }
    
    selectedFiles.clear();
    showNotification(`Deleted ${deleted} file(s). Failed: ${failed}`, deleted > 0 ? 'success' : 'error');
    
    deleteBtn.textContent = 'Delete Selected';
    deleteBtn.disabled = false;
    
    loadFiles();
}

// Notification
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}


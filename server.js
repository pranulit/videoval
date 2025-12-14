require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const bcrypt = require('bcrypt');
const ffmpeg = require('fluent-ffmpeg');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const CAPTION_EXTENSIONS = ['.csv', '.srt'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi'];

// Admin credentials from environment variables (REQUIRED)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD environment variable is required');
}
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';

// Validate configuration
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'your-secret-key-change-in-production') {
  console.error('⚠️  WARNING: SESSION_SECRET not set or using default template value!');
}

// Configure FFmpeg path if provided
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

// Trust proxy - MUST be set before initializing rate limiters
// Railway uses proxies, so we need to trust the proxy to get real client IPs
if (NODE_ENV === 'production') {
  app.set('trust proxy', true); // Trust all proxies for Railway
}

// Helper function to extract group key from filename (first 4 tokens)
function extractGroupKey(filename) {
  // Remove extension
  const nameWithoutExt = filename.replace(/\.(csv|mp4|webm|mov|avi)$/i, '');
  // Split by underscore and take first 4 tokens
  const tokens = nameWithoutExt.split('_');
  // Take first 4 tokens (e.g., LT0023_B251103_Person1+NL_677)
  return tokens.slice(0, 4).join('_');
}

// Helper function to normalize filename for matching
function normalizeFilename(filename) {
  return filename.replace(/\.(csv|srt|mp4|webm|mov|avi)$/i, '').replace(/_split$/i, '');
}

// Helper function to extract base name and version from filename
// Example: LT0023_B251106_Person13+NL_689_v001 -> base: LT0023_B251106_Person13+NL_689, version: v001
function extractBaseNameAndVersion(filename) {
  const nameWithoutExt = filename.replace(/\.(csv|srt|mp4|webm|mov|avi)$/i, '');
  
  // Match version pattern: _v001, _v0001, _v1, etc. at the end
  const versionMatch = nameWithoutExt.match(/_v(\d+)$/i);
  
  if (versionMatch) {
    const version = '_v' + versionMatch[1].padStart(3, '0'); // Normalize to v001 format
    const baseName = nameWithoutExt.substring(0, nameWithoutExt.length - versionMatch[0].length);
    return { baseName, version };
  }
  
  // No version found, return entire name as base
  return { baseName: nameWithoutExt, version: null };
}

// Helper function to find existing file entry by base name
function findFileByBaseName(baseName, folderId = null) {
  const files = fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
        return { id: content.id, ...content };
      } catch (e) {
        return null;
      }
    })
    .filter(f => f !== null);
  
  // Find file with matching base name
  for (const file of files) {
    const fileBase = extractBaseNameAndVersion(file.originalName).baseName;
    if (fileBase === baseName && (!folderId || file.folderId === folderId)) {
      return file;
    }
  }
  
  return null;
}

function isCaptionFile(filename) {
  return CAPTION_EXTENSIONS.includes(path.extname(filename).toLowerCase());
}

function isVideoFile(filename) {
  return VIDEO_EXTENSIONS.includes(path.extname(filename).toLowerCase());
}

function parseTimestampToSeconds(timestamp) {
  const sanitized = timestamp.replace(',', '.');
  const [hours, minutes, secondsPart] = sanitized.split(':');
  const seconds = parseFloat(secondsPart);
  return (parseInt(hours, 10) * 3600) + (parseInt(minutes, 10) * 60) + seconds;
}

function secondsToTimestamp(seconds) {
  const totalMillis = Math.round(seconds * 1000);
  const hrs = Math.floor(totalMillis / 3600000);
  const mins = Math.floor((totalMillis % 3600000) / 60000);
  const secs = Math.floor((totalMillis % 60000) / 1000);
  const millis = totalMillis % 1000;
  const pad = (value, size = 2) => String(value).padStart(size, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(millis, 3)}`;
}

function parseSrtContent(content) {
  const normalized = content.replace(/\r/g, '').trim();
  if (!normalized) {
    return [];
  }

  const blocks = normalized.split(/\n\n+/);
  const records = [];

  blocks.forEach((block) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) {
      return;
    }

    let lineIndex = 0;
    let segmentLabel = lines[lineIndex];
    if (/^\d+$/.test(segmentLabel)) {
      lineIndex += 1;
    } else {
      segmentLabel = (records.length + 1).toString();
    }

    if (lineIndex >= lines.length) {
      return;
    }

    const timingLine = lines[lineIndex];
    lineIndex += 1;
    const timingMatch = timingLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/);
    if (!timingMatch) {
      return;
    }

    const startSeconds = parseTimestampToSeconds(timingMatch[1]);
    const endSeconds = parseTimestampToSeconds(timingMatch[2]);
    const duration = Math.max(0, endSeconds - startSeconds);
    let text = lines.slice(lineIndex).join(' ').trim();

    // Strip any existing <font> tags or other simple HTML formatting
    text = text.replace(/<\/?font[^>]*>/gi, '');

    records.push({
      segment: segmentLabel,
      start_seconds: startSeconds.toFixed(3),
      end_seconds: endSeconds.toFixed(3),
      duration: duration.toFixed(3),
      start_time: secondsToTimestamp(startSeconds),
      end_time: secondsToTimestamp(endSeconds),
      text
    });
  });

  return records;
}

function parseCaptionFile(filePath, originalName) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.srt') {
    const records = parseSrtContent(fileContent);
    if (!records.length) {
      throw new Error('SRT file is empty or invalid');
    }
    return records;
  }

  return parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

// Helper function to generate video thumbnail
function generateThumbnail(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: ['00:00:01'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x?'  // Keep aspect ratio - width 320, height auto
      })
      .on('end', () => resolve(outputPath))
      .on('error', (err) => {
        console.error('Thumbnail generation error:', err);
        reject(err);
      });
  });
}

// Create necessary directories
// Note: In production (Railway), these should be mounted as volumes for data persistence
const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const thumbnailDir = path.join(__dirname, 'uploads', 'thumbnails');
// Move folders.json to data directory so it persists in the volume
const foldersFile = path.join(__dirname, 'data', 'folders.json');

// Ensure directories exist (use recursive: true for volume compatibility)
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(thumbnailDir)) fs.mkdirSync(thumbnailDir, { recursive: true });
if (!fs.existsSync(foldersFile)) fs.writeFileSync(foldersFile, JSON.stringify([]));

// Configure multer for CSV uploads
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const uploadCSV = multer({ 
  storage: csvStorage, 
  fileFilter: (req, file, cb) => {
    if (isCaptionFile(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV or SRT files are allowed'));
    }
  }
});

// Configure multer for video uploads
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const uploadVideo = multer({ 
  storage: videoStorage,
  fileFilter: (req, file, cb) => {
    if (isVideoFile(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed (.mp4, .webm, .mov, .avi)'));
    }
  }
});

// Configure multer for bulk upload (videos + CSVs)
const bulkStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});
const uploadBulk = multer({ 
  storage: bulkStorage,
  fileFilter: (req, file, cb) => {
    if (isCaptionFile(file.originalname) || isVideoFile(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV/SRT caption files and video files are allowed'));
    }
  }
});

// Rate limiting to prevent abuse
// Higher limits for production since multiple users may share same network
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to accommodate multiple users
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Increased from 50
  message: 'Too many uploads from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Session configuration
const sessionConfig = {
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: NODE_ENV === 'production', // HTTPS only in production
    sameSite: NODE_ENV === 'production' ? 'none' : 'strict' // 'none' needed for Cloudflare proxy
  }
};

app.use(session(sessionConfig));

// Authentication middleware
const requireAdmin = (req, res, next) => {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Routes

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USERNAME && await bcrypt.compare(password, ADMIN_PASSWORD_HASH)) {
    req.session.isAdmin = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check auth status
app.get('/api/auth-status', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// Upload CSV file (admin only)
app.post('/api/upload', requireAdmin, uploadLimiter, uploadCSV.single('file'), (req, res) => {
  try {
    const records = parseCaptionFile(req.file.path, req.file.originalname);
    
    const fileId = Date.now().toString();
    const dataFile = {
      id: fileId,
      originalName: req.file.originalname,
      uploadDate: new Date().toISOString(),
      completed: false,
      videoFile: null, // No video attached yet
      folderId: req.body.folderId || null, // Optional folder association
      videoComments: [], // General comments for the video
      groupKey: extractGroupKey(req.file.originalname), // First 4 tokens for grouping
      data: records
    };
    
    fs.writeFileSync(
      path.join(dataDir, `${fileId}.json`),
      JSON.stringify(dataFile, null, 2)
    );
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true, fileId, fileName: req.file.originalname });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    const message = error.message || 'Failed to process file';
    const statusCode = /invalid|empty/i.test(message) ? 400 : 500;
    res.status(statusCode).json({ error: message });
  }
});

// Bulk upload with automatic video/CSV pairing and version stacking (admin only)
app.post('/api/upload-bulk', requireAdmin, uploadLimiter, uploadBulk.array('files', 200), async (req, res) => {
  try {
    console.log('Bulk upload endpoint hit');
    console.log('req.files:', req.files);
    
    const uploadedFiles = req.files;
    
    if (!uploadedFiles || uploadedFiles.length === 0) {
      console.error('No files received in upload');
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    console.log('Bulk upload received:', uploadedFiles.length, 'files');
    
    // Separate caption and video files
    const captionFiles = uploadedFiles.filter(f => isCaptionFile(f.originalname));
    const videoFiles = uploadedFiles.filter(f => isVideoFile(f.originalname));
    
    console.log('Caption files:', captionFiles.length, 'Videos:', videoFiles.length);
    
    const results = {
      created: [],
      matched: [],
      stacked: [], // New: versions that were stacked
      warnings: [], // New: warnings about missing captions for new versions
      unmatched: { captions: [], videos: [] },
      errors: []
    };
    
    const folderId = req.body.folderId || null;
    
    // First pass: Check for version matches and generate warnings
    const versionWarnings = [];
    const videosToStack = [];
    
    for (const videoFile of videoFiles) {
      const { baseName, version } = extractBaseNameAndVersion(videoFile.originalname);
      
      if (version) {
        // This is a versioned video, check if base exists
        const existingFile = findFileByBaseName(baseName, folderId);
        
        if (existingFile) {
          // Found existing file with same base name
          // Check if caption file exists for this version
          const captionForVersion = captionFiles.find(cf => {
            const capBase = extractBaseNameAndVersion(cf.originalname).baseName;
            return capBase === baseName;
          });
          
          if (!captionForVersion) {
            const expectedCaptionName = baseName + (extractBaseNameAndVersion(videoFile.originalname).version || '') + '.csv';
            versionWarnings.push({
              video: videoFile.originalname,
              baseName: baseName,
              existingFile: existingFile.originalName,
              expectedCaption: expectedCaptionName,
              message: `⚠️ New video version detected: ${videoFile.originalname}\n\nNo matching caption file found for this new version.\nExpected caption file: ${expectedCaptionName} (or .srt)\n\nThe new video will temporarily use captions from the previous version (${existingFile.originalName}).\n\nYou can upload the matching caption file separately if needed.`
            });
          }
          
          videosToStack.push({
            videoFile: videoFile,
            existingFile: existingFile,
            captionFile: captionForVersion || null
          });
        }
      }
    }
    
    // Add warnings to results
    results.warnings = versionWarnings;
    
    // Process caption files first (non-versioned and new versions)
    const processedCaptions = new Set();
    
    for (const captionFile of captionFiles) {
      try {
        const records = parseCaptionFile(captionFile.path, captionFile.originalname);
        const { baseName, version } = extractBaseNameAndVersion(captionFile.originalname);
        const captionNormalized = normalizeFilename(captionFile.originalname);
        const groupKey = extractGroupKey(captionFile.originalname);
        
        // Check if this caption is for a version that needs stacking
        const stackInfo = videosToStack.find(s => {
          const stackBase = extractBaseNameAndVersion(s.videoFile.originalname).baseName;
          return stackBase === baseName && s.captionFile === captionFile;
        });
        
        if (stackInfo) {
          // This caption is for a versioned video that will be stacked
          processedCaptions.add(captionFile.originalname);
          continue; // Will be processed in stacking logic below
        }
        
        // Try to find matching video (non-versioned matching)
        let matchedVideo = null;
        const videoMatch = videoFiles.find(vf => {
          if (videosToStack.find(s => s.videoFile === vf)) return false; // Skip videos that will be stacked
          const videoNormalized = normalizeFilename(vf.originalname);
          return captionNormalized === videoNormalized;
        });
        
        let thumbnailFile = null;
        
        if (videoMatch) {
          matchedVideo = videoMatch.filename;
          results.matched.push({
            caption: captionFile.originalname,
            video: videoMatch.originalname
          });
          
          // Generate thumbnail for matched video
          const thumbnailFilename = `thumb-${videoMatch.filename}.png`;
          const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
          const videoPath = path.join(uploadDir, videoMatch.filename);
          
          try {
            await generateThumbnail(videoPath, thumbnailPath);
            thumbnailFile = thumbnailFilename;
            console.log('Thumbnail generated for:', videoMatch.originalname);
          } catch (thumbError) {
            console.error('Failed to generate thumbnail for:', videoMatch.originalname, thumbError);
          }
          
          // Remove from videoFiles to avoid double matching
          const index = videoFiles.indexOf(videoMatch);
          if (index > -1) videoFiles.splice(index, 1);
        } else {
          results.unmatched.captions.push(captionFile.originalname);
        }
        
        // Check if this caption is for an existing versioned file
        const existingFile = findFileByBaseName(baseName, folderId);
        if (existingFile && version && !matchedVideo) {
          // This is a new caption for an existing versioned file
          // Stack it as a new version
          const existingVersions = existingFile.versions || [];
          const newVersion = {
            version: version,
            originalName: captionFile.originalname,
            uploadDate: new Date().toISOString(),
            data: records,
            videoFile: null, // No video for this caption-only version
            thumbnailFile: null
          };
          
          existingVersions.push(newVersion);
          existingFile.versions = existingVersions;
          existingFile.lastModified = new Date().toISOString();
          
          // Update the file entry
          const filePath = path.join(dataDir, `${existingFile.id}.json`);
          fs.writeFileSync(filePath, JSON.stringify(existingFile, null, 2));
          
          results.stacked.push({
            baseName: baseName,
            version: version,
            type: 'caption',
            name: captionFile.originalname
          });
          
          processedCaptions.add(captionFile.originalname);
          fs.unlinkSync(captionFile.path);
          continue;
        }
        
        // Create new file entry (non-versioned or first version)
        const fileId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
        const dataFile = {
          id: fileId,
          originalName: captionFile.originalname,
          uploadDate: new Date().toISOString(),
          completed: false,
          videoFile: matchedVideo,
          thumbnailFile: thumbnailFile,
          folderId: folderId,
          videoComments: [],
          groupKey: groupKey,
          versions: version ? [{ version, originalName: captionFile.originalname, uploadDate: new Date().toISOString(), data: records }] : [],
          data: records
        };
        
        fs.writeFileSync(
          path.join(dataDir, `${fileId}.json`),
          JSON.stringify(dataFile, null, 2)
        );
        
        results.created.push({
          id: fileId,
          name: captionFile.originalname,
          hasVideo: !!matchedVideo,
          groupKey: groupKey,
          isVersioned: !!version
        });
        
        // Clean up uploaded caption file
        fs.unlinkSync(captionFile.path);
        processedCaptions.add(captionFile.originalname);
        
      } catch (error) {
        console.error('Error processing caption file:', captionFile.originalname, error);
        results.errors.push({
          file: captionFile.originalname,
          error: error.message
        });
        // Clean up on error
        if (fs.existsSync(captionFile.path)) {
          fs.unlinkSync(captionFile.path);
        }
      }
    }
    
    // Process version stacking for videos
    for (const stackInfo of videosToStack) {
      try {
        const { videoFile, existingFile, captionFile } = stackInfo;
        const { version } = extractBaseNameAndVersion(videoFile.originalname);
        
        // Generate thumbnail for new video version
        let thumbnailFile = null;
        const thumbnailFilename = `thumb-${videoFile.filename}.png`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
        const videoPath = path.join(uploadDir, videoFile.filename);
        
        try {
          await generateThumbnail(videoPath, thumbnailPath);
          thumbnailFile = thumbnailFilename;
        } catch (thumbError) {
          console.error('Failed to generate thumbnail for:', videoFile.originalname, thumbError);
        }
        
        // Load existing file data
        const filePath = path.join(dataDir, `${existingFile.id}.json`);
        const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Initialize versions array if not exists
        if (!fileData.versions) {
          fileData.versions = [];
          // Add current file as first version
          fileData.versions.push({
            version: extractBaseNameAndVersion(fileData.originalName).version || '_v001',
            originalName: fileData.originalName,
            uploadDate: fileData.uploadDate,
            data: fileData.data,
            videoFile: fileData.videoFile,
            thumbnailFile: fileData.thumbnailFile
          });
        }
        
        // Parse caption if provided
        let captionData = null;
        if (captionFile) {
          try {
            captionData = parseCaptionFile(captionFile.path, captionFile.originalname);
            fs.unlinkSync(captionFile.path);
          } catch (capError) {
            console.error('Error parsing caption for version:', captionFile.originalname, capError);
          }
        }
        
        // Add new version
        const newVersion = {
          version: version,
          originalName: videoFile.originalname,
          uploadDate: new Date().toISOString(),
          data: captionData || fileData.data, // Use new caption or fall back to existing
          videoFile: videoFile.filename,
          thumbnailFile: thumbnailFile
        };
        
        fileData.versions.push(newVersion);
        
        // Update main file to use latest version
        fileData.videoFile = videoFile.filename;
        fileData.thumbnailFile = thumbnailFile;
        fileData.originalName = videoFile.originalname; // Update to latest version name
        fileData.data = newVersion.data; // Update to latest caption data
        fileData.lastModified = new Date().toISOString();
        
        // Save updated file
        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
        
        results.stacked.push({
          baseName: extractBaseNameAndVersion(videoFile.originalname).baseName,
          version: version,
          type: 'video',
          name: videoFile.originalname,
          hasCaption: !!captionData
        });
        
        // Remove from videoFiles list
        const index = videoFiles.indexOf(videoFile);
        if (index > -1) videoFiles.splice(index, 1);
        
      } catch (error) {
        console.error('Error stacking version:', videoFile.originalname, error);
        results.errors.push({
          file: videoFile.originalname,
          error: error.message
        });
        // Clean up on error
        if (fs.existsSync(videoFile.path)) {
          fs.unlinkSync(videoFile.path);
        }
      }
    }
    
    // Process remaining unmatched videos (non-versioned, no matching caption)
    for (const videoFile of videoFiles) {
      // Check if this video matches any remaining caption files
      const videoNormalized = normalizeFilename(videoFile.originalname);
      const captionMatch = captionFiles.find(cf => {
        if (processedCaptions.has(cf.originalname)) return false;
        const captionNormalized = normalizeFilename(cf.originalname);
        return captionNormalized === videoNormalized;
      });
      
      if (!captionMatch) {
        results.unmatched.videos.push(videoFile.originalname);
        // Clean up unmatched video files
        if (fs.existsSync(videoFile.path)) {
          fs.unlinkSync(videoFile.path);
        }
      }
    }
    
    console.log('Bulk upload results:', JSON.stringify(results, null, 2));
    res.json(results);
    
  } catch (error) {
    console.error('Bulk upload error:', error);
    console.error('Error stack:', error.stack);
    // Clean up all uploaded files on error
    if (req.files) {
      req.files.forEach(f => {
        if (fs.existsSync(f.path)) {
          fs.unlinkSync(f.path);
        }
      });
    }
    res.status(500).json({ 
      error: 'Failed to process bulk upload', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  }
});

// Add error handler for multer errors
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    return res.status(400).json({ error: 'File upload error', details: err.message });
  }
  
  if (err) {
    console.error('General error:', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
  
  next();
});

// Folder Management

// Get all folders
app.get('/api/folders', (req, res) => {
  try {
    const folders = JSON.parse(fs.readFileSync(foldersFile, 'utf-8'));
    res.json(folders);
  } catch (error) {
    console.error('Error listing folders:', error);
    res.status(500).json({ error: 'Failed to list folders' });
  }
});

// Create folder (admin only)
app.post('/api/folders', requireAdmin, (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Folder name required' });
    }
    
    const folders = JSON.parse(fs.readFileSync(foldersFile, 'utf-8'));
    const folderId = Date.now().toString();
    const newFolder = {
      id: folderId,
      name,
      createdDate: new Date().toISOString()
    };
    
    folders.push(newFolder);
    fs.writeFileSync(foldersFile, JSON.stringify(folders, null, 2));
    
    res.json(newFolder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Delete folder (admin only)
app.delete('/api/folders/:id', requireAdmin, (req, res) => {
  try {
    let folders = JSON.parse(fs.readFileSync(foldersFile, 'utf-8'));
    folders = folders.filter(f => f.id !== req.params.id);
    fs.writeFileSync(foldersFile, JSON.stringify(folders, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Get list of files (optionally filtered by folder)
app.get('/api/files', (req, res) => {
  try {
    const folderId = req.query.folderId;
    const grouped = req.query.grouped === 'true';
    
    const files = fs.readdirSync(dataDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const content = JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf-8'));
        const { baseName, version } = extractBaseNameAndVersion(content.originalName);
        return {
          id: content.id,
          name: content.originalName,
          baseName: baseName,
          version: version,
          uploadDate: content.uploadDate,
          rowCount: content.data ? content.data.length : 0,
          completed: content.completed || false,
          folderId: content.folderId || null,
          groupKey: content.groupKey || null,
          hasVideo: !!content.videoFile,
          thumbnailFile: content.thumbnailFile || null,
          commentCount: (content.videoComments || []).length,
          versionCount: content.versions ? content.versions.length : 0,
          isStacked: !!(content.versions && content.versions.length > 0)
        };
      })
      .filter(file => !folderId || file.folderId === folderId)
      .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    
    if (grouped) {
      // Group files by groupKey
      const groups = {};
      files.forEach(file => {
        const key = file.groupKey || 'ungrouped';
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(file);
      });
      res.json({ grouped: true, groups });
    } else {
      res.json(files);
    }
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Update file folder (admin only)
app.put('/api/files/:id/folder', requireAdmin, (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    fileData.folderId = req.body.folderId || null;
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating file folder:', error);
    res.status(500).json({ error: 'Failed to update file folder' });
  }
});

// Get file data
app.get('/api/files/:id', (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(fileData);
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// Update file data
app.put('/api/files/:id', (req, res) => {
  try {
    console.log('Received update request for file:', req.params.id);
    console.log('Completed status received:', req.body.completed);
    
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log('Current file completed status:', fileData.completed);
    
    fileData.data = req.body.data;
    if (req.body.completed !== undefined) {
      fileData.completed = req.body.completed;
      console.log('Updated completed status to:', fileData.completed);
    }
    fileData.lastModified = new Date().toISOString();
    
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
    console.log('File saved successfully with completed:', fileData.completed);
    
    res.json({ success: true, completed: fileData.completed });
  } catch (error) {
    console.error('Error updating file:', error);
    res.status(500).json({ error: 'Failed to update file' });
  }
});

// Download file as CSV (admin only)
app.get('/api/files/:id/download', requireAdmin, (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const csv = stringify(fileData.data, { header: true });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileData.originalName}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// Export file as SRT (admin only)
app.get('/api/files/:id/export-srt', requireAdmin, (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Use ALL segments - no filtering by action
    const segments = fileData.data;
    console.log(`Exporting SRT with ${segments.length} total segments (ALL rows)`);
    
    // Helper function to convert seconds to SRT time format (HH:MM:SS,mmm)
    const formatTimeForSRT = (seconds) => {
      const sec = parseFloat(seconds || 0);
      const hours = Math.floor(sec / 3600);
      const minutes = Math.floor((sec % 3600) / 60);
      const secs = Math.floor(sec % 60);
      const millis = Math.floor((sec % 1) * 1000);
      
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
    };
    
    // Generate SRT content
    let srtContent = '';
    segments.forEach((row, index) => {
      const segmentNumber = index + 1;
      
      // Always use seconds and convert to SRT format
      const startTime = formatTimeForSRT(row.start_seconds);
      const endTime = formatTimeForSRT(row.end_seconds);
      const text = row.text || '';
      
      // Format: segment number, timestamp range, text, blank line
      srtContent += `${segmentNumber}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `<font color=#F7F6F2FF>${text}</font>\n`;
      srtContent += `\n`;
    });
    
    const srtFilename = fileData.originalName.replace(/\.csv$/i, '.srt');
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${srtFilename}"`);
    res.send(srtContent);
  } catch (error) {
    console.error('Error exporting SRT:', error);
    res.status(500).json({ error: 'Failed to export SRT' });
  }
});

// Upload video for a file (admin only) - supports version stacking
app.post('/api/files/:id/upload-video', requireAdmin, uploadVideo.single('video'), async (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const { baseName, version } = extractBaseNameAndVersion(req.file.originalname);
    
    // Check if this is a new version
    const isNewVersion = version && extractBaseNameAndVersion(fileData.originalName).baseName === baseName;
    
    // Generate thumbnail
    const thumbnailFilename = `thumb-${req.file.filename}.png`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
    const videoPath = path.join(uploadDir, req.file.filename);
    
    let thumbnailFile = null;
    try {
      await generateThumbnail(videoPath, thumbnailPath);
      thumbnailFile = thumbnailFilename;
      console.log('Thumbnail generated:', thumbnailFilename);
    } catch (thumbError) {
      console.error('Failed to generate thumbnail, continuing without it:', thumbError);
    }
    
    if (isNewVersion) {
      // This is a new version - stack it
      if (!fileData.versions) {
        fileData.versions = [];
        // Add current file as first version
        fileData.versions.push({
          version: extractBaseNameAndVersion(fileData.originalName).version || '_v001',
          originalName: fileData.originalName,
          uploadDate: fileData.uploadDate,
          data: fileData.data,
          videoFile: fileData.videoFile,
          thumbnailFile: fileData.thumbnailFile
        });
      }
      
      // Add new version
      const newVersion = {
        version: version,
        originalName: req.file.originalname,
        uploadDate: new Date().toISOString(),
        data: fileData.data, // Keep existing caption data (user can upload new caption separately)
        videoFile: req.file.filename,
        thumbnailFile: thumbnailFile
      };
      
      fileData.versions.push(newVersion);
      
      // Update main file to use latest version
      // Don't delete old video - keep it in versions array
      fileData.videoFile = req.file.filename;
      fileData.thumbnailFile = thumbnailFile;
      fileData.originalName = req.file.originalname; // Update to latest version name
      fileData.lastModified = new Date().toISOString();
      
      fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
      
      res.json({ 
        success: true, 
        videoFile: req.file.filename,
        thumbnailFile: thumbnailFile,
        isNewVersion: true,
        version: version,
        warning: 'New video version uploaded. Consider uploading matching caption file if available.'
      });
    } else {
      // Regular video upload (replace existing)
      // Delete old video if exists
      if (fileData.videoFile) {
        const oldVideoPath = path.join(uploadDir, fileData.videoFile);
        if (fs.existsSync(oldVideoPath)) {
          fs.unlinkSync(oldVideoPath);
        }
        // Delete old thumbnail
        if (fileData.thumbnailFile) {
          const oldThumbnailPath = path.join(thumbnailDir, fileData.thumbnailFile);
          if (fs.existsSync(oldThumbnailPath)) {
            fs.unlinkSync(oldThumbnailPath);
          }
        }
      }
      
      // Save new video filename
      fileData.videoFile = req.file.filename;
      fileData.thumbnailFile = thumbnailFile;
      fileData.lastModified = new Date().toISOString();
      
      fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
      
      res.json({ 
        success: true, 
        videoFile: req.file.filename,
        thumbnailFile: thumbnailFile
      });
    }
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
});

// Serve video files
app.get('/api/videos/:filename', (req, res) => {
  try {
    const videoPath = path.join(uploadDir, req.params.filename);
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.sendFile(videoPath);
  } catch (error) {
    console.error('Error serving video:', error);
    res.status(500).json({ error: 'Failed to serve video' });
  }
});

// Serve thumbnail files
app.get('/api/thumbnails/:filename', (req, res) => {
  try {
    const thumbnailPath = path.join(thumbnailDir, req.params.filename);
    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }
    res.sendFile(thumbnailPath);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: 'Failed to serve thumbnail' });
  }
});

// Generate thumbnails for all existing videos (admin only)
app.post('/api/generate-thumbnails', requireAdmin, async (req, res) => {
  try {
    console.log('Generating thumbnails for all videos...');
    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      // Skip if no video
      if (!fileData.videoFile) {
        skipped++;
        continue;
      }
      
      const videoPath = path.join(uploadDir, fileData.videoFile);
      
      // Skip if video doesn't exist
      if (!fs.existsSync(videoPath)) {
        console.log('Video not found:', fileData.videoFile);
        skipped++;
        continue;
      }
      
      // Skip if thumbnail already exists
      if (fileData.thumbnailFile) {
        const thumbPath = path.join(thumbnailDir, fileData.thumbnailFile);
        if (fs.existsSync(thumbPath)) {
          skipped++;
          continue;
        }
      }
      
      // Generate thumbnail
      const thumbnailFilename = `thumb-${fileData.videoFile}.png`;
      const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);
      
      try {
        await generateThumbnail(videoPath, thumbnailPath);
        fileData.thumbnailFile = thumbnailFilename;
        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
        generated++;
        console.log(`✓ Generated: ${fileData.originalName}`);
      } catch (error) {
        console.error(`✗ Failed: ${fileData.originalName}`, error.message);
        failed++;
      }
    }
    
    const message = `Generated ${generated} thumbnails. Skipped: ${skipped}, Failed: ${failed}`;
    console.log(message);
    res.json({ success: true, generated, skipped, failed, message });
  } catch (error) {
    console.error('Error generating thumbnails:', error);
    res.status(500).json({ error: 'Failed to generate thumbnails' });
  }
});

// Video Comments Management

// Get video comments
app.get('/api/files/:id/comments', (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json({ comments: fileData.videoComments || [] });
  } catch (error) {
    console.error('Error reading comments:', error);
    res.status(500).json({ error: 'Failed to read comments' });
  }
});

// Add video comment
app.post('/api/files/:id/comments', (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!fileData.videoComments) {
      fileData.videoComments = [];
    }
    
    const newComment = {
      id: Date.now().toString(),
      text: req.body.text,
      timestamp: req.body.timestamp || null,
      author: req.session.isAdmin ? 'Admin' : 'User',
      createdAt: new Date().toISOString()
    };
    
    fileData.videoComments.push(newComment);
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
    
    res.json({ success: true, comment: newComment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Update video comment
app.put('/api/files/:id/comments/:commentId', (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!fileData.videoComments) {
      return res.status(404).json({ error: 'No comments found' });
    }
    
    const commentIndex = fileData.videoComments.findIndex(c => c.id === req.params.commentId);
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    fileData.videoComments[commentIndex].text = req.body.text;
    fileData.videoComments[commentIndex].updatedAt = new Date().toISOString();
    
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
    
    res.json({ success: true, comment: fileData.videoComments[commentIndex] });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: 'Failed to update comment' });
  }
});

// Delete video comment
app.delete('/api/files/:id/comments/:commentId', (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!fileData.videoComments) {
      return res.status(404).json({ error: 'No comments found' });
    }
    
    fileData.videoComments = fileData.videoComments.filter(c => c.id !== req.params.commentId);
    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// Delete file (admin only)
app.delete('/api/files/:id', requireAdmin, (req, res) => {
  try {
    const filePath = path.join(dataDir, `${req.params.id}.json`);
    if (fs.existsSync(filePath)) {
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      // Delete associated video if exists
      if (fileData.videoFile) {
        const videoPath = path.join(uploadDir, fileData.videoFile);
        if (fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
      }
      
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Serve main app (SPA - all routes serve index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Public folder view (no auth required)
app.get('/folder/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : undefined 
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 ValEval Server Started`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  console.log(`🌐 Server running on http://0.0.0.0:${PORT}`);
  console.log(`👤 Admin username: ${ADMIN_USERNAME}`);
  if (NODE_ENV === 'development') {
    console.log(`📂 Share folders via: http://localhost:${PORT}/folder/[folder-id]`);
  }
  console.log('='.repeat(50));
});


# 📁 Project Structure

## Root Directory

```
ValEval.tadaspranulis.com/
├── 📄 server.js              # Main Node.js server application
├── 📄 package.json           # Node.js dependencies and scripts
├── 📄 package-lock.json      # Locked dependency versions
├── 📄 .env                   # Environment variables (YOU CREATE THIS - not in git)
├── 📄 env-template.txt       # Template for .env file
├── 📄 .gitignore             # Git ignore rules (protects sensitive files)
├── 📄 README.md              # Project overview and quick links
│
├── 📁 public/                # Frontend files (served to browser)
│   ├── index.html            # Main HTML page
│   ├── app.js                # Frontend JavaScript
│   └── styles.css            # CSS styles
│
├── 📁 docs/                  # 📚 All documentation
│   ├── QUICKSTART.md         # 5-minute setup guide (START HERE!)
│   ├── DEPLOYMENT-CHECKLIST.md  # Pre-deployment checklist
│   ├── DEPLOYMENT.md         # Full deployment guide (all platforms)
│   ├── CLOUDFLARE-DEPLOYMENT.md # Cloudflare-specific deployment
│   ├── SECURITY.md           # Security best practices
│   └── PROJECT-STRUCTURE.md  # This file
│
├── 📁 data/                  # CSV data storage (created automatically)
│   └── *.json                # File entries with metadata
│
├── 📁 uploads/               # Video uploads (created automatically)
│   ├── *.mp4, *.webm, etc.   # Video files
│   └── thumbnails/           # Generated video thumbnails
│       └── thumb-*.png       # Thumbnail images
│
├── 📄 folders.json           # Folder organization data (created automatically)
└── 📁 node_modules/          # Node.js packages (created by npm install)
```

---

## 📚 Documentation Guide

### For First-Time Setup
1. **README.md** - Overview and quick links
2. **env-template.txt** - Copy this to create your `.env` file
3. **docs/QUICKSTART.md** - 5-minute setup guide

### Before Deployment
1. **docs/DEPLOYMENT-CHECKLIST.md** - Your to-do list
2. **docs/SECURITY.md** - Security checklist (CRITICAL!)

### Deployment
Choose your platform:
- **docs/CLOUDFLARE-DEPLOYMENT.md** - For Cloudflare users (Railway or VPS)
- **docs/DEPLOYMENT.md** - General guide (Heroku, DigitalOcean, AWS, etc.)

### Reference
- **docs/PROJECT-STRUCTURE.md** - This file (project organization)

---

## 🔒 Important Files (Not in Git)

These files are created locally and should NEVER be committed:

- `.env` - Your environment variables (passwords, secrets)
- `data/` - User data (CSV entries)
- `uploads/` - Uploaded videos
- `folders.json` - Folder organization
- `node_modules/` - Dependencies

**Protected by:** `.gitignore`

---

## 📝 Configuration Files

### package.json
Defines:
- Project name and version
- Dependencies (Express, Multer, FFmpeg, etc.)
- Scripts: `npm start`, `npm run dev`
- Node.js version requirement

### .env (YOU CREATE THIS)
Required environment variables:
```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-random-secret
ADMIN_USERNAME=your_admin
ADMIN_PASSWORD=your_password
```

See `env-template.txt` for template.

### .gitignore
Prevents sensitive files from being committed:
- `.env` (secrets)
- `data/` (user data)
- `uploads/` (videos)
- `node_modules/` (dependencies)

---

## 🚀 Quick Commands

```bash
# Install dependencies
npm install

# Start development server (auto-restart)
npm run dev

# Start production server
npm start

# Check for vulnerabilities
npm audit

# Update dependencies
npm update
```

---

## 📊 Data Flow

```
User Uploads Video + CSV
         ↓
server.js (processes files)
         ↓
    ┌────┴────┐
    ↓         ↓
uploads/   data/
(videos)   (JSON metadata)
    ↓         ↓
Generate → uploads/thumbnails/
thumbnail   (PNG images)
```

---

## 🎯 Key Files Explained

### server.js
- **Main application file**
- Handles all routes (upload, download, edit, etc.)
- Manages authentication
- Processes videos (FFmpeg thumbnails)
- Serves API endpoints

### public/app.js
- **Frontend logic**
- Handles user interactions
- Manages file display
- Video player controls
- Edit functionality

### public/index.html
- **Main page structure**
- Login modal
- Upload interface
- File explorer
- Video editor UI

### public/styles.css
- **All styling**
- Responsive design
- File cards
- Video player styling
- Modal windows

---

## 🔄 Development vs Production

### Development (.env: NODE_ENV=development)
- Detailed error messages
- Debug logging
- Session secret can be simple
- HTTP allowed

### Production (.env: NODE_ENV=production)
- Generic error messages (security)
- Minimal logging
- Strong session secret required
- HTTPS enforced
- Security warnings for weak config

---

## 📦 Dependencies

### Core
- `express` - Web server framework
- `express-session` - Session management
- `multer` - File upload handling
- `bcrypt` - Password hashing

### Data Processing
- `csv-parse` - Parse CSV files
- `csv-stringify` - Generate CSV files
- `fluent-ffmpeg` - Video thumbnail generation

### Security
- `express-rate-limit` - Prevent abuse
- `dotenv` - Environment variables

### Development
- `nodemon` - Auto-restart on file changes

---

## 🎨 Frontend Architecture

### State Management
All in `public/app.js`:
- `currentFileId` - Currently open file
- `currentData` - CSV data being edited
- `isAdmin` - Admin authentication status
- `currentVideoFile` - Attached video
- `videoComments` - General video comments

### Key Functions
- `loadFiles()` - Fetch and display file list
- `openFile(id)` - Open file for editing
- `saveChanges()` - Save edits to server
- `handleUpload()` - Process bulk/single uploads
- `renderTable()` - Display CSV data table

---

## 🔐 Security Layers

1. **Session-based authentication** (express-session)
2. **Password hashing** (bcrypt)
3. **Rate limiting** (express-rate-limit)
4. **Secure cookies** (httpOnly, secure, sameSite)
5. **Environment variables** (dotenv)
6. **File type validation** (multer filters)
7. **Admin-only routes** (requireAdmin middleware)

---

## 📱 Responsive Design

The UI adapts to different screen sizes:
- **Desktop**: Full sidebar, multi-column layout
- **Tablet**: Simplified sidebar, responsive grid
- **Mobile**: Collapsed sidebar, single column

---

## 🎬 Video Features

### Thumbnail Generation
- Extracted from 1-second mark
- 320x240px PNG format
- Cached in `uploads/thumbnails/`
- Generated during upload

### Video Player
- **Hover mode**: Preview segments on hover
- **Full mode**: Professional video editor
- Caption overlay
- Timeline navigation
- General video comments
- Timestamped feedback

---

This structure keeps everything organized and easy to maintain! 🎉


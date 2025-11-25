# 🚀 Quick Start Guide - ValEval Video Review Platform

## For Local Development (5 Minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment (IMPORTANT!)
Create a file named `.env` in the project root:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=dev-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

### 3. Install FFmpeg (Required for thumbnails)

**Windows (with Chocolatey):**
```powershell
choco install ffmpeg
```

**Without Chocolatey:** Download from https://ffmpeg.org/download.html

**Verify:**
```bash
ffmpeg -version
```

### 4. Start the Server
```bash
npm start
```

### 5. Open in Browser
Go to: http://localhost:3000

**Login credentials:** 
- Username: `admin`
- Password: `admin123`

---

## 📁 Project Structure

```
ValEval.tadaspranulis.com/
├── server.js           # Main server file
├── package.json        # Dependencies
├── .env               # Your environment config (create this!)
├── env-template.txt   # Template for .env file
├── public/            # Frontend files
│   ├── index.html     # Main HTML
│   ├── app.js         # Frontend JavaScript
│   └── styles.css     # Styles
├── data/              # CSV data storage (created automatically)
├── uploads/           # Video uploads (created automatically)
│   └── thumbnails/    # Generated thumbnails
└── folders.json       # Folder organization data
```

---

## 🎯 Quick Feature Overview

### For Everyone (No Login):
- ✅ View files and videos
- ✅ Toggle Keep/Cut decisions
- ✅ Edit subtitle text
- ✅ Add video comments

### Admin Only (After Login):
- 📤 Upload videos + CSVs (bulk or single)
- 📥 Download edited CSVs
- 🎬 Export SRT subtitle files
- 📁 Organize files into folders
- 🗑️ Delete files
- 🔗 Share folder links

---

## 📤 How to Upload Files

1. **Login as Admin**
2. Click "Upload New File"
3. **Choose Mode:**
   - **Bulk Mode:** Select folders with videos + CSVs (automatically pairs by name)
   - **Single Mode:** Select 1 video + 1 CSV (validates name matching)
4. Click "Upload Files"
5. Wait for processing (thumbnails are generated automatically)

---

## 🎥 Video Naming Convention

Files are automatically matched and grouped:

**Example Naming:**
- Video: `LT0023_B251103_Person1+NL_677.mp4`
- CSV: `LT0023_B251103_Person1+NL_677.csv`
- CSV (variant): `LT0023_B251103_Person1+NL_677_split.csv`

**Group Key:** `LT0023_B251103_Person1+NL_677` (first 4 underscore-separated tokens)

All matching files are grouped together in the UI.

---

## 🐛 Common Issues

### "Cannot find module 'fluent-ffmpeg'"
**Solution:** Run `npm install`

### Thumbnails show camera icon instead of video
**Solutions:**
1. Install FFmpeg: `choco install ffmpeg` (Windows)
2. Re-upload videos (existing ones won't have thumbnails)
3. Check server logs for FFmpeg errors

### "Port 3000 already in use"
**Solution:** 
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### Can't login
**Check:**
- `.env` file exists
- `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set correctly
- Server restarted after creating `.env`

---

## 🚀 Ready for Production?

See **DEPLOYMENT.md** for full production deployment guide with:
- Security hardening
- HTTPS setup
- Cloud platform deployment (Heroku, DigitalOcean, etc.)
- Nginx configuration
- PM2 process management
- SSL certificates

---

## 💡 Pro Tips

1. **Development Mode:** Use `npm run dev` for auto-restart on code changes
2. **Bulk Upload:** Drag and drop entire folders for faster uploads
3. **Video Comments:** Click video timestamp to jump to specific moments
4. **Keyboard Shortcuts:** Click on table rows to select and navigate quickly
5. **SRT Export:** Export subtitles for use in video editors (Premiere, DaVinci Resolve, etc.)

---

## 📞 Need Help?

1. Check `DEPLOYMENT.md` for detailed guides
2. Review server logs in the terminal
3. Verify FFmpeg: `ffmpeg -version`
4. Ensure `.env` file is properly configured

---

## ✅ You're All Set!

Start editing video subtitles and managing your review workflow! 🎬


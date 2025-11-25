# ValEval Video Review Platform

A professional video review and subtitle editing platform with CSV management, video thumbnail previews, general comments, and automatic video/CSV pairing. Built for video production teams and subtitle editors.

---

## ⚡ Quick Start

```bash
npm install
# Create .env file (copy from env-template.txt)
# Install FFmpeg
npm start
# Open http://localhost:3000
```

---

## 📚 Documentation

- 🚀 **[Quick Setup Guide](docs/QUICKSTART.md)** - Get started in 5 minutes
- ☑️ **[Deployment Checklist](docs/DEPLOYMENT-CHECKLIST.md)** - Pre-deployment to-do list
- 🌐 **[Cloudflare Deployment](docs/CLOUDFLARE-DEPLOYMENT.md)** - Deploy to videoReviews.tadaspranulis.com
- 📖 **[Full Deployment Guide](docs/DEPLOYMENT.md)** - All platforms (Heroku, Railway, VPS, etc.)
- 🔒 **[Security Guide](docs/SECURITY.md)** - Security best practices (CRITICAL!)
- 📁 **[Project Structure](docs/PROJECT-STRUCTURE.md)** - File organization explained

---

## Features

- 🔐 **Secure Admin Authentication** - Login system for admin-only features
- 📁 **Folder Organization** - Organize CSV files into folders/projects
- 🔗 **Folder Sharing** - Share specific folders via unique URLs
- 📤 **File Upload** - Admin can upload CSV files for editing
- 🎥 **Video Preview** - Attach videos and preview specific segments on hover
- 🎬 **Full Video Editor** - Professional video player with caption overlay and timeline editing
- ✏️ **Interactive Editing** - Anyone can toggle between "keep" and "cut" for each row
- 📝 **Reason & Text Editing** - Public can edit the "text" and "reason" columns
- ✅ **Completion Tracking** - Mark files as completed and see status badges
- 💾 **Save Changes** - Modifications are automatically saved
- 📥 **Download Files** - Admin can download edited CSV files
- 🎬 **SRT Export** - Admin can export all segments as SRT subtitle files
- 👁️ **Column Visibility** - Toggle which columns are visible in the table
- 📊 **Real-time Statistics** - View counts of keep/cut decisions and total duration
- ⏱️ **Duration Calculation** - Automatic calculation of total duration for "keep" segments
- 🎨 **Modern UI** - Beautiful, intuitive interface with gradient design
- 🔍 **Filtering** - Show/hide rows based on keep/cut status
- 📋 **Multi-file Management** - Efficiently manage multiple CSV files with visual status indicators

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **File Processing:** Multer, CSV Parser
- **Video:** FFmpeg thumbnails
- **Auth:** bcrypt + express-session
- **Security:** Rate limiting, secure cookies

## 📦 Quick Installation

```bash
npm install                    # Install dependencies
cp env-template.txt .env      # Create environment file (edit it!)
npm start                      # Start server
# Open http://localhost:3000
```

**👉 Detailed Setup:** [docs/QUICKSTART.md](docs/QUICKSTART.md)

**Default credentials:** Username: `admin` | Password: `admin123`

⚠️ **Change these by editing your `.env` file!**

## 🎯 How It Works

### For Everyone (No Login)
- View files and toggle Keep/Cut decisions
- Edit subtitle text and reasons
- Add video comments
- Real-time statistics

### For Admins (Login Required)
- Upload videos + CSVs (bulk or single)
- Download edited CSVs
- Export SRT subtitle files
- Organize files into folders
- Share folder links

**👉 Full User Guide:** [docs/QUICKSTART.md](docs/QUICKSTART.md)

**👉 File Structure:** [docs/PROJECT-STRUCTURE.md](docs/PROJECT-STRUCTURE.md)

---

## 🚀 Deployment

Ready to go live? Choose your platform:

- **Cloudflare:** [docs/CLOUDFLARE-DEPLOYMENT.md](docs/CLOUDFLARE-DEPLOYMENT.md) → videoReviews.tadaspranulis.com
- **General:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) → Heroku, Railway, VPS, AWS, etc.
- **Checklist:** [docs/DEPLOYMENT-CHECKLIST.md](docs/DEPLOYMENT-CHECKLIST.md) → Pre-flight check

---

## 🔒 Security

**Before going live, review:** [docs/SECURITY.md](docs/SECURITY.md)

✅ Change default passwords  
✅ Set strong session secret  
✅ Enable HTTPS  
✅ Review security checklist  

---

## 🤝 Contributing

Issues and pull requests welcome!

## 📄 License

MIT License

---

**Made with ❤️ for video production teams**

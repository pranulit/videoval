# ValEval Video Review Platform - Deployment Guide

## 📋 Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Security Checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites

### Required Software
- **Node.js** 18.0.0 or higher
- **npm** (comes with Node.js)
- **FFmpeg** (for video thumbnail generation)

### FFmpeg Installation

**Windows:**
```powershell
choco install ffmpeg
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Verify Installation:**
```bash
ffmpeg -version
```

---

## ⚙️ Environment Setup

### 1. Clone or Copy Project Files

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` file with your settings:

```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Session Secret (MUST CHANGE!)
SESSION_SECRET=your-long-random-secret-key-here

# Admin Credentials (MUST CHANGE!)
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_secure_password_here

# Optional: FFmpeg path
# FFMPEG_PATH=/usr/bin/ffmpeg
```

**⚠️ IMPORTANT:** 
- **Never commit `.env` to version control!**
- Use strong, unique passwords
- Generate a strong session secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 💻 Local Development

### Start Development Server
```bash
npm run dev
```

This uses `nodemon` for auto-restart on file changes.

### Access Application
- Main app: http://localhost:3000
- Admin login: username/password from `.env`

---

## 🚀 Production Deployment

### Option 1: Traditional Server (VPS/Dedicated Server)

#### 1. Prepare Server
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install FFmpeg
sudo apt install -y ffmpeg

# Install PM2 (process manager)
sudo npm install -g pm2
```

#### 2. Upload Application Files
```bash
# Using SCP, FTP, or Git
scp -r ./your-project user@server:/var/www/valeval
```

#### 3. Configure Environment
```bash
cd /var/www/valeval
cp .env.example .env
nano .env  # Edit with production values
```

#### 4. Install Dependencies
```bash
npm install --production
```

#### 5. Start with PM2
```bash
pm2 start server.js --name valeval
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

#### 6. Configure Nginx (Reverse Proxy)

Create `/etc/nginx/sites-available/valeval`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 500M;  # Allow large video uploads

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Timeouts for large uploads
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/valeval /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 7. Setup SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### Option 2: Cloud Platforms

#### Heroku

1. Create `Procfile`:
```
web: npm start
```

2. Deploy:
```bash
heroku create your-app-name
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your-secret
heroku config:set ADMIN_USERNAME=admin
heroku config:set ADMIN_PASSWORD=your-password

# Install FFmpeg buildpack
heroku buildpacks:add --index 1 https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git

git push heroku main
```

#### DigitalOcean App Platform

1. Create `app.yaml`:
```yaml
name: valeval
services:
- name: web
  github:
    repo: your-username/your-repo
    branch: main
  build_command: npm install
  run_command: npm start
  envs:
  - key: NODE_ENV
    value: production
  - key: SESSION_SECRET
    value: ${SESSION_SECRET}
  - key: ADMIN_USERNAME
    value: ${ADMIN_USERNAME}
  - key: ADMIN_PASSWORD
    value: ${ADMIN_PASSWORD}
```

#### Railway

1. Connect GitHub repository
2. Add environment variables in dashboard
3. Railway auto-detects Node.js and deploys

---

## 🔒 Security Checklist

### Before Going Live:

- [ ] Change default admin credentials
- [ ] Set strong `SESSION_SECRET`
- [ ] Enable HTTPS (SSL certificate)
- [ ] Set `NODE_ENV=production`
- [ ] Configure firewall rules
- [ ] Set up regular backups for `/data` and `/uploads` folders
- [ ] Review file size limits in multer configuration
- [ ] Enable rate limiting (already configured)
- [ ] Set proper file permissions (644 for files, 755 for directories)
- [ ] Keep dependencies updated: `npm audit` and `npm update`

### Ongoing Maintenance:

```bash
# Check for vulnerabilities
npm audit

# Update dependencies
npm update

# View logs
pm2 logs valeval

# Restart application
pm2 restart valeval
```

---

## 🐛 Troubleshooting

### Issue: "Cannot find module 'fluent-ffmpeg'"
**Solution:**
```bash
npm install
```

### Issue: Thumbnails not generating
**Solution:**
- Verify FFmpeg is installed: `ffmpeg -version`
- Check server logs for errors
- Ensure write permissions on `/uploads/thumbnails/`

### Issue: "Port 3000 already in use"
**Solution:**
```bash
# Find process using port
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # Linux/Mac

# Kill process (replace PID)
taskkill /PID <PID> /F  # Windows
kill -9 <PID>  # Linux/Mac
```

### Issue: Large file uploads fail
**Solution:**
- Increase Nginx `client_max_body_size`
- Adjust `proxy_read_timeout` in Nginx
- Check disk space

### Issue: Session expires too quickly
**Solution:**
Edit `server.js`, increase cookie maxAge:
```javascript
cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
```

---

## 📊 Monitoring

### Using PM2 Monitor
```bash
pm2 monit
```

### View Logs
```bash
pm2 logs valeval --lines 100
```

### Check Status
```bash
pm2 status
pm2 info valeval
```

---

## 🔄 Updates & Maintenance

### Update Application
```bash
# Pull latest code
git pull origin main

# Install new dependencies
npm install

# Restart
pm2 restart valeval
```

### Backup Data
```bash
# Backup data and uploads folders
tar -czf backup-$(date +%Y%m%d).tar.gz data/ uploads/ folders.json

# Copy to backup location
scp backup-*.tar.gz user@backup-server:/backups/
```

---

## 📞 Support

For issues or questions:
- Check logs: `pm2 logs valeval`
- Review this deployment guide
- Check FFmpeg installation: `ffmpeg -version`

---

## 🎉 Deployment Complete!

Your ValEval Video Review Platform is now live! 

Default access:
- URL: http://your-domain.com
- Admin Panel: Click "Admin Login"
- Credentials: Set in `.env` file


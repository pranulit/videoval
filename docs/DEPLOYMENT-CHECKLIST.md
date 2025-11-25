# ✅ Pre-Deployment Checklist - ValEval Platform

## 🎯 Before You Deploy - Complete These Steps!

### 1️⃣ Install New Dependencies (REQUIRED)

Your terminal is currently showing an error. Run this command:

```bash
npm install
```

This will install:
- `dotenv` - Environment variable management
- `express-rate-limit` - Security (prevents abuse)
- `fluent-ffmpeg` - Video thumbnail generation (already added)

### 2️⃣ Create Environment File (REQUIRED)

Create a file named `.env` in your project root:

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=CHANGE-THIS-TO-RANDOM-SECRET
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_secure_password
```

**⚠️ CRITICAL:** 
- Replace `CHANGE-THIS-TO-RANDOM-SECRET` with a random string
- Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Change `ADMIN_USERNAME` and `ADMIN_PASSWORD`

### 3️⃣ Install FFmpeg (REQUIRED for thumbnails)

```bash
choco install ffmpeg
```

Verify: `ffmpeg -version`

### 4️⃣ Test Locally

```bash
npm start
```

Visit: http://localhost:3000
- Login with your new credentials
- Upload a test video + CSV
- Verify thumbnails generate

### 5️⃣ Security Review

Go through `SECURITY.md` and complete all ✅ items

**Critical:**
- [ ] Strong passwords set
- [ ] Session secret is random
- [ ] `.env` is NOT committed to git
- [ ] `.gitignore` is in place

---

## 📋 What Was Fixed for Production

### ✅ Security Improvements

1. **Environment Variables**
   - No more hardcoded passwords
   - Configurable credentials
   - Secure session management

2. **Rate Limiting**
   - Prevents brute force attacks
   - Limits uploads per hour
   - Protects against DoS

3. **Secure Cookies**
   - HTTP-only (XSS protection)
   - Secure flag in production (HTTPS only)
   - SameSite: strict (CSRF protection)

4. **Error Handling**
   - No sensitive info in production errors
   - Proper error middleware
   - Graceful shutdown handling

5. **Git Security**
   - `.gitignore` prevents sensitive data commits
   - Data folders excluded
   - Environment files protected

### ✅ Production Features

1. **Environment Detection**
   - Automatic production vs development mode
   - Different behaviors per environment
   - Warnings for insecure configs

2. **Process Management**
   - Graceful shutdown on SIGTERM
   - Better logging
   - Production-ready startup

3. **Performance**
   - Request size limits
   - Optimized session handling
   - Efficient file processing

### ✅ Documentation

Created comprehensive guides:
- **QUICKSTART.md** - Get started in 5 minutes
- **DEPLOYMENT.md** - Full deployment guide with multiple platforms
- **SECURITY.md** - Security best practices and checklist
- **env-template.txt** - Environment configuration template
- **.gitignore** - Git security

---

## 🚀 Deployment Options

Choose your platform and follow the guide in `DEPLOYMENT.md`:

### Option 1: Traditional Server (VPS)
- DigitalOcean, Linode, Vultr
- Full control
- Use PM2 + Nginx
- ~$5-20/month

### Option 2: Platform as a Service (PaaS)
- Heroku (easiest, but paid now)
- Railway (modern, simple)
- DigitalOcean App Platform
- Render.com
- ~$7-15/month

### Option 3: Cloud Platforms
- AWS EC2 + Elastic Beanstalk
- Google Cloud Run
- Azure App Service
- More complex, more scalable

---

## 📦 What's Included Now

```
Your Project/
├── 📄 server.js              ✅ Production-ready with security
├── 📄 package.json           ✅ Updated dependencies
├── 📄 .gitignore             ✅ NEW - Protects sensitive files
├── 📄 env-template.txt       ✅ NEW - Environment template
├── 📄 QUICKSTART.md          ✅ NEW - Quick setup guide
├── 📄 DEPLOYMENT.md          ✅ NEW - Full deployment guide
├── 📄 SECURITY.md            ✅ NEW - Security practices
├── 📄 DEPLOYMENT-CHECKLIST.md ✅ NEW - This file
├── 📁 public/                ✅ Frontend (unchanged)
├── 📁 data/                  (Auto-created)
├── 📁 uploads/               (Auto-created)
└── 📄 .env                   ⚠️  YOU NEED TO CREATE THIS!
```

---

## ⚠️ IMPORTANT: Before First Deploy

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Create .env File
Copy from `env-template.txt` and customize:
```bash
# Windows
copy env-template.txt .env

# Mac/Linux  
cp env-template.txt .env
```

Then edit `.env` with your values.

### Step 3: Test Locally
```bash
npm start
```

### Step 4: Verify Everything Works
- [ ] Server starts without errors
- [ ] Can login with new credentials
- [ ] Can upload files
- [ ] Thumbnails generate (if FFmpeg installed)

### Step 5: Deploy!
Follow guide in `DEPLOYMENT.md` for your chosen platform.

---

## 🆘 Troubleshooting

### Server Won't Start

**Error:** `Cannot find module 'dotenv'` or `'express-rate-limit'`
**Fix:** Run `npm install`

**Error:** Admin credentials not working
**Fix:** Check `.env` file exists and has correct values

**Error:** Port 3000 in use
**Fix:** Kill the process:
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### Thumbnails Not Showing

**Fix:**
1. Install FFmpeg: `choco install ffmpeg`
2. Restart server
3. Re-upload videos

---

## 📞 Need Help?

1. **Read the guides:**
   - `QUICKSTART.md` for setup
   - `DEPLOYMENT.md` for deployment
   - `SECURITY.md` for security

2. **Check server logs:**
   - Look at terminal output
   - Check for error messages

3. **Verify installation:**
   - `node --version` (should be 18+)
   - `npm --version`
   - `ffmpeg -version` (for thumbnails)

---

## ✨ You're Almost Ready!

Follow the checklist above, and you'll have a production-ready video review platform!

**Next Steps:**
1. Complete checklist items 1-5 above
2. Choose deployment platform
3. Follow `DEPLOYMENT.md` guide
4. Launch! 🚀

---

**Good luck with your deployment!** 🎉


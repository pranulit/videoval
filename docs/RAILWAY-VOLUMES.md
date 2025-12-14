# 🚂 Railway Persistent Storage Setup

## ⚠️ CRITICAL: Why You Need Volumes

Railway's filesystem is **ephemeral** - every deployment wipes your files!

Without volumes configured, **ALL uploaded files, videos, and data will be LOST** on every deployment.

---

## 📦 What Needs to be Persistent

These directories contain user data and MUST be stored in volumes:

1. `/data` - JSON files with caption data and reviews
2. `/uploads` - Uploaded video files
3. `/uploads/thumbnails` - Generated thumbnails
4. `folders.json` - Folder organization

---

## 🔧 Railway Volume Setup (Step-by-Step)

### Step 1: Access Your Railway Project

1. Go to https://railway.app
2. Click on your project
3. Click on your service (the one running the app)

### Step 2: Create Volume for Data

1. Click **"Variables"** tab
2. Scroll to **"Volumes"** section
3. Click **"+ New Volume"**
4. Configure:
   - **Mount Path:** `/app/data`
   - **Name:** `valeval-data` (or any name you like)
5. Click **"Add"**

### Step 3: Create Volume for Uploads

1. Click **"+ New Volume"** again
2. Configure:
   - **Mount Path:** `/app/uploads`
   - **Name:** `valeval-uploads`
3. Click **"Add"**

### Step 4: Verify Volumes

You should now see two volumes:
- ✅ `/app/data` → valeval-data
- ✅ `/app/uploads` → valeval-uploads

**Note:** The `/app/uploads/thumbnails` directory will be created automatically inside the uploads volume.

### Step 5: Handle folders.json

Railway volumes only work with directories, not individual files. We need to move `folders.json` into the data directory.

This requires a small code change (see below).

---

## 🔄 Code Changes for Volume Support

### Option A: Move folders.json to data directory (Recommended)

Update `server.js` line ~219:

**Before:**
```javascript
const foldersFile = path.join(__dirname, 'folders.json');
```

**After:**
```javascript
const foldersFile = path.join(__dirname, 'data', 'folders.json');
```

This moves `folders.json` into the `/data` directory which is already on a volume.

### Option B: Create a separate volume for root files

1. Create volume with mount path: `/app/persistent`
2. Update code to use: `path.join(__dirname, 'persistent', 'folders.json')`
3. Add volume for `/app/persistent`

**We recommend Option A** (simpler).

---

## 🚀 Safe Deployment Process

### BEFORE Your First Deployment with Volumes:

If you already have data on Railway that you want to keep, you need to **backup first**:

#### Step 1: Download Your Current Data

1. In Railway dashboard, click **"Shell"** (terminal icon)
2. Run these commands to create a backup:

```bash
# Create a backup directory
mkdir -p /tmp/backup

# Copy all data
cp -r /app/data /tmp/backup/
cp -r /app/uploads /tmp/backup/
cp /app/folders.json /tmp/backup/

# Create a tarball
cd /tmp/backup
tar -czf backup.tar.gz data uploads folders.json

# The backup is at: /tmp/backup/backup.tar.gz
```

3. You can't directly download from Railway shell, so instead:
   - Use Railway CLI (see below), OR
   - Accept that you'll start fresh (if acceptable)

#### Step 2: Install Railway CLI (to download backup)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Download the backup
railway run bash -c "cat /tmp/backup/backup.tar.gz" > backup.tar.gz
```

#### Step 3: Extract Backup Locally

```bash
tar -xzf backup.tar.gz
# You now have: data/, uploads/, folders.json
```

---

## 📤 Restore Data to New Volume Setup

After volumes are configured and deployed:

### Option 1: Via Railway Shell

1. Open Railway **"Shell"**
2. Upload files (if small dataset):

```bash
# Create directories
mkdir -p /app/data
mkdir -p /app/uploads/thumbnails

# You'll need to manually copy files
# (Railway shell doesn't support direct upload)
```

### Option 2: Via Railway CLI (Recommended for large files)

```bash
# Make sure you're in your project directory
railway link

# Upload data files
railway run bash -c "cd /app && cat > data/yourfile.json" < local-data/yourfile.json

# For multiple files, create a script
for file in data/*.json; do
  railway run bash -c "cat > /app/$file" < "$file"
done
```

### Option 3: Fresh Start (Easiest)

If you don't have much data yet, just re-upload through the web interface after deployment.

---

## 🔄 Deployment Steps (With Volumes Configured)

### 1. Make Code Changes

If you chose Option A above (move folders.json), update `server.js`:

```javascript
// Line ~219 - Update this
const foldersFile = path.join(__dirname, 'data', 'folders.json');
```

### 2. Commit and Push

```bash
git add server.js
git commit -m "Fix rate limiting + configure for Railway volumes"
git push origin main
```

### 3. Railway Auto-Deploys

Railway detects the push and deploys automatically.

**Your data is now safe!** Volumes persist across deployments.

---

## ✅ Verify Everything Works

After deployment:

1. Visit your Railway URL
2. Login as admin
3. Upload a test file
4. Trigger a new deployment:
   ```bash
   git commit --allow-empty -m "Test deployment"
   git push
   ```
5. After redeployment, verify the file is still there

**If the file persists** → ✅ Volumes are working!

---

## 📊 Monitoring Volume Usage

### Check Volume Size

In Railway dashboard:
- Go to your service
- Click **"Metrics"**
- Look for **"Volume Usage"**

Railway free tier includes:
- 100 GB of storage across all volumes
- Upgrade if you need more

### Clean Up Old Files (if needed)

Via Railway Shell:

```bash
# Check size
du -sh /app/data
du -sh /app/uploads

# Delete old files (be careful!)
# Example: delete videos older than 30 days
find /app/uploads -name "*.mp4" -mtime +30 -delete
```

---

## 🆘 Troubleshooting

### Issue: Files still disappear after deployment

**Check:**
1. Are volumes mounted? (Railway dashboard → Variables → Volumes)
2. Is mount path correct? Should be `/app/data` and `/app/uploads`
3. Did you update `folders.json` path in code?

### Issue: "Cannot write to directory"

**Fix:** Ensure directories exist at startup. Update `server.js` (~line 220):

```javascript
// Create necessary directories
const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const thumbnailDir = path.join(__dirname, 'uploads', 'thumbnails');
const foldersFile = path.join(__dirname, 'data', 'folders.json');

// Ensure directories exist (volumes may be empty on first deployment)
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(thumbnailDir)) fs.mkdirSync(thumbnailDir, { recursive: true });
if (!fs.existsSync(foldersFile)) fs.writeFileSync(foldersFile, JSON.stringify([]));
```

### Issue: Volume is full

**Options:**
1. Clean up old files (see above)
2. Upgrade Railway plan for more storage
3. Move to external storage (S3, Cloudflare R2)

---

## 💡 Best Practices

### Regular Backups

Even with volumes, create regular backups:

```bash
# Weekly backup script
railway run bash -c "cd /app && tar -czf backup-$(date +%Y%m%d).tar.gz data uploads" > backup.tar.gz
```

### Monitor Storage Usage

Set up alerts if you approach storage limits.

### Version Control

Never commit `data/` or `uploads/` to git - they're in `.gitignore` for a reason!

---

## 🎉 You're Ready!

With volumes configured:
- ✅ Data persists across deployments
- ✅ Videos are never lost
- ✅ You can deploy code changes safely

Now you can safely deploy the rate limiting fix!


# 🌐 Cloudflare Deployment Guide - videoReviews.tadaspranulis.com

## Overview

Your Node.js application will be deployed to a server, with Cloudflare handling:
- DNS management
- SSL/HTTPS (automatic)
- DDoS protection
- CDN/Caching
- Domain: `videoReviews.tadaspranulis.com`

---

## 📋 Deployment Strategy

**Best Approach:** Deploy to a cloud platform + Cloudflare DNS

### Recommended Platforms (Easiest to Hardest):

1. **Railway** ⭐ RECOMMENDED - $5/month, easiest setup
2. **Render.com** - Free tier available, easy setup
3. **DigitalOcean App Platform** - $5/month
4. **DigitalOcean Droplet (VPS)** - $4/month, more control
5. **AWS/GCP** - More complex

---

## 🚀 Option 1: Railway + Cloudflare (RECOMMENDED - 15 minutes)

### Step 1: Deploy to Railway

#### 1.1 Setup Git Repository (if not already)
```bash
# Initialize git if needed
git init
git add .
git commit -m "Initial commit"

# Create GitHub repo and push
# (Or use Railway's CLI)
```

#### 1.2 Deploy to Railway

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Railway auto-detects Node.js app

#### 1.3 Configure Environment Variables

In Railway dashboard, add these environment variables:

```
NODE_ENV=production
SESSION_SECRET=<generate-random-secret>
ADMIN_USERNAME=your_admin
ADMIN_PASSWORD=your_secure_password
PORT=3000
```

Generate session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 1.4 Note Your Railway URL

After deployment, Railway gives you a URL like:
`your-app-name.up.railway.app`

**Important:** Keep this URL, you'll need it for Cloudflare setup.

---

### Step 2: Configure Cloudflare

#### 2.1 Add Domain to Cloudflare (if not already)

1. Go to https://dash.cloudflare.com
2. Click "Add a Site"
3. Enter: `tadaspranulis.com`
4. Choose Free plan
5. Copy Cloudflare nameservers
6. Update nameservers at your domain registrar
7. Wait for activation (5-60 minutes)

#### 2.2 Create DNS Record for Subdomain

1. Go to **DNS** section
2. Click **Add record**
3. Configure:
   - **Type:** `CNAME`
   - **Name:** `videoReviews`
   - **Target:** `your-app-name.up.railway.app` (from Railway)
   - **Proxy status:** ✅ Proxied (orange cloud)
   - **TTL:** Auto
4. Click **Save**

#### 2.3 Configure SSL (Automatic)

1. Go to **SSL/TLS** → **Overview**
2. Set to **Full** or **Full (strict)**
3. Go to **Edge Certificates**
4. Enable:
   - ✅ Always Use HTTPS
   - ✅ Automatic HTTPS Rewrites
   - ✅ Minimum TLS Version: 1.2

#### 2.4 Configure Page Rules (Optional but Recommended)

1. Go to **Rules** → **Page Rules**
2. Create rule:
   - **URL:** `http://*videoReviews.tadaspranulis.com/*`
   - **Setting:** Always Use HTTPS
3. Save and Deploy

---

### Step 3: Update Server Configuration

Update your `.env` or Railway environment variables:

```env
ALLOWED_DOMAIN=videoReviews.tadaspranulis.com
```

---

### Step 4: Test Deployment

1. Wait 5-10 minutes for DNS propagation
2. Visit: https://videoReviews.tadaspranulis.com
3. Verify:
   - ✅ HTTPS works (padlock icon)
   - ✅ Can login
   - ✅ Can upload files
   - ✅ Thumbnails generate

---

## 🚀 Option 2: DigitalOcean Droplet + Cloudflare (More Control)

### Step 1: Create Droplet

1. Go to https://digitalocean.com
2. Create Droplet:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic $4/month
   - **Datacenter:** Closest to your users
   - **Authentication:** SSH key (recommended) or password
3. Create Droplet
4. Note your Droplet's IP address

### Step 2: Setup Server

SSH into your server:
```bash
ssh root@your_droplet_ip
```

Run setup:
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Install FFmpeg
apt install -y ffmpeg

# Install PM2
npm install -g pm2

# Install Nginx
apt install -y nginx

# Install Certbot (for SSL)
apt install -y certbot python3-certbot-nginx
```

### Step 3: Upload Your Application

From your local machine:
```bash
# Create deployment directory on server
ssh root@your_droplet_ip "mkdir -p /var/www/valeval"

# Upload files (using SCP)
scp -r * root@your_droplet_ip:/var/www/valeval/

# Or use Git
ssh root@your_droplet_ip
cd /var/www/valeval
git clone your-repo-url .
```

### Step 4: Configure Application

On server:
```bash
cd /var/www/valeval

# Create .env file
nano .env
```

Paste:
```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-generated-secret
ADMIN_USERNAME=your_admin
ADMIN_PASSWORD=your_secure_password
```

Install and start:
```bash
npm install --production
pm2 start server.js --name valeval
pm2 save
pm2 startup  # Follow instructions
```

### Step 5: Configure Nginx

Create Nginx config:
```bash
nano /etc/nginx/sites-available/valeval
```

Paste:
```nginx
server {
    listen 80;
    server_name videoReviews.tadaspranulis.com;

    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
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
ln -s /etc/nginx/sites-available/valeval /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Step 6: Configure Cloudflare DNS

1. Go to Cloudflare Dashboard → DNS
2. Add record:
   - **Type:** `A`
   - **Name:** `videoReviews`
   - **IPv4 address:** Your Droplet IP
   - **Proxy status:** ✅ Proxied (orange cloud)
3. Save

### Step 7: SSL Configuration

#### Option A: Cloudflare Origin Certificate (Recommended)

1. In Cloudflare: **SSL/TLS** → **Origin Server**
2. **Create Certificate**
3. Download certificate and private key
4. On server:

```bash
mkdir -p /etc/ssl/cloudflare
nano /etc/ssl/cloudflare/cert.pem  # Paste certificate
nano /etc/ssl/cloudflare/key.pem   # Paste private key
chmod 600 /etc/ssl/cloudflare/*
```

Update Nginx config:
```bash
nano /etc/nginx/sites-available/valeval
```

Change to:
```nginx
server {
    listen 443 ssl http2;
    server_name videoReviews.tadaspranulis.com;

    ssl_certificate /etc/ssl/cloudflare/cert.pem;
    ssl_certificate_key /etc/ssl/cloudflare/key.pem;
    
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}

server {
    listen 80;
    server_name videoReviews.tadaspranulis.com;
    return 301 https://$server_name$request_uri;
}
```

Reload:
```bash
nginx -t
systemctl reload nginx
```

#### Option B: Let's Encrypt (Alternative)

```bash
certbot --nginx -d videoReviews.tadaspranulis.com
```

Follow prompts. Certbot auto-configures Nginx.

---

## 🔧 Cloudflare Optimization Settings

### Performance

1. **Speed** → **Optimization**
   - ✅ Auto Minify: JavaScript, CSS, HTML
   - ✅ Brotli compression

2. **Caching** → **Configuration**
   - Browser Cache TTL: 4 hours (for static files)
   
3. **Page Rules** for static assets:
   - URL: `*videoReviews.tadaspranulis.com/styles.css`
   - Settings: Cache Level: Cache Everything, Edge Cache TTL: 1 month

### Security

1. **Security** → **Settings**
   - Security Level: Medium
   - ✅ Bot Fight Mode
   - ✅ Challenge Passage: 30 minutes

2. **Firewall Rules**
   - Block countries if needed
   - Rate limiting rules

---

## 🔍 Troubleshooting

### DNS Not Resolving

```bash
# Check DNS propagation
nslookup videoReviews.tadaspranulis.com

# Or use online tool
# https://www.whatsmydns.net/#A/videoReviews.tadaspranulis.com
```

Wait 5-60 minutes for DNS propagation.

### SSL Errors

**Error:** "Too many redirects"
**Fix:** In Cloudflare, set SSL/TLS to **Full** (not Flexible)

**Error:** "SSL handshake failed"
**Fix:** Check certificate files on server, ensure Nginx config is correct

### 502 Bad Gateway

**Check:**
```bash
pm2 status        # Is app running?
pm2 logs valeval  # Check for errors
systemctl status nginx  # Is Nginx running?
```

### Uploads Failing

**Increase Cloudflare limit:**
- Free plan: 100MB max
- Paid plans: up to 500MB

If you need larger uploads, consider direct upload to your server (bypass Cloudflare proxy).

---

## 📊 Monitoring & Maintenance

### Check Application Status
```bash
ssh root@your_droplet_ip
pm2 monit
pm2 logs valeval
```

### View Cloudflare Analytics
- Dashboard → Analytics → Traffic

### Update Application
```bash
ssh root@your_droplet_ip
cd /var/www/valeval
git pull origin main
npm install
pm2 restart valeval
```

---

## 💰 Cost Estimate

### Option 1: Railway + Cloudflare
- Railway: $5/month
- Cloudflare: Free
- **Total: $5/month**

### Option 2: DigitalOcean + Cloudflare
- Droplet: $4-6/month
- Cloudflare: Free
- **Total: $4-6/month**

---

## ✅ Final Checklist

Before going live:

- [ ] Application running on Railway/Droplet
- [ ] Environment variables configured
- [ ] DNS record created in Cloudflare
- [ ] SSL/HTTPS working
- [ ] Can access https://videoReviews.tadaspranulis.com
- [ ] Can login as admin
- [ ] Can upload files
- [ ] Thumbnails generating
- [ ] Security settings reviewed (SECURITY.md)

---

## 🎉 You're Live!

Once everything is working:

1. Share the URL: https://videoReviews.tadaspranulis.com
2. Login with your admin credentials
3. Start reviewing videos!

---

## 📞 Need Help?

- Railway docs: https://docs.railway.app
- Cloudflare docs: https://developers.cloudflare.com
- DigitalOcean tutorials: https://www.digitalocean.com/community/tutorials

Your video review platform is ready for the world! 🚀


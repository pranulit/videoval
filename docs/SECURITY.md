# 🔒 Security Guide - ValEval Platform

## Pre-Deployment Security Checklist

### ✅ Critical (Must Do Before Going Live)

- [ ] **Change Default Credentials**
  - Set strong `ADMIN_USERNAME` (not "admin")
  - Set strong `ADMIN_PASSWORD` (minimum 12 characters, mix of letters/numbers/symbols)
  - Never use "admin123" in production

- [ ] **Configure Session Secret**
  - Generate strong random secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - Set `SESSION_SECRET` in `.env`
  - Never use default or commit to git

- [ ] **Enable HTTPS**
  - Use SSL certificate (Let's Encrypt recommended)
  - Set `secure: true` for cookies in production
  - Redirect HTTP to HTTPS

- [ ] **Set Production Environment**
  - Set `NODE_ENV=production`
  - This enables security features and disables debug info

- [ ] **Review File Upload Limits**
  - Current: 200 files per bulk upload
  - Adjust based on your needs in `uploadBulk.array('files', 200)`

### ⚠️ Important (Highly Recommended)

- [ ] **Configure Firewall**
  - Only allow ports 80 (HTTP) and 443 (HTTPS)
  - Block direct access to port 3000

- [ ] **Setup Backup System**
  - Regular backups of `/data` folder (user data)
  - Regular backups of `/uploads` folder (videos)
  - Backup `folders.json` file

- [ ] **Monitor Disk Space**
  - Videos can consume significant storage
  - Set up alerts for low disk space

- [ ] **Rate Limiting** (Already Configured)
  - 100 requests per 15 minutes per IP
  - 50 uploads per hour per IP
  - Adjust if needed in `server.js`

### 🔍 Optional But Recommended

- [ ] **Use Environment-Based Secrets**
  - Use secret management service (AWS Secrets Manager, Azure Key Vault)
  - Never hardcode secrets in code

- [ ] **Setup Monitoring**
  - Use PM2 for process monitoring
  - Setup error logging (Sentry, LogRocket, etc.)
  - Monitor server resources

- [ ] **Database for Admin Users** (Future Enhancement)
  - Current: Single admin user in environment
  - Consider: Multi-admin with database storage

- [ ] **File Scanning**
  - Scan uploaded files for viruses
  - Validate file types strictly

---

## 🛡️ Built-in Security Features

### Already Implemented

✅ **Session Management**
- HTTP-only cookies (prevents XSS attacks)
- Secure cookies in production (HTTPS only)
- SameSite: strict (prevents CSRF)
- 24-hour session timeout

✅ **Rate Limiting**
- General: 100 requests per 15 minutes
- Uploads: 50 per hour
- Prevents brute force and DoS attacks

✅ **Password Hashing**
- Bcrypt with 10 rounds
- Passwords never stored in plain text

✅ **File Upload Validation**
- File type checking
- Size limits enforced
- Multer security defaults

✅ **Authentication Middleware**
- Admin-only routes protected
- Unauthorized requests rejected

✅ **Error Handling**
- Detailed errors only in development
- Generic errors in production
- No sensitive info leaked

---

## 🚨 Security Best Practices

### For Administrators

1. **Strong Passwords**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Use password manager

2. **Regular Updates**
   ```bash
   npm audit          # Check for vulnerabilities
   npm update         # Update dependencies
   npm audit fix      # Auto-fix vulnerabilities
   ```

3. **Access Control**
   - Only share admin credentials with trusted users
   - Change password if compromised
   - Use separate admin accounts if possible

4. **Data Backup**
   - Backup before major updates
   - Test restore procedures
   - Store backups securely (encrypted, off-site)

5. **Monitor Logs**
   ```bash
   pm2 logs valeval --lines 100
   ```
   - Watch for suspicious activity
   - Multiple failed login attempts
   - Unusual file uploads

### For Users

1. **Secure Connections**
   - Always use HTTPS
   - Verify SSL certificate
   - Don't bypass security warnings

2. **Sensitive Data**
   - Don't upload confidential videos without encryption
   - Be aware who has access to folders
   - Clear browser cache after use

3. **Report Issues**
   - Report security concerns to admin
   - Don't exploit vulnerabilities

---

## 🔐 Password Security

### Generate Strong Admin Password

```bash
# Option 1: Using Node.js
node -e "console.log(require('crypto').randomBytes(16).toString('base64'))"

# Option 2: Using OpenSSL
openssl rand -base64 16

# Option 3: Online (use trusted sources only)
# https://passwordsgenerator.net/
```

### Generate Session Secret

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🚫 What NOT to Do

❌ **Don't** commit `.env` file to Git
❌ **Don't** use default credentials in production
❌ **Don't** disable HTTPS in production
❌ **Don't** expose port 3000 directly to internet
❌ **Don't** ignore `npm audit` warnings
❌ **Don't** share admin credentials via insecure channels (email, SMS)
❌ **Don't** store sensitive data in client-side code
❌ **Don't** ignore security updates

---

## 📊 Security Audit Log

Keep track of security updates:

| Date | Action | Version | Notes |
|------|--------|---------|-------|
| 2024-11-24 | Initial deployment | 1.0.0 | All security features implemented |

---

## 🆘 Security Incident Response

If you suspect a security breach:

1. **Immediately**
   - Change admin password
   - Change session secret
   - Restart application

2. **Investigate**
   - Check server logs
   - Review recent uploads
   - Check for unauthorized access

3. **Respond**
   - Delete malicious files
   - Ban offending IPs
   - Restore from backup if needed

4. **Prevent**
   - Update dependencies
   - Strengthen security rules
   - Add additional monitoring

---

## 📞 Reporting Security Issues

If you discover a security vulnerability:

1. **Don't** disclose publicly
2. Document the issue privately
3. Contact system administrator
4. Wait for fix before disclosure

---

## 🔄 Regular Security Maintenance

### Weekly
- [ ] Review access logs
- [ ] Check disk space
- [ ] Monitor error rates

### Monthly  
- [ ] Run `npm audit`
- [ ] Update dependencies
- [ ] Test backups
- [ ] Review user activity

### Quarterly
- [ ] Security audit
- [ ] Password rotation
- [ ] Review access controls
- [ ] Update documentation

---

## 📚 Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)

---

**Remember: Security is an ongoing process, not a one-time setup!**


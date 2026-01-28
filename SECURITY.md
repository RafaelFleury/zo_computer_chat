# Security Guide

## Overview

This application includes HTTP Basic Authentication to protect your instance when deployed publicly (e.g., as a Zo Computer service).

## Quick Setup for Public Deployment

### 1. Generate a Secure Password

```bash
cd backend
npm run generate-password
```

This will output something like:
```
🔐 Generated secure password:

  SLMG_6Ar8-6yIs4Uq7qKylz-

Add this to your backend/.env file:

  AUTH_PASSWORD=SLMG_6Ar8-6yIs4Uq7qKylz-
```

### 2. Add to Your `.env` File

Edit `backend/.env` and add:

```env
# Authentication (REQUIRED for public deployments)
AUTH_USERNAME=admin
AUTH_PASSWORD=SLMG_6Ar8-6yIs4Uq7qKylz-
```

**Replace the password with your generated one!**

### 3. Restart Your Server

The server will now require authentication for all requests.

## How Authentication Works

### HTTP Basic Authentication

- **Industry standard**: Built into all browsers and HTTP clients
- **Browser prompt**: Users see a native login dialog
- **Session persistence**: Browser remembers credentials during session
- **All routes protected**: Frontend, API endpoints, static files - everything requires auth

### What Gets Protected

When `AUTH_PASSWORD` is set, these routes require authentication:
- ✅ Frontend application (`/`)
- ✅ All API endpoints (`/api/*`)
- ✅ Health check (`/health`)
- ✅ Static files (images, CSS, JS)
- ✅ Everything

### When Authentication is Disabled

If `AUTH_PASSWORD` is **not set** or **empty** in `.env`:
- ⚠️ Server starts **without authentication**
- ⚠️ Warning logged: "Authentication is DISABLED"
- 📝 Use this for local development only
- 🚫 **NEVER** deploy publicly without authentication

## Usage

### For Users (Accessing the App)

1. Visit your Zo Computer service URL
2. Browser shows login prompt
3. Enter credentials:
   - **Username**: `admin` (or custom value)
   - **Password**: Your AUTH_PASSWORD value
4. Browser remembers credentials for session
5. To logout: Close browser or clear auth cache

### For Developers (Managing Access)

#### Change Username

```env
AUTH_USERNAME=myusername
```

#### Change Password

```bash
# Generate new password
npm run generate-password

# Update .env with new password
AUTH_PASSWORD=new_generated_password
```

#### Disable Authentication (Local Dev)

Comment out or remove `AUTH_PASSWORD` from `.env`:

```env
# AUTH_PASSWORD=
```

Server will start without authentication (shows warning).

## Security Best Practices

### ✅ DO

- **Generate strong passwords** using `npm run generate-password`
- **Use unique passwords** for each deployment (dev, staging, prod)
- **Keep `.env` file secure** - never commit to git
- **Enable HTTPS** when possible (Zo Computer services use HTTPS)
- **Change default username** (`AUTH_USERNAME`) for additional security
- **Rotate passwords** periodically
- **Use `NODE_ENV=production`** for public deployments

### ❌ DON'T

- **Never commit** `.env` file with real passwords
- **Never use** weak passwords like `password123`
- **Never share** credentials in plain text (use password managers)
- **Never deploy** without authentication on public URLs
- **Don't reuse** passwords across services

## Advanced Security

### Multiple Users

The current implementation supports one username/password. For multiple users:

1. **Option A**: Share one password among trusted team
2. **Option B**: Implement full user management (requires code changes)
3. **Option C**: Use external authentication (OAuth, SAML, etc.)

For Option B or C, consider these enhancements:
- User database (SQLite, PostgreSQL)
- Session management (express-session)
- JWT tokens for API access
- Role-based access control (RBAC)

### Additional Security Layers

Consider adding:

1. **Rate Limiting**: Prevent brute force attacks
   ```bash
   npm install express-rate-limit
   ```

2. **HTTPS**: Always use HTTPS in production
   - Zo Computer services provide HTTPS automatically

3. **IP Whitelist**: Restrict access to known IPs
   - Can be added to authentication middleware

4. **Security Headers**: Helmet.js for HTTP security headers
   ```bash
   npm install helmet
   ```

5. **API Key Authentication**: For programmatic access
   - Separate from user authentication

## Troubleshooting

### "Authentication required" Error

**Symptom**: Can't access the application
**Solution**: Enter correct username and password

### Forgot Password

**Solution**:
1. Access your server's `.env` file
2. Generate new password: `npm run generate-password`
3. Update `AUTH_PASSWORD` in `.env`
4. Restart server

### Authentication Not Working

**Check**:
1. Is `AUTH_PASSWORD` set in `.env`?
2. Did you restart the server after changing `.env`?
3. Check server logs for "Authentication enabled" message
4. Try clearing browser cache/cookies

### Browser Not Prompting for Password

**Solution**:
1. Clear browser authentication cache
2. Try incognito/private browsing mode
3. Check if credentials are cached (browser may auto-login)

## Logging

When authentication is enabled, the server logs:
- ✅ `🔒 Authentication enabled` on startup
- ⚠️ `Unauthorized access attempt from <IP>` on failed auth
- 📝 All successful requests show in standard logs

## Compliance

### Data Privacy

- Credentials transmitted over HTTPS (Zo Computer default)
- No passwords stored in logs
- Sessions are browser-based (no server-side session storage)

### Security Standards

- Implements HTTP Basic Auth (RFC 7617)
- Uses bcryptjs for any password hashing needs
- Follows Node.js security best practices

## Support

For security issues or questions:
1. Check this guide first
2. Review server logs
3. Test with authentication disabled (local dev only)
4. Check browser console for errors

## Updates

Keep authentication dependencies updated:

```bash
cd backend
npm update express-basic-auth bcryptjs
```

Check for security advisories:

```bash
npm audit
```

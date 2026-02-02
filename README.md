# TriFold Technologies - Landing Page

Landing page for TriFold Technologies - AI Implementation Consultancy.

## Quick Deploy to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/YOUR_USERNAME/trifold-website)

## Project Structure

```
├── index.html          # Main landing page
├── admin.html          # Content management interface
├── content.json        # All editable content
├── 404.html           # Custom 404 page
├── netlify.toml       # Netlify configuration
├── _redirects         # URL redirects
├── robots.txt         # SEO robots file
├── sitemap.xml        # SEO sitemap
├── favicon.svg        # Site favicon
├── CLAUDE.md          # AI assistant instructions
└── README.md          # This file
```

## Deployment Instructions

### Option 1: Deploy via Netlify UI

1. Push this repository to GitHub
2. Go to [Netlify](https://app.netlify.com)
3. Click "Add new site" → "Import an existing project"
4. Connect to GitHub and select your repository
5. Click "Deploy site"

### Option 2: Deploy via Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy
netlify deploy --prod
```

## Updating Content

### Method 1: Using the Admin Panel (Recommended for simple edits)

1. Go to `https://your-site.netlify.app/admin`
2. Edit content in the visual editor
3. Click "שמור טיוטה" to save draft locally
4. Click "ייצוא JSON" to download updated `content.json`
5. Replace `content.json` in your repository
6. Commit and push - Netlify will auto-deploy

### Method 2: Direct JSON Edit

1. Edit `content.json` directly
2. Commit and push to GitHub
3. Netlify will auto-deploy within minutes

## Custom Domain Setup

1. In Netlify dashboard, go to "Domain settings"
2. Click "Add custom domain"
3. Enter: `trifoldtechnologies.com`
4. Update DNS records as instructed:
   - Add A record pointing to Netlify's load balancer
   - Or add CNAME record for `www` subdomain

### Recommended DNS Settings

```
Type    Name    Value
A       @       75.2.60.5
CNAME   www     your-site.netlify.app
```

## Environment & Configuration

### Headers (configured in netlify.toml)

- Security headers (X-Frame-Options, XSS Protection)
- Cache control for static assets
- HTML/JSON files: no cache (always fresh)
- CSS/JS/Images: long cache (immutable)

### Redirects

- `/admin` → `/admin.html`
- All 404s → `/404.html`

## SEO Checklist

After deployment, update these files:

1. **sitemap.xml** - Update the domain URL
2. **robots.txt** - Update the sitemap URL
3. **index.html** - Update Open Graph URLs
4. Add `og-image.png` (1200x630px) for social sharing

## Performance Tips

- Images should be WebP format when possible
- Keep images under 200KB
- Use SVG for icons and logos
- Consider adding a service worker for offline support

## Contact

**Itzik Woda** | TriFold Technologies
- 📱 052-8544775
- ✉️ itzik.woda@trifoldtechnologies.com

---

Built with ❤️ for Israeli enterprise executives.

# Browser Extension Guide

Complete guide to installing and using the PhishLogic Browser Extension for Chrome, Firefox, and Edge.

## Overview

The PhishLogic Browser Extension provides instant phishing detection for any link you encounter while browsing. Right-click any link to check if it's safe, suspicious, or malicious.

**Key Features**:
- 🖱️ Right-click context menu integration
- ⚡ Instant notifications with verdict and score
- 📊 Analysis history popup (last 50 checks)
- 📈 Stats dashboard (Safe/Suspicious/Malicious counts)
- ⚙️ Configurable API endpoint (localhost or production)
- 🔔 Visual connection status indicator

---

## Prerequisites

### Required
- **Browser**: Chrome, Firefox, or Edge
- **PhishLogic API** running
  - For testing: `npm run dev` (runs on http://localhost:3000)
  - For production: Deploy API to HTTPS endpoint

### Optional
- Chrome Web Store account (for publishing)
- Firefox Add-ons account (for publishing)

---

## Installation

### Chrome (Developer Mode)

1. **Open Chrome Extensions Page**:
   - Navigate to `chrome://extensions`
   - Or: Menu (⋮) → More Tools → Extensions

2. **Enable Developer Mode**:
   - Toggle **"Developer mode"** switch (top-right corner)

3. **Load Extension**:
   - Click **"Load unpacked"** button
   - Navigate to PhishLogic project folder
   - Select the **`browser-extension/`** directory
   - Click **"Select Folder"**

4. **Verify Installation**:
   - PhishLogic appears in extension list
   - Extension icon appears in Chrome toolbar
   - Status shows "Enabled"

### Firefox (Temporary Add-on)

1. **Open Firefox Debugging Page**:
   - Navigate to `about:debugging#/runtime/this-firefox`
   - Or: Menu (≡) → More Tools → Add-ons and Themes → Settings (⚙️) → Debug Add-ons

2. **Load Extension**:
   - Click **"Load Temporary Add-on..."** button
   - Navigate to PhishLogic project folder
   - Go to **`browser-extension/`** directory
   - Select **`manifest.json`** file
   - Click **"Open"**

3. **Verify Installation**:
   - PhishLogic appears in extension list
   - Extension icon appears in Firefox toolbar
   - Temporary add-ons are removed when Firefox restarts

### Edge (Developer Mode)

1. **Open Edge Extensions Page**:
   - Navigate to `edge://extensions`
   - Or: Menu (⋯) → Extensions

2. **Enable Developer Mode**:
   - Toggle **"Developer mode"** switch (bottom-left)

3. **Load Extension**:
   - Click **"Load unpacked"** button
   - Navigate to PhishLogic project folder
   - Select the **`browser-extension/`** directory
   - Click **"Select Folder"**

4. **Verify Installation**:
   - PhishLogic appears in extension list
   - Extension icon appears in Edge toolbar

---

## First-Time Setup

### 1. Verify API Connection

1. **Start PhishLogic API**:
   ```bash
   cd PhishLogic
   npm run dev
   # Server should start on http://localhost:3000
   ```

2. **Click extension icon** in toolbar
3. **Check status indicator**:
   - 🟢 **Green dot** = Connected
   - 🔴 **Red dot** = Disconnected
   - "Checking connection..." = Testing

### 2. Configure API Endpoint (Optional)

**Default**: http://localhost:3000 (works for local testing)

**To change**:
1. Click extension icon
2. Click **⚙️ Settings** button (top-right)
3. Enter your API endpoint:
   - Local: `http://localhost:3000`
   - Production: `https://api.phishlogic.com`
   - ngrok: `https://your-id.ngrok.io`
4. Click **"Save"**

---

## Using the Extension

### Check a Link for Phishing

1. **Right-click any link** on a webpage
2. Select **"Check for Phishing with PhishLogic"** from context menu
3. **Notification appears** (2-3 seconds) showing:
   - Verdict icon: 🟢 Safe / 🟡 Suspicious / 🔴 Malicious
   - Verdict label: Safe / Suspicious / Malicious
   - Score: 0-10 (higher = more suspicious)
   - Reasoning: Brief explanation

4. **Check history** (optional):
   - Click extension icon
   - View full analysis details in popup

### Check Selected Text URL

1. **Select text** containing a URL (e.g., "Check out https://example.com")
2. **Right-click** on selected text
3. Select **"Check for Phishing with PhishLogic"**
4. Extension extracts URL and analyzes it

### View Analysis History

1. **Click extension icon** in toolbar
2. **Popup displays**:
   - **Stats**: Count of Safe/Suspicious/Malicious analyses
   - **Recent Analysis**: Last 10 checks with full details
   - **Timestamp**: When each analysis was performed

3. **History details include**:
   - Verdict and score
   - Full URL (truncated for display)
   - Reasoning
   - Red flags (if any)

### Clear History

1. Click extension icon
2. Click **"Clear"** button (next to "Recent Analysis" header)
3. Confirm deletion
4. History and stats reset

---

## Understanding Results

### Safe (🟢 Score: 0-3)

**Meaning**: Link appears legitimate with no significant red flags.

**Example**:
```
🟢 PhishLogic: Safe
Score: 2/10
This link appears to be legitimate. The domain is well-established,
uses HTTPS, and shows no suspicious patterns.
```

**Action**: Safe to click normally

### Suspicious (🟡 Score: 4-6)

**Meaning**: Some concerning indicators detected. Proceed with caution.

**Example**:
```
🟡 PhishLogic: Suspicious
Score: 5/10
This link has some suspicious characteristics. The domain was recently
registered and uses a URL shortener. Verify before clicking.
```

**Red Flags Might Include**:
- URL shortener (bit.ly, tinyurl.com)
- Recently registered domain (< 30 days)
- Suspicious TLD (.tk, .ml, .ga)
- Typosquatting attempt

**Action**: Verify with sender or avoid clicking

### Malicious (🔴 Score: 7-10)

**Meaning**: High confidence this is a phishing attempt. Do NOT click.

**Example**:
```
🔴 PhishLogic: Malicious
Score: 9/10
This link is likely a phishing attempt. Multiple red flags detected
including domain mimicry, suspicious redirect chains, and known
phishing patterns. Do NOT click this link.
```

**Red Flags Might Include**:
- Domain mimicking legitimate brands (paypai.com instead of paypal.com)
- Multiple redirect hops
- Matches known phishing patterns
- Suspicious form submission detected

**Action**: Do NOT click. Report to security team.

---

## Extension Popup Features

### Status Bar

Located at the top of the popup:

- **🟢 Connected**: API is reachable and responding
- **🔴 Disconnected**: Cannot reach API (check if running)
- **🟠 Error**: API returned an error (check logs)

### Stats Dashboard

Shows cumulative statistics:
- **Safe**: Count of safe links analyzed
- **Suspicious**: Count of suspicious links
- **Malicious**: Count of malicious links

**Uses**: Track your browsing safety over time

### History List

- **Last 10 analyses** displayed
- **Newest first** (most recent at top)
- **Scrollable** if more than fits on screen
- **Click-to-expand** for full details (future feature)

---

## Troubleshooting

### Extension Not Loading

**Chrome/Edge**:
1. Go to `chrome://extensions` or `edge://extensions`
2. Check for error messages under PhishLogic
3. Click **"Reload"** icon (🔄) to refresh extension
4. Check browser console (F12) for errors

**Firefox**:
1. Temporary add-ons are removed on restart
2. Reload from `about:debugging` each session
3. For permanent: Use `web-ext` tool or publish to AMO

### Context Menu Not Appearing

**Solution 1: Reload Extension**
1. `chrome://extensions` → Click reload icon for PhishLogic
2. Right-click on a link again

**Solution 2: Check Permissions**
1. Verify manifest.json has `"contextMenus"` permission
2. Verify extension is enabled

**Solution 3: Try Different Link**
- Some websites block context menus
- Try on a standard link (e.g., Google.com)

### "Disconnected" Status

**Check API Status**:
```bash
# Verify API is running
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy",...}
```

**Fix Steps**:
1. **Start API**: `npm run dev`
2. **Check endpoint**: Settings → Verify API URL
3. **Check CORS**: API must allow extension origin
4. **Check network**: Open browser DevTools → Network tab

### Notifications Not Showing

**Chrome Notification Settings**:
1. Chrome Settings → Privacy and security → Site Settings
2. Notifications → Check that Chrome can send notifications
3. Check that PhishLogic extension is allowed

**System Notification Settings**:
- **Windows**: Settings → System → Notifications
- **Mac**: System Preferences → Notifications
- **Linux**: Settings → Notifications

### "Failed to Check URL" Error

**Common Causes**:
1. **API not running**: Start with `npm run dev`
2. **Wrong endpoint**: Check Settings → API endpoint URL
3. **Network error**: Check internet connection
4. **CORS issue**: API must allow extension origin
5. **Invalid URL**: URL must be properly formatted

**Debug**:
1. Click extension icon → ⚙️ Settings
2. Try changing API endpoint
3. Check browser console (F12) for detailed errors

---

## Advanced Configuration

### Custom API Endpoint

**Using ngrok** (for remote testing):
```bash
# Terminal 1: Start PhishLogic API
npm run dev

# Terminal 2: Start ngrok tunnel
ngrok http 3000

# Copy ngrok URL (e.g., https://abc123.ngrok.io)
# Extension Settings → API Endpoint → https://abc123.ngrok.io
```

**Using Production API**:
```
Extension Settings → API Endpoint → https://api.phishlogic.com
```

### Chrome Storage Inspection

View extension storage data:
1. `chrome://extensions` → PhishLogic → "Inspect views: background page"
2. Console tab
3. Run: `chrome.storage.local.get(console.log)`
4. View history and settings

### Clear All Data

Reset extension completely:
```javascript
// In extension background page console:
chrome.storage.local.clear();
chrome.storage.sync.clear();
console.log('Extension data cleared');
```

---

## Publishing Extension

### Chrome Web Store

1. **Package Extension**:
   ```bash
   cd browser-extension
   zip -r ../phishlogic-extension.zip . -x "*.git*" "*.DS_Store" "README.md"
   ```

2. **Create Developer Account**:
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Pay one-time $5 registration fee

3. **Submit Extension**:
   - Click "New Item"
   - Upload `phishlogic-extension.zip`
   - Fill out listing details
   - Add screenshots
   - Submit for review

4. **Review Process**: 1-3 days

### Firefox Add-ons

1. **Package Extension**:
   ```bash
   cd browser-extension
   zip -r ../phishlogic-extension.zip . -x "*.git*" "*.DS_Store" "README.md"
   ```

2. **Submit to AMO**:
   - Go to [addons.mozilla.org](https://addons.mozilla.org/developers/)
   - Create account (free)
   - Submit new add-on
   - Upload ZIP
   - Complete listing

3. **Review Process**: ~7 days

### Update manifest.json Before Publishing

```json
{
  "version": "1.0.0",  // Increment for updates
  "host_permissions": [
    "http://localhost:3000/*",
    "https://api.phishlogic.com/*"  // Add production URL
  ],
  "icons": {
    // Replace with real icons (see icons/README.md)
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

---

## Security & Privacy

### Permissions Explained

**What Extension Can Access**:
- ✅ Context menu system (to add "Check for Phishing" option)
- ✅ Notifications (to show analysis results)
- ✅ Storage (to save history and settings locally)
- ✅ Make requests to PhishLogic API (only)

**What Extension Cannot Access**:
- ❌ Browsing history
- ❌ Tab content (doesn't read webpages)
- ❌ Passwords or autofill data
- ❌ Other extensions

### Data Handling

- **Link URLs** sent to PhishLogic API for analysis
- **Analysis results** stored locally in browser (not synced)
- **Settings** stored in Chrome sync storage (if signed in)
- **No tracking** or analytics
- **No external servers** (except configured PhishLogic API)

### API Security

For production deployment:
- Use **HTTPS only**
- Implement **API keys** for authentication
- Set up **CORS** to allow extension origin
- Enable **rate limiting**

---

## FAQ

**Q: Does it work on all websites?**
A: Yes! Works on any webpage with links.

**Q: Can I check links in PDFs or documents?**
A: No. Only works on links in webpages.

**Q: Does it slow down browsing?**
A: No. Analysis only happens when you right-click (on-demand).

**Q: How much data does it use?**
A: Minimal. Each analysis is ~1-2 KB (just the URL and response).

**Q: Can I use it offline?**
A: No. Requires connection to PhishLogic API.

**Q: Does it work with password managers?**
A: Yes! No conflicts with password managers.

**Q: Can I customize the notification style?**
A: No. Uses browser's native notification system.

**Q: How long is history kept?**
A: Last 50 analyses. Automatically removes oldest when limit reached.

---

## Support

**Need help?**
- GitHub Issues: https://github.com/your-org/PhishLogic/issues
- Documentation: docs/development/
- Extension README: browser-extension/README.md

**Contributing**:
- Report bugs via GitHub Issues
- Submit pull requests for improvements
- Share feedback on user experience

---

**Next Steps**: Try the [Gmail Add-on](GMAIL_ADDON_SETUP.md) for one-click email phishing analysis!

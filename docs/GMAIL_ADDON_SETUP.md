# Gmail Add-on Setup Guide

Complete guide to installing and using the PhishLogic Gmail Add-on.

## Overview

The PhishLogic Gmail Add-on provides one-click phishing analysis directly in your Gmail interface. Click a button to analyze any email for phishing threats and get instant results with reasoning and red flags.

**Key Features**:
- 🛡️ One-click analysis from Gmail sidebar
- 🎯 Instant verdict (Safe/Suspicious/Malicious)
- 📊 0-10 scoring system with plain English reasoning
- 🚩 Specific red flags and phishing indicators
- ⚡ On-demand analysis (no background polling)
- 🗑️ Quick actions (report, trash suspicious emails)

---

## Prerequisites

### Required
- **Google Account** with Gmail access
- **PhishLogic API** running
  - For testing: `npm run dev` (runs on http://localhost:3000)
  - For production: Deploy API to HTTPS endpoint

### Optional
- Google Workspace account (for organization-wide deployment)

---

## Installation Steps

### Step 1: Create Apps Script Project

1. Open [Google Apps Script](https://script.google.com) in a new tab
2. Click the **"+ New Project"** button (top-left)
3. A blank project opens with default `Code.gs` file
4. Click **"Untitled project"** at the top
5. Rename to **"PhishLogic"**

### Step 2: Enable Manifest File

1. Click **⚙️ (Project Settings)** in the left sidebar
2. Under "General settings", check the box:
   - ☑️ **"Show appsscript.json manifest file in editor"**
3. Click **"Editor"** in left sidebar to return to code view

### Step 3: Add Configuration (appsscript.json)

1. In the file list, click **`appsscript.json`**
2. Delete all existing content
3. Copy and paste this configuration:

```json
{
  "timeZone": "America/New_York",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/gmail.addons.current.message.readonly",
    "https://www.googleapis.com/auth/script.external_request"
  ],
  "gmail": {
    "name": "PhishLogic",
    "logoUrl": "https://www.gstatic.com/images/branding/product/1x/keep_48dp.png",
    "contextualTriggers": [{
      "unconditional": {},
      "onTriggerFunction": "buildAddOn"
    }],
    "universalActions": [{
      "label": "Analyze for Phishing",
      "runFunction": "analyzeCurrentEmail"
    }]
  }
}
```

4. Click **💾 Save** (or press Ctrl+S / Cmd+S)

### Step 4: Add Main Code (Code.gs)

1. Click **`Code.gs`** in the file list
2. Delete all existing content
3. Copy entire contents of `gmail-addon/Code.gs` from the repository
4. Paste into the editor
5. Click **💾 Save**

### Step 5: Configure API Endpoint

In the `Code.gs` file, find this line near the top:

```javascript
const PHISHLOGIC_API = 'http://localhost:3000/api/v1/analyze/email';
```

**Update based on your setup**:

**For local testing** (same machine):
```javascript
const PHISHLOGIC_API = 'http://localhost:3000/api/v1/analyze/email';
```

**For remote testing** (using ngrok):
```javascript
const PHISHLOGIC_API = 'https://your-ngrok-url.ngrok.io/api/v1/analyze/email';
```

**For production**:
```javascript
const PHISHLOGIC_API = 'https://api.phishlogic.com/api/v1/analyze/email';
```

Click **💾 Save** after updating.

### Step 6: Deploy as Test Add-on

1. Click **"Deploy"** button (top-right corner)
2. Select **"Test deployments"** from dropdown
3. Click **"Install"** button
4. **Authorization screen appears**:
   - Click **"Review permissions"**
   - Select your Google account
   - Click **"Advanced"** (if warning appears)
   - Click **"Go to PhishLogic (unsafe)"**
   - Click **"Allow"** to grant permissions
5. You'll see "PhishLogic has been installed as test add-on"
6. Click **"Done"**

---

## Using the Add-on

### First Use

1. Open [Gmail](https://mail.google.com) in a new tab
2. Open any email
3. Look for **PhishLogic sidebar** on the right side
4. If you don't see it, refresh Gmail (F5 or Cmd+R)

### Analyzing an Email

1. **Open email** you want to check
2. **PhishLogic sidebar** appears on right with:
   - PhishLogic logo and title
   - Brief description
   - **"🛡️ Analyze Email"** button
3. **Click the button**
4. Wait 2-5 seconds (analyzing...)
5. **Result card displays** with:
   - Verdict icon: 🟢 Safe / 🟡 Suspicious / 🔴 Malicious
   - Score: 0-10 (higher = more suspicious)
   - Reasoning: Plain English explanation
   - Red Flags: Specific phishing indicators (if any)

### Understanding Results

**Safe (🟢 Score: 0-3)**:
- Email appears legitimate
- No significant red flags
- Safe to proceed normally

**Suspicious (🟡 Score: 4-6)**:
- Some concerning indicators
- Review carefully before clicking links
- Consider verifying with sender directly

**Malicious (🔴 Score: 7-10)**:
- High confidence phishing attempt
- Do NOT click links or attachments
- Report to security team

### Taking Action

**For Suspicious/Malicious emails**:
- Click **"⚠️ Report Email"** to notify security@company.com
- Click **"🗑️ Move to Trash"** to delete the email

**For any email**:
- Click **"🔄 Analyze Again"** to re-run analysis

---

## Troubleshooting

### Add-on Not Appearing

**Solution 1: Refresh Gmail**
- Press F5 (Windows/Linux) or Cmd+R (Mac)
- Or close and reopen Gmail tab

**Solution 2: Check Installation**
1. Go back to Apps Script editor
2. Click **"Deploy"** → **"Test deployments"**
3. Verify "PhishLogic" shows as "Installed"
4. If not, click **"Install"** again

**Solution 3: Check Authorization**
1. Apps Script → ⚙️ **Project Settings**
2. Scroll to **"OAuth Scopes"**
3. Verify these scopes are listed:
   - `gmail.addons.current.message.readonly`
   - `script.external_request`

### "Analysis Failed" Error

**Check API Status**:
```bash
# Open terminal and run:
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy",...}
```

**Common Fixes**:

1. **API not running**:
   ```bash
   cd PhishLogic
   npm run dev
   ```

2. **Wrong API endpoint**:
   - Update `PHISHLOGIC_API` in Code.gs
   - Save and refresh Gmail

3. **Localhost limitation**:
   - Localhost only works if Gmail and API are on same machine
   - Use ngrok for remote testing:
     ```bash
     ngrok http 3000
     # Use https://your-url.ngrok.io endpoint
     ```

### Permissions Error

**Revoke and Re-authorize**:
1. Apps Script → ⚙️ **Project Settings**
2. Click **"Show 'appsscript.json' manifest file"** (if not visible)
3. Go to https://myaccount.google.com/permissions
4. Find "PhishLogic" and remove access
5. Re-deploy in Apps Script (Step 6 above)

### Slow Analysis

**Expected**: 2-5 seconds
**If longer than 10 seconds**:
- Check API performance (`npm run dev` logs)
- Verify network connection
- Check Apps Script execution log

---

## Advanced Configuration

### Viewing Logs

1. Apps Script editor
2. Bottom panel shows **"Execution log"**
3. Or: **View** → **Logs** (Ctrl+Enter / Cmd+Enter)

### Testing Function

Run functions manually to debug:
1. Select `buildAddOn` from function dropdown (top)
2. Click **▶ Run** button
3. Check logs for errors

### Custom Report Email

Update report email address in Code.gs:
```javascript
// Line ~185
.setUrl('mailto:security@company.com?subject=Phishing%20Report&body=...')

// Change to:
.setUrl('mailto:YOUR-SECURITY-EMAIL@company.com?subject=Phishing%20Report&body=...')
```

---

## Organization-Wide Deployment

For deploying to your entire organization:

### Prerequisites
- Google Workspace Admin account
- Organization domain (e.g., company.com)

### Steps
1. Complete installation steps above
2. Apps Script → **"Deploy"** → **"New deployment"**
3. Select **"Add-on"** deployment type
4. Configure:
   - **Name**: PhishLogic Phishing Detector
   - **Description**: One-click phishing analysis
   - **Visibility**: Internal (organization only)
5. Click **"Deploy"**
6. As Workspace Admin:
   - Open [Admin Console](https://admin.google.com)
   - **Apps** → **Google Workspace Marketplace Apps**
   - Click **"+"** to add app
   - Search for "PhishLogic" (internal apps)
   - **Install** for all users or specific groups

**Timeline**: 1-2 hours to deploy

---

## Production Deployment

For public Google Workspace Marketplace:

### Requirements
- **HTTPS API endpoint** (localhost won't work)
- **Privacy Policy** URL
- **Terms of Service** URL
- **Support email**
- **OAuth verification** (Google review process)

### Process
1. Deploy API to production (HTTPS)
2. Update `PHISHLOGIC_API` to production URL
3. Create privacy policy and ToS pages
4. Apps Script → **"Deploy"** → **"New deployment"**
5. Select **"Add-on"** → **"Public"**
6. Complete Google Workspace Marketplace listing
7. Submit for review

**Timeline**: 2-4 weeks (Google review)

---

## Security & Privacy

### Permissions Explained

**What PhishLogic Can Access**:
- ✅ Current email only (the one you're viewing)
- ✅ Make HTTP requests to PhishLogic API

**What PhishLogic Cannot Access**:
- ❌ Other emails in your inbox
- ❌ Contacts
- ❌ Calendar
- ❌ Drive files
- ❌ Send emails on your behalf

### Data Handling

- **Email content** sent to PhishLogic API for analysis
- **No storage** on PhishLogic server (analyzed and discarded)
- **No tracking** or analytics
- **Logs** stored locally in Apps Script (Google's servers)

### API Security

For production:
- Use **HTTPS only**
- Consider **API keys** for authentication
- Implement **rate limiting**
- Set up **CORS** properly

---

## FAQ

**Q: Can I use this with personal Gmail accounts?**
A: Yes! Works with both personal Gmail and Google Workspace.

**Q: Does it work on mobile?**
A: Gmail Add-ons are **desktop only** (web Gmail). Mobile not supported.

**Q: How much does it cost?**
A: PhishLogic is open source. Apps Script is free (subject to quotas).

**Q: Can I customize the UI?**
A: Yes! Edit `buildAddOn()` and `buildResultCard()` functions in Code.gs.

**Q: Does it analyze automatically?**
A: No. You must click **"Analyze Email"** for each email (on-demand analysis).

**Q: Can I analyze emails in bulk?**
A: Not supported. Designed for on-demand, single-email analysis.

**Q: What are the quotas?**
A: Apps Script allows 20,000 UrlFetch calls/day (more than enough for typical use).

---

## Support

**Need help?**
- GitHub Issues: https://github.com/your-org/PhishLogic/issues
- Documentation: docs/development/
- Extension README: gmail-addon/README.md

**Contributing**:
- Report bugs via GitHub Issues
- Submit pull requests for improvements
- Share feedback on user experience

---

**Next Steps**: After setup, try the [Browser Extension](BROWSER_EXTENSION.md) for right-click phishing detection!

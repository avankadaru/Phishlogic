# Gmail Add-on Quick Test Guide

**Estimated time**: 5-10 minutes

## Prerequisites Check ✅

API Status: Running at http://localhost:3000
- Test: `curl http://localhost:3000/health`
- Expected: `{"status":"healthy",...}`

---

## Installation Steps (5 minutes)

### 1. Open Apps Script

Navigate to: **https://script.google.com**

Click: **"+ New Project"** (top-left)

---

### 2. Enable Manifest File

1. Click **⚙️ (Project Settings)** icon (left sidebar)
2. Find: "General settings"
3. Check: ☑️ **"Show appsscript.json manifest file in editor"**
4. Click **"Editor"** (left sidebar) to return

---

### 3. Add appsscript.json

1. In file list, click **`appsscript.json`**
2. Delete all existing content
3. **Copy this** (from your terminal):

```bash
cat /Users/anil.vankadaru/code/PhishLogic/gmail-addon/appsscript.json
```

4. **Paste into Apps Script editor**
5. **Save**: Press `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac)

---

### 4. Add Code.gs

1. In file list, click **`Code.gs`**
2. Delete all existing content
3. **Copy this** (from your terminal):

```bash
cat /Users/anil.vankadaru/code/PhishLogic/gmail-addon/Code.gs
```

4. **Paste into Apps Script editor**
5. **Save**: Press `Ctrl+S` or `Cmd+S`

---

### 5. Configure API Endpoint

In `Code.gs`, verify this line (around line 12):

```javascript
const PHISHLOGIC_API = 'http://localhost:3000/api/v1/analyze/email';
```

**For testing on same machine**: ✅ Keep as-is

**For remote testing**: Change to your API URL (if needed)

**Save again** after any changes.

---

### 6. Deploy Add-on

1. Click **"Deploy"** button (top-right)
2. Select **"Test deployments"** from dropdown
3. Click **"Install"** button

**Authorization Screen Appears**:
1. Click **"Review permissions"**
2. Select your Google account
3. If warning appears:
   - Click **"Advanced"**
   - Click **"Go to PhishLogic (unsafe)"**
4. Click **"Allow"** to grant permissions:
   - Read current email
   - Make external requests

5. Success message: "PhishLogic has been installed as test add-on"
6. Click **"Done"**

---

## Testing (5 minutes)

### Test 1: Add-on Appears

1. **Open Gmail**: https://mail.google.com
2. **Open any email** (or send yourself one)
3. **Look at right sidebar**:
   - ✅ PhishLogic sidebar should appear
   - ✅ Shows: "PhishLogic" header
   - ✅ Shows: "🛡️ Analyze Email" button

**If sidebar doesn't appear**:
- Refresh Gmail (F5 or Cmd+R)
- Close and reopen the email
- Try a different email

---

### Test 2: Analyze Safe Email

1. **Open a trusted email** (from Gmail, Google, known sender)
2. **Click**: "🛡️ Analyze Email" button
3. **Wait 2-5 seconds** (analyzing...)
4. **Result card appears**:
   - ✅ Verdict: "🟢 Verdict: Safe"
   - ✅ Score: 0-3/10
   - ✅ Reasoning displayed
   - ✅ No red flags (or minimal)

---

### Test 3: Analyze Suspicious Email

**Send yourself a test email**:
1. From your personal email → Gmail
2. **Subject**: "URGENT: Verify Your Account NOW!"
3. **Body**: Include a bit.ly link or suspicious content
4. **Send it**

**Then analyze**:
1. Open the test email in Gmail
2. Click "🛡️ Analyze Email"
3. **Expected**:
   - ✅ Verdict: "🟡 Suspicious" or "🔴 Malicious"
   - ✅ Score: 4+/10
   - ✅ Red flags listed (e.g., "Urgent language detected", "URL shortener")

---

### Test 4: Quick Actions

**For suspicious/malicious emails**:
1. **Verify buttons appear**:
   - ✅ "⚠️ Report Email" button
   - ✅ "🗑️ Move to Trash" button
2. **Click "Move to Trash"**
3. **Verify**: Email moved to trash, notification shown

---

### Test 5: Re-analyze

1. Open any analyzed email
2. Click **"🔄 Analyze Again"** button
3. **Verify**: Analysis runs again, new result shown

---

## Troubleshooting

### "Analysis Failed" Error

**Check API**:
```bash
# In terminal:
curl http://localhost:3000/health

# If fails:
cd /Users/anil.vankadaru/code/PhishLogic
npm run dev
```

**Check Apps Script Logs**:
1. Apps Script editor → Bottom panel
2. View → Logs (Ctrl+Enter / Cmd+Enter)
3. Look for error messages

---

### Add-on Not Appearing in Gmail

**Solution 1**: Refresh Gmail
- Press F5 (Windows/Linux) or Cmd+R (Mac)

**Solution 2**: Re-authorize
1. Apps Script → Deploy → Test deployments
2. Verify "PhishLogic" shows as "Installed"
3. If not, click "Install" again

**Solution 3**: Check Permissions
1. Apps Script → ⚙️ Project Settings
2. Scroll to "OAuth Scopes"
3. Verify:
   - `gmail.addons.current.message.readonly`
   - `script.external_request`

---

### "Cannot connect to localhost" Error

**This means**:
- Gmail Add-on runs in Google's cloud
- Cannot directly access localhost from cloud
- **Solutions**:

**Option A**: Use ngrok (Recommended for remote testing)
```bash
# Terminal 1: API
npm run dev

# Terminal 2: ngrok tunnel
ngrok http 3000

# Copy ngrok URL (e.g., https://abc123.ngrok.io)
# Update Code.gs line 12:
# const PHISHLOGIC_API = 'https://abc123.ngrok.io/api/v1/analyze/email';
```

**Option B**: Test only when API is deployed to HTTPS
- Deploy PhishLogic to production (HTTPS)
- Update PHISHLOGIC_API in Code.gs

---

## Test Results Checklist

After testing, mark what works:

```
✅ Add-on appears in Gmail sidebar: YES / NO
✅ "Analyze Email" button visible: YES / NO
✅ Analysis completes (2-5 seconds): YES / NO
✅ Verdict displayed correctly: YES / NO
✅ Score shown (0-10): YES / NO
✅ Reasoning text appears: YES / NO
✅ Red flags listed (if any): YES / NO
✅ "Move to Trash" works: YES / NO
✅ "Report Email" opens: YES / NO
✅ "Analyze Again" re-runs: YES / NO

Issues Found:
1. _______________
2. _______________

Overall: PASS / FAIL
```

---

## Next Steps

After successful testing:

1. ✅ **Test with various email types**:
   - Legitimate emails (Gmail, known senders)
   - Marketing emails (with links)
   - Suspicious emails (urgent language, unknown senders)

2. ✅ **Test error handling**:
   - Stop API mid-analysis
   - Verify error message displays

3. ✅ **Deploy organization-wide** (optional):
   - Google Workspace Admin Console
   - Internal distribution

4. ✅ **Deploy to production**:
   - Update API endpoint to HTTPS
   - Submit to Google Workspace Marketplace

---

**Ready to test? Start at: https://script.google.com 🚀**

# Browser Extension Testing Guide

Complete testing checklist for the PhishLogic browser extension.

## Pre-Testing Setup

### 1. Start PhishLogic API

```bash
# Terminal 1: Start the API server
cd /Users/anil.vankadaru/code/PhishLogic
npm run dev

# Wait for: "Server listening at http://localhost:3000"
```

### 2. Verify API Health

```bash
# Terminal 2: Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy",...}
```

### 3. Test API Endpoint

```bash
# Test URL analysis endpoint
curl -X POST http://localhost:3000/api/v1/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com"}'

# Expected: JSON response with verdict, score, reasoning
```

---

## Extension Installation

### Chrome Installation

1. **Open Extensions Page**:
   - Navigate to: `chrome://extensions`
   - Or: Chrome Menu (⋮) → More Tools → Extensions

2. **Enable Developer Mode**:
   - Look for toggle in **top-right corner**
   - Switch **"Developer mode"** to **ON**

3. **Load Extension**:
   - Click **"Load unpacked"** button (top-left)
   - Navigate to: `/Users/anil.vankadaru/code/PhishLogic/browser-extension`
   - Click **"Select"** or **"Open"**

4. **Verify Installation**:
   - ✅ PhishLogic appears in extension list
   - ✅ No errors shown under extension
   - ✅ Extension icon appears in Chrome toolbar (top-right)

**Troubleshooting**:
- If you see errors, check manifest.json syntax
- If icon missing, extension may not have loaded properly
- Try: Remove extension → Reload it

---

## Testing Checklist

### Phase 1: Basic Functionality ✅

#### Test 1.1: Extension Loads
- [ ] Extension icon visible in Chrome toolbar
- [ ] No error badges on extension icon
- [ ] Extension shows as "Enabled" in chrome://extensions

#### Test 1.2: Context Menu Appears
1. **Open any webpage** (e.g., google.com)
2. **Right-click any link** on the page
3. **Verify**:
   - [ ] Context menu appears
   - [ ] "Check for Phishing with PhishLogic" option visible
   - [ ] Option is clickable (not grayed out)

**If context menu doesn't appear**:
```bash
# Check background script console
# chrome://extensions → PhishLogic → "Inspect views: service worker"
# Look for errors in console
```

---

### Phase 2: API Connection ✅

#### Test 2.1: Popup Opens
1. **Click extension icon** in toolbar
2. **Verify popup displays**:
   - [ ] Header shows "🛡️ PhishLogic"
   - [ ] Status bar visible at top
   - [ ] Stats section visible (Safe/Suspicious/Malicious)
   - [ ] "Recent Analysis" section visible

#### Test 2.2: Connection Status
1. **With API running** (npm run dev):
   - [ ] Status indicator shows **green dot** 🟢
   - [ ] Status text says **"Connected"**

2. **Stop API** (Ctrl+C in terminal):
   - [ ] Wait 5 seconds
   - [ ] Refresh popup (close and reopen)
   - [ ] Status indicator shows **red dot** 🔴
   - [ ] Status text says **"Disconnected"**

3. **Restart API** (npm run dev):
   - [ ] Refresh popup
   - [ ] Status returns to green **"Connected"**

---

### Phase 3: URL Analysis ✅

#### Test 3.1: Analyze Safe URL

1. **Visit any webpage with links** (e.g., https://news.ycombinator.com)
2. **Right-click a link to google.com or github.com**
3. **Select "Check for Phishing with PhishLogic"**
4. **Notification should appear** (2-3 seconds):
   - [ ] Shows: **"🟢 PhishLogic: Safe"**
   - [ ] Shows score (e.g., "Score: 1/10")
   - [ ] Shows reasoning text

5. **Click extension icon → Check popup**:
   - [ ] "Safe" count increased by 1
   - [ ] History shows the analyzed URL
   - [ ] Verdict displays as "Safe"
   - [ ] Score shown (0-3 range)
   - [ ] Timestamp displayed

#### Test 3.2: Analyze Suspicious URL

**Use a bit.ly link**:
1. Visit: https://bitly.com
2. Create a short link (or find one online)
3. **Right-click the bit.ly shortened URL**
4. **Select "Check for Phishing with PhishLogic"**
5. **Notification should show**:
   - [ ] **"🟡 PhishLogic: Suspicious"** (or similar)
   - [ ] Score: 4-6 range
   - [ ] Reasoning mentions URL shortener

6. **Check popup**:
   - [ ] "Suspicious" count increased
   - [ ] History shows URL with suspicious verdict
   - [ ] Red flags listed (e.g., "URL shortener detected")

#### Test 3.3: Analyze Selected Text

1. **On any webpage, type or find text**:
   ```
   Check out https://example.com for details
   ```
2. **Select the entire text** (including the URL)
3. **Right-click selected text**
4. **Select "Check for Phishing with PhishLogic"**
5. **Verify**:
   - [ ] Extension extracts URL from text
   - [ ] Notification appears with analysis result
   - [ ] History updated

---

### Phase 4: Popup Features ✅

#### Test 4.1: History Display

**After analyzing 3-5 URLs**:
1. **Click extension icon**
2. **Verify history list**:
   - [ ] Shows last 10 analyses (newest first)
   - [ ] Each entry has verdict icon (🟢/🟡/🔴)
   - [ ] Each entry shows verdict label
   - [ ] Each entry shows score
   - [ ] URLs are displayed (truncated if long)
   - [ ] Reasoning text shown
   - [ ] Red flags listed (if any)
   - [ ] Timestamp shown

#### Test 4.2: Stats Dashboard

1. **After various analyses, verify stats**:
   - [ ] Safe count matches number of safe verdicts
   - [ ] Suspicious count matches suspicious verdicts
   - [ ] Malicious count matches malicious verdicts
   - [ ] Numbers update after each analysis

#### Test 4.3: Clear History

1. **Click "Clear" button** (next to "Recent Analysis")
2. **Confirm the dialog**
3. **Verify**:
   - [ ] History list clears
   - [ ] Shows "No analysis history yet" message
   - [ ] Stats reset to 0/0/0

---

### Phase 5: Settings ✅

#### Test 5.1: Open Settings

1. **Click extension icon**
2. **Click ⚙️ Settings button** (top-right)
3. **Verify settings modal**:
   - [ ] Modal appears (overlay darkens background)
   - [ ] "Settings" header shown
   - [ ] API Endpoint input field visible
   - [ ] Current endpoint displayed (http://localhost:3000)
   - [ ] "Cancel" and "Save" buttons visible

#### Test 5.2: Change API Endpoint

1. **In settings modal, change endpoint**:
   ```
   Old: http://localhost:3000
   New: http://localhost:3001
   ```
2. **Click "Save"**
3. **Verify**:
   - [ ] Modal closes
   - [ ] Status changes to "Disconnected" (port 3001 not running)

4. **Open settings again**:
   - [ ] New endpoint saved (http://localhost:3001)

5. **Change back to correct endpoint**:
   ```
   http://localhost:3000
   ```
6. **Save and verify**:
   - [ ] Status returns to "Connected"

#### Test 5.3: Invalid Endpoint

1. **Open settings**
2. **Enter invalid URL**: `not-a-url`
3. **Click "Save"**
4. **Verify**:
   - [ ] Alert appears: "Invalid URL format"
   - [ ] Endpoint not saved
   - [ ] Modal stays open

---

### Phase 6: Error Handling ✅

#### Test 6.1: API Unavailable

1. **Stop API server** (Ctrl+C)
2. **Right-click a link and analyze**
3. **Verify error notification**:
   - [ ] Notification shows: "PhishLogic Error"
   - [ ] Message: "Failed to check URL: ..."
   - [ ] Error is descriptive

#### Test 6.2: Network Timeout

1. **With API running, analyze a URL**
2. **Quickly stop API mid-analysis**
3. **Verify**:
   - [ ] Error notification appears
   - [ ] No crash or freeze

#### Test 6.3: Invalid URL

1. **On a webpage, select invalid text**:
   ```
   This is not a URL at all
   ```
2. **Right-click → "Check for Phishing"**
3. **Verify**:
   - [ ] Error handled gracefully
   - [ ] Notification shows error (or no notification)
   - [ ] Extension doesn't crash

---

### Phase 7: Performance ✅

#### Test 7.1: Response Time

1. **Analyze multiple URLs**
2. **Measure time from click to notification**:
   - [ ] Safe URLs: < 2 seconds
   - [ ] Suspicious URLs: < 5 seconds
   - [ ] Malicious URLs: < 10 seconds

#### Test 7.2: Multiple Rapid Analyses

1. **Right-click multiple links rapidly** (5-10 links)
2. **Select "Check for Phishing" for each**
3. **Verify**:
   - [ ] All analyses complete
   - [ ] Notifications appear for each
   - [ ] History shows all analyses
   - [ ] No crashes or errors

#### Test 7.3: Memory Usage

1. **Analyze 20+ URLs**
2. **Check Chrome Task Manager**:
   - Chrome Menu → More Tools → Task Manager
   - Find "Extension: PhishLogic"
   - [ ] Memory usage < 50 MB
   - [ ] No memory leaks

---

### Phase 8: Edge Cases ✅

#### Test 8.1: Very Long URL

**Use URL**:
```
https://example.com/very-long-path?param1=value1&param2=value2&param3=value3&param4=value4&param5=value5&param6=value6
```

- [ ] Analysis completes successfully
- [ ] URL truncated in popup history
- [ ] Full URL visible on hover (title attribute)

#### Test 8.2: Special Characters in URL

**Use URL**:
```
https://example.com/path?query=<script>alert(1)</script>
```

- [ ] Analysis completes
- [ ] No XSS vulnerability
- [ ] URL displayed safely (escaped)

#### Test 8.3: Non-HTTP URLs

**Try analyzing**:
```
ftp://example.com
file:///path/to/file
javascript:alert(1)
```

- [ ] Extension handles gracefully
- [ ] Error message or rejection
- [ ] No security issues

---

### Phase 9: Cross-Browser Testing ✅

#### Firefox Testing

1. **Load extension in Firefox**:
   - Navigate to: `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json`

2. **Run all tests above in Firefox**:
   - [ ] Context menu works
   - [ ] Notifications appear
   - [ ] Popup functions correctly
   - [ ] Settings save

#### Edge Testing

1. **Load in Edge**:
   - Navigate to: `edge://extensions`
   - Enable Developer mode
   - Load unpacked → Select folder

2. **Run basic tests**:
   - [ ] Extension loads
   - [ ] Context menu works
   - [ ] Analysis completes

---

## Test Summary Template

After completing all tests, fill this out:

```
Browser Extension Test Results
Date: ___________
Tester: ___________

✅ Extension Installation: PASS / FAIL
✅ Context Menu: PASS / FAIL
✅ API Connection: PASS / FAIL
✅ URL Analysis (Safe): PASS / FAIL
✅ URL Analysis (Suspicious): PASS / FAIL
✅ Popup Display: PASS / FAIL
✅ History Tracking: PASS / FAIL
✅ Settings Modal: PASS / FAIL
✅ Error Handling: PASS / FAIL
✅ Performance: PASS / FAIL

Issues Found:
1. ___________
2. ___________

Overall: PASS / FAIL
```

---

## Quick Test Script

For rapid testing, use this sequence:

```bash
# Terminal 1: Start API
npm run dev

# Terminal 2: Quick API test
curl -X POST http://localhost:3000/api/v1/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://google.com"}'
```

**Then in Chrome**:
1. Load extension (chrome://extensions)
2. Open https://news.ycombinator.com
3. Right-click any link → "Check for Phishing"
4. Verify notification appears
5. Click extension icon → Verify history
6. Done! ✅

---

## Troubleshooting Common Issues

### Issue: Context Menu Not Appearing

**Fix**:
1. chrome://extensions → Reload extension
2. Refresh webpage
3. Try right-clicking again

### Issue: Notifications Not Showing

**Fix**:
1. Chrome Settings → Privacy and security → Site Settings → Notifications
2. Ensure Chrome can send notifications
3. Check system notification settings

### Issue: "Disconnected" Status

**Fix**:
1. Verify API is running: `curl http://localhost:3000/health`
2. Check extension settings: Correct API endpoint?
3. Check browser console for CORS errors

### Issue: Extension Won't Load

**Fix**:
1. Check for syntax errors in manifest.json
2. Look at error message in chrome://extensions
3. Verify all files exist (background.js, popup/, icons/)

### Issue: History Not Updating

**Fix**:
1. Open extension background console:
   - chrome://extensions → "Inspect views: service worker"
2. Check for errors in console
3. Verify chrome.storage.local is working:
   ```javascript
   chrome.storage.local.get(console.log)
   ```

---

## Debug Commands

**Check Extension Storage**:
```javascript
// In background service worker console:
chrome.storage.local.get(console.log)
chrome.storage.sync.get(console.log)
```

**Clear Extension Data**:
```javascript
chrome.storage.local.clear()
chrome.storage.sync.clear()
```

**Monitor API Calls**:
```javascript
// In background service worker console:
chrome.runtime.onMessage.addListener((msg) => console.log(msg))
```

---

## Next Steps After Testing

Once all tests pass:
1. ✅ Document any issues found
2. ✅ Fix critical bugs
3. ✅ Test fixes
4. ✅ Create proper extension icons
5. ✅ Prepare for production deployment

---

**Good luck with testing! 🚀**

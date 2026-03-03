# PhishLogic Gmail Add-on

Google Apps Script add-on for one-click phishing analysis in Gmail.

## Features

- ✅ **One-Click Analysis**: Click "🛡️ Analyze Email" button in Gmail sidebar
- ✅ **Instant Results**: Shows verdict (Safe/Suspicious/Malicious) with score and reasoning
- ✅ **Red Flags Display**: Lists specific phishing indicators found
- ✅ **Quick Actions**: Move suspicious emails to trash, report to security team
- ✅ **No Background Polling**: Analyzes only when requested (on-demand)

## Prerequisites

- **Google Account** (Gmail)
- **PhishLogic API** running (default: http://localhost:3000)
  - For testing: `npm run dev` in main PhishLogic directory
  - For production: Deploy API to HTTPS endpoint

## Installation (Private Deployment)

### Step 1: Create Apps Script Project

1. Open [Google Apps Script](https://script.google.com)
2. Click "+ New Project"
3. Name it "PhishLogic" (click "Untitled project" at top)

### Step 2: Add Files

**Add appsscript.json**:
1. In Apps Script editor, click ⚙️ (Project Settings) in left sidebar
2. Check "Show appsscript.json manifest file in editor"
3. Go back to Editor tab
4. Click `appsscript.json` in file list
5. Delete default content, paste content from `gmail-addon/appsscript.json`

**Add Code.gs**:
1. Click `Code.gs` in file list
2. Delete default content, paste content from `gmail-addon/Code.gs`

### Step 3: Configure API Endpoint

In `Code.gs`, update the API endpoint:

```javascript
// For localhost testing
const PHISHLOGIC_API = 'http://localhost:3000/api/v1/analyze/email';

// For production (HTTPS required for Gmail Add-ons)
const PHISHLOGIC_API = 'https://your-api-domain.com/api/v1/analyze/email';
```

### Step 4: Deploy as Test Add-on

1. Click "Deploy" button (top-right) → "Test deployments"
2. Click "Install"
3. Authorize permissions when prompted:
   - Read emails in Gmail (current message only)
   - Make external requests (to PhishLogic API)
4. Click "Done"

### Step 5: Use in Gmail

1. Open [Gmail](https://mail.google.com)
2. Open any email
3. PhishLogic sidebar appears on right side
4. Click "🛡️ Analyze Email" button
5. Wait 2-3 seconds for analysis result

## Usage

### Analyzing an Email

1. Open email in Gmail
2. PhishLogic sidebar shows on right
3. Click "🛡️ Analyze Email" button
4. Result card displays:
   - **Verdict**: Safe 🟢 / Suspicious 🟡 / Malicious 🔴
   - **Score**: 0-10 (higher = more suspicious)
   - **Reasoning**: Plain English explanation
   - **Red Flags**: Specific phishing indicators

### Taking Action

**For Malicious/Suspicious Emails**:
- Click "⚠️ Report Email" to notify security team
- Click "🗑️ Move to Trash" to delete email

**Re-analyze**:
- Click "🔄 Analyze Again" to re-run analysis

## Testing

### Test with Sample Emails

1. **Safe Email**: Send yourself an email from Gmail/trusted source
2. **Suspicious Email**: Email with bit.ly links, urgent language
3. **Malicious Email**: Use known phishing examples (PhishTank)

### Verify Features

- [ ] Add-on appears in Gmail sidebar
- [ ] "Analyze Email" button visible
- [ ] Analysis completes in <5 seconds
- [ ] Verdict displayed correctly (Safe/Suspicious/Malicious)
- [ ] Score shown (0-10)
- [ ] Reasoning text appears
- [ ] Red flags listed (if any)
- [ ] "Report Email" button works (for malicious)
- [ ] "Move to Trash" works
- [ ] "Analyze Again" re-runs analysis

## Deployment Options

### Option A: Private (For You Only) ✅ Current

- **Timeline**: Instant
- **Process**: "Test deployments" → Install
- **Visibility**: Only you can use
- **Best for**: MVP testing, personal use

### Option B: Organization-Wide

- **Timeline**: 1-2 days
- **Process**: Google Workspace Admin Console → Internal distribution
- **Visibility**: All users in your organization
- **Requires**: Google Workspace Admin account
- **Best for**: Company-wide deployment

### Option C: Public (Google Workspace Marketplace)

- **Timeline**: 2-4 weeks
- **Process**: OAuth verification + Google review
- **Visibility**: Public installation
- **Requires**: OAuth verification, privacy policy, terms of service
- **Best for**: Public distribution

## Troubleshooting

### "Analysis Failed" Error

**Check API Status**:
```bash
# Verify PhishLogic API is running
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy",...}
```

**Common Issues**:
1. **API not running**: Start with `npm run dev`
2. **Wrong endpoint**: Update `PHISHLOGIC_API` in Code.gs
3. **CORS error**: PhishLogic API must allow Apps Script origin
4. **Network error**: Localhost only works on same machine (use ngrok for testing)

### Add-on Not Appearing in Gmail

1. **Refresh Gmail**: Press F5 or Cmd+R
2. **Check Authorization**: Revoke and re-authorize in Apps Script
3. **Verify Deployment**: Apps Script → Deploy → Test deployments → Installed

### Permissions Error

If authorization fails:
1. Apps Script → ⚙️ Project Settings
2. Scroll to "OAuth Scopes"
3. Verify scopes match appsscript.json:
   - `gmail.addons.current.message.readonly`
   - `script.external_request`

## Development

### Debugging

**View Logs**:
1. Apps Script editor → Execution log (at bottom)
2. Or: View → Logs

**Test Function**:
1. Select `buildAddOn` function
2. Click "Run" (play button)
3. Check logs for errors

### Updating Code

After making changes to Code.gs:
1. Click "Save" (💾 icon)
2. No need to re-deploy for test installations
3. Refresh Gmail to see changes

### Testing Locally (Without Gmail)

Apps Script can be tested via debugger:
```javascript
function testAnalysis() {
  var mockEvent = {
    gmail: {
      messageId: 'test-message-id',
      accessToken: 'test-token'
    }
  };

  var result = analyzeCurrentEmail(mockEvent);
  Logger.log(result);
}
```

## Production Considerations

### HTTPS Requirement

Gmail Add-ons require HTTPS for external API calls:
- ❌ `http://localhost:3000` (only works for local testing)
- ✅ `https://your-api-domain.com` (required for production)

### API Quota

Google Apps Script quotas (per day):
- **UrlFetch calls**: 20,000
- **Email read quota**: 20,000
- On-demand analysis keeps quota usage low

### Security

- Add-on only accesses current email (not all emails)
- API requests made server-side (Apps Script)
- No email content stored on PhishLogic server

### Rate Limiting

PhishLogic API rate limits apply:
- Default: 100 requests/minute
- Adjust if needed for organization-wide deployment

## Files

```
gmail-addon/
├── appsscript.json    # Add-on configuration (OAuth scopes, triggers)
├── Code.gs            # Main Apps Script code (analysis, UI)
└── README.md          # This file
```

## API Integration

### Request Format

```javascript
POST /api/v1/analyze/email
Content-Type: application/json

{
  "rawEmail": "From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nEmail body..."
}
```

### Response Format

```json
{
  "verdict": "Safe",
  "score": 2,
  "reasoning": "This email appears safe...",
  "redFlags": [
    {
      "message": "Sender domain age < 30 days",
      "severity": "medium"
    }
  ],
  "metadata": {
    "duration": 245,
    "analyzersRun": ["SPF", "DKIM", "URLAnalyzer"]
  }
}
```

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/PhishLogic/issues
- Docs: docs/GMAIL_ADDON_SETUP.md

## License

See main PhishLogic LICENSE file.

# PhishLogic Browser Extension

Chrome/Firefox extension for right-click phishing detection.

## Features

- ✅ **Context Menu Integration**: Right-click any link → "Check for Phishing with PhishLogic"
- ✅ **Instant Notifications**: Shows verdict (Safe/Suspicious/Malicious) with score
- ✅ **Analysis History**: Popup shows last 50 analyses with reasoning and red flags
- ✅ **Configurable API Endpoint**: Switch between localhost and production API
- ✅ **Connection Status**: Visual indicator shows API connection health

## Installation

### Chrome (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `browser-extension/` directory

### Firefox (Temporary Add-on)

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `browser-extension/manifest.json`

### Edge (Developer Mode)

1. Open Edge and navigate to `edge://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `browser-extension/` directory

## Prerequisites

- **PhishLogic API** must be running (default: http://localhost:3000)
- Run `npm run dev` in the main PhishLogic directory to start the API

## Usage

### Basic Usage

1. Right-click any link on a webpage
2. Select "Check for Phishing with PhishLogic"
3. Wait for notification with analysis result

### View History

1. Click the PhishLogic extension icon in the toolbar
2. Popup shows:
   - Connection status (green = connected, red = disconnected)
   - Stats (Safe/Suspicious/Malicious counts)
   - Recent analysis history (last 10)

### Configure API Endpoint

1. Click extension icon → ⚙️ Settings button
2. Update API endpoint URL
3. Click "Save"

## Testing

### Test with Real URLs

```bash
# Start PhishLogic API
cd PhishLogic
npm run dev

# Load extension in Chrome
# Right-click links to test:
# - Safe: https://google.com
# - Suspicious: https://bit.ly/shortened-url
# - Malicious: (use known phishing URLs from PhishTank)
```

### Verify Features

- [ ] Context menu appears on right-click
- [ ] Notification shows verdict and score
- [ ] History updates in popup
- [ ] Stats calculated correctly
- [ ] Settings modal saves API endpoint
- [ ] Connection status indicator works

## File Structure

```
browser-extension/
├── manifest.json          # Manifest V3 configuration
├── background.js          # Service worker (context menu, API calls)
├── popup/
│   ├── popup.html         # Popup UI structure
│   ├── popup.js           # Popup logic (history, settings)
│   └── popup.css          # Popup styling
├── icons/                 # Extension icons (16, 48, 128px)
│   └── README.md          # Icon creation guide
└── README.md              # This file
```

## Configuration

### Default Settings

- **API Endpoint**: http://localhost:3000
- **History Limit**: 50 entries
- **Notification Priority**: Malicious (high), Suspicious/Safe (normal)

### Changing API Endpoint

**Via Popup**:
1. Click extension icon → ⚙️ Settings
2. Enter production URL: `https://your-api-domain.com`
3. Save

**Via Chrome Storage** (console):
```javascript
chrome.storage.sync.set({ apiEndpoint: 'https://your-api-domain.com' });
```

## Troubleshooting

### "Disconnected" Status

- Verify PhishLogic API is running (`npm run dev`)
- Check API endpoint in settings (default: http://localhost:3000)
- Ensure CORS is configured to allow extension origin

### Context Menu Not Appearing

- Reload the extension: `chrome://extensions` → Reload button
- Check browser console for errors (F12 → Console)

### Notifications Not Showing

- Check browser notification permissions
- Chrome: Settings → Privacy and security → Site Settings → Notifications

## Development

### Debugging

**Background Script**:
1. Go to `chrome://extensions`
2. Click "Inspect views: background page"

**Popup Script**:
1. Right-click extension icon → Inspect
2. Opens DevTools for popup

### Hot Reload

Chrome does not support hot reload for extensions. After code changes:
1. Go to `chrome://extensions`
2. Click the reload icon for PhishLogic extension

## Production Deployment

### Chrome Web Store

1. Create ZIP: `zip -r phishlogic-extension.zip browser-extension/`
2. Submit to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Review process: 1-3 days

### Firefox Add-ons

1. Create ZIP: `zip -r phishlogic-extension.zip browser-extension/`
2. Submit to [addons.mozilla.org](https://addons.mozilla.org/developers/)
3. Review process: ~7 days

### Update manifest.json

Before production deployment:
1. Update `version` (e.g., "1.0.0" → "1.0.1")
2. Add production API domain to `host_permissions`
3. Add proper extension icons (see `icons/README.md`)

## Security Considerations

- Extension only requests necessary permissions: `contextMenus`, `notifications`, `storage`
- No browsing history or tab content access
- API calls only for user-initiated analysis (right-click)
- No background data collection

## License

See main PhishLogic LICENSE file.

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/PhishLogic/issues
- Docs: docs/BROWSER_EXTENSION.md

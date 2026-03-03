# Implementation Plan: Browser Extension + Gmail Integration for PhishLogic

## Context

**Current State**: PhishLogic currently supports **only direct API access** via:
- `POST /api/v1/analyze/url` - Raw URL analysis
- `POST /api/v1/analyze/email` - Raw MIME email analysis

**User Requirement**: Implement 2 production-ready, demoable integrations:

1. **Browser Extension** - Chrome/Firefox extension enabling users to right-click any link and check for phishing
2. **Gmail Integration** - Gmail Add-on with "Analyze Email" button for on-demand phishing analysis

**Why This Matters**:
- The browser extension provides instant phishing detection for any web page, protecting users at browsing time
- Gmail Add-on gives users one-click email analysis directly in Gmail UI, with instant feedback
- Both integrations leverage the existing PhishLogic analysis engine (6 analyzers, 0-10 scoring, plain English red flags)

**Implementation Approach**:
- **Browser Extension**: Manifest V3 extension with context menu integration calling existing `/api/v1/analyze/url` endpoint
- **Gmail Add-on**: Google Apps Script-based add-on with sidebar button calling `/api/v1/analyze/email` endpoint

**Why Button Approach (Not Polling)**:
- ✅ **Simpler**: No background polling service, no token refresh, no continuous process
- ✅ **User Control**: Users choose which emails to analyze
- ✅ **Lower Server Load**: Analyzes only on request (not every 60 seconds)
- ✅ **Instant Deployment**: Private add-on deployable immediately (no Google Marketplace approval for MVP)
- ✅ **Better Demo**: Click button → see result immediately

**Timeline**: 5-6 days for both integrations, fully tested and documented

---

## Documentation Reorganization Strategy

**Problem**: Current CLAUDE.md is 412 lines - too large for efficient context loading and quick reference

**Solution**: Split into focused topic files in `docs/development/`:
- Better context management (Claude can load specific topics)
- Faster reference lookups (developers find info quickly)
- Preserved plans in `docs/plans/` (implementation history)
- Reusable skills in `.claude/skills/` (consistent patterns)

**Benefits**:
- ✅ Reduced token usage (load only relevant docs)
- ✅ Better maintainability (update specific topics)
- ✅ Improved onboarding (clear structure)
- ✅ Consistent patterns (skills file ensures uniformity)
- ✅ Historical context (plans preserved for future reference)

---

## Existing Architecture (Reuse)

PhishLogic follows **Clean Architecture** with clear separation:
- **API Layer** (`src/api/`): Fastify controllers and routes
- **Core Domain** (`src/core/`): Analysis engine + 6 analyzers (4 static, 2 dynamic)
- **Adapters** (`src/adapters/input/`): Input transformation via `InputAdapter<T>` interface
- **Infrastructure** (`src/infrastructure/`): Logging, email alerts

**Key Files to Leverage**:
- `src/adapters/input/raw.adapter.ts` - RawEmailAdapter (MIME parsing with mailparser)
- `src/api/controllers/analysis.controller.ts` - analyzeEmail() pattern to follow
- `src/core/engine/analysis.engine.ts` - Main analysis orchestration
- `src/config/app.config.ts` - Configuration management with Zod

**Existing Pattern**:
```
Input → Adapter.validate() → Adapter.adapt() → AnalysisEngine.analyze() → Verdict Result
```

---

## Implementation Plan

### Phase 1: Browser Extension (2 days)

**Goal**: Chrome/Firefox extension enabling right-click URL checking with instant phishing verdict

#### 1.1 Extension Structure
**New Directory**: `browser-extension/`

```
browser-extension/
├── manifest.json          # Manifest V3 configuration
├── background.js          # Service worker for context menu
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Settings and history
│   └── popup.css          # Styling
└── icons/
    ├── icon16.png         # Toolbar icon
    ├── icon48.png         # Extension manager
    └── icon128.png        # Chrome Web Store
```

#### 1.2 Manifest Configuration
**File**: `browser-extension/manifest.json`

```json
{
  "manifest_version": 3,
  "name": "PhishLogic - Phishing Detector",
  "version": "1.0.0",
  "description": "Right-click any link to check for phishing threats",
  "permissions": ["contextMenus", "notifications", "storage"],
  "host_permissions": ["http://localhost:3000/*", "https://your-api-domain.com/*"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

#### 1.3 Context Menu Integration
**File**: `browser-extension/background.js`

```javascript
// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "checkPhishing",
    title: "Check for Phishing with PhishLogic",
    contexts: ["link", "selection"]
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "checkPhishing") {
    const url = info.linkUrl || info.selectionText;

    try {
      // Get API endpoint from storage (default: localhost)
      const { apiEndpoint = 'http://localhost:3000' } =
        await chrome.storage.sync.get('apiEndpoint');

      // Call PhishLogic API
      const response = await fetch(`${apiEndpoint}/api/v1/analyze/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const result = await response.json();

      // Show notification with verdict
      const icon = result.verdict === 'Malicious' ? '🔴' :
                   result.verdict === 'Suspicious' ? '🟡' : '🟢';

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: `${icon} PhishLogic: ${result.verdict}`,
        message: `Score: ${result.score}/10\n${result.reasoning}`,
        priority: result.verdict === 'Malicious' ? 2 : 1
      });

      // Store in history
      chrome.storage.local.get(['history'], (data) => {
        const history = data.history || [];
        history.unshift({
          url,
          verdict: result.verdict,
          score: result.score,
          timestamp: new Date().toISOString()
        });
        chrome.storage.local.set({ history: history.slice(0, 50) });
      });

    } catch (error) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'PhishLogic Error',
        message: `Failed to check URL: ${error.message}`
      });
    }
  }
});
```

#### 1.4 Popup UI
**File**: `browser-extension/popup/popup.html`

Simple interface showing:
- API connection status (green/red indicator)
- Recent analysis history (last 10 URLs checked)
- Settings button to configure API endpoint
- Quick stats (total checks, malicious/suspicious/safe counts)

**File**: `browser-extension/popup/popup.js`
- Loads history from chrome.storage.local
- Displays in scrollable list
- Allows clearing history
- Settings modal for API endpoint configuration

**No PhishLogic adapter needed** - Extension calls existing `/api/v1/analyze/url` endpoint directly.

---

### Phase 2: Gmail Add-on with Button (2-3 days)

**Goal**: Gmail Add-on with "Analyze Email" button for on-demand phishing analysis

**Why Button Approach**:
- ✅ Simpler than polling (no background service, no token management)
- ✅ User control (analyze only suspicious emails)
- ✅ Instant feedback (click → result immediately)
- ✅ Can deploy privately to your organization instantly (no Google Marketplace approval)

#### 2.1 Gmail Add-on Structure
**New Directory**: `gmail-addon/`

```
gmail-addon/
├── appsscript.json      # Add-on configuration
├── Code.gs              # Main Apps Script code
├── Sidebar.html         # UI for analysis results
└── README.md            # Installation instructions
```

#### 2.2 Add-on Configuration
**File**: `gmail-addon/appsscript.json`

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
    "logoUrl": "https://your-domain.com/logo.png",
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

#### 2.3 Apps Script Implementation
**File**: `gmail-addon/Code.gs`

```javascript
// PhishLogic API endpoint
const PHISHLOGIC_API = 'http://localhost:3000/api/v1/analyze/email';
// For production: 'https://your-domain.com/api/v1/analyze/email'

/**
 * Build Gmail Add-on UI (sidebar)
 */
function buildAddOn(e) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('PhishLogic')
      .setSubtitle('Phishing Detection'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText('Click the button below to analyze this email for phishing threats.'))
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Analyze Email')
          .setOnClickAction(CardService.newAction()
            .setFunctionName('analyzeCurrentEmail')))))
    .build();

  return [card];
}

/**
 * Analyze current email when user clicks button
 */
function analyzeCurrentEmail(e) {
  try {
    // Get current email
    const messageId = e.gmail.messageId;
    const accessToken = e.gmail.accessToken;

    const message = GmailApp.getMessageById(messageId);

    // Extract email content
    const emailData = {
      from: message.getFrom(),
      to: message.getTo(),
      subject: message.getSubject(),
      body: message.getPlainBody(),
      date: message.getDate().toISOString()
    };

    // Convert to raw email format (MIME)
    const rawEmail = buildRawEmail(emailData);

    // Call PhishLogic API
    const response = UrlFetchApp.fetch(PHISHLOGIC_API, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ rawEmail: rawEmail }),
      muteHttpExceptions: true
    });

    const result = JSON.parse(response.getContentText());

    // Build result card
    return buildResultCard(result);

  } catch (error) {
    return buildErrorCard(error.toString());
  }
}

/**
 * Build MIME format email from Gmail message data
 */
function buildRawEmail(emailData) {
  return `From: ${emailData.from}
To: ${emailData.to}
Subject: ${emailData.subject}
Date: ${emailData.date}
Content-Type: text/plain; charset=UTF-8

${emailData.body}`;
}

/**
 * Display analysis result in sidebar
 */
function buildResultCard(result) {
  const verdict = result.verdict;
  const score = result.score;
  const reasoning = result.reasoning;
  const redFlags = result.redFlags || [];

  // Color based on verdict
  const icon = verdict === 'Malicious' ? 'https://your-domain.com/icon-red.png' :
               verdict === 'Suspicious' ? 'https://your-domain.com/icon-yellow.png' :
               'https://your-domain.com/icon-green.png';

  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle(`Verdict: ${verdict}`)
      .setSubtitle(`Score: ${score}/10`)
      .setImageUrl(icon))
    .addSection(CardService.newCardSection()
      .setHeader('Analysis')
      .addWidget(CardService.newTextParagraph()
        .setText(`<b>Reasoning:</b><br>${reasoning}`)));

  // Add red flags section if any
  if (redFlags.length > 0) {
    let flagsText = '<b>Red Flags:</b><br>';
    redFlags.forEach(flag => {
      flagsText += `• ${flag.message}<br>`;
    });

    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText(flagsText)));
  }

  // Add action button
  if (verdict === 'Malicious' || verdict === 'Suspicious') {
    card.addSection(CardService.newCardSection()
      .addWidget(CardService.newButtonSet()
        .addButton(CardService.newTextButton()
          .setText('Report Email')
          .setOpenLink(CardService.newOpenLink()
            .setUrl('mailto:security@company.com?subject=Phishing%20Report')))));
  }

  return card.build();
}

/**
 * Display error message
 */
function buildErrorCard(errorMessage) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('Analysis Failed'))
    .addSection(CardService.newCardSection()
      .addWidget(CardService.newTextParagraph()
        .setText(`Error: ${errorMessage}`))
      .addWidget(CardService.newTextParagraph()
        .setText('Please check that the PhishLogic API is running.')))
    .build();

  return card;
}
```

#### 2.4 Deployment Options

**Option A: Private Deployment (Instant, No Approval)**

1. Open [Google Apps Script](https://script.google.com)
2. Create new project → paste Code.gs and appsscript.json
3. Click "Deploy" → "Test deployments"
4. Install add-on → appears in Gmail sidebar

**Option B: Organization-Wide (Admin Deployment)**

1. Google Workspace Admin Console
2. Apps → Google Workspace Marketplace Apps
3. Upload add-on (internal distribution)
4. All users in organization can install

**Option C: Public (Google Marketplace - 2-4 weeks review)**

1. Complete OAuth verification
2. Submit to Google Workspace Marketplace
3. Wait for review approval
4. Public installation available

**For MVP**: Use Option A (private deployment) for immediate testing

---

### Phase 3: Testing (1 day)

#### 3.1 Gmail Add-on Testing

**Manual Test Cases**:
1. Deploy Gmail Add-on to test account
2. Open email in Gmail → PhishLogic sidebar appears
3. Click "Analyze Email" button
4. Verify API call to PhishLogic backend
5. Result card displays with verdict (Safe/Suspicious/Malicious)
6. Test with known phishing email → score 7+, red flags displayed
7. Test with safe email → score <4, clean result
8. Test API unavailable scenario → error message displayed
9. Verify "Report Email" button appears for malicious emails

**No Unit Tests Needed** - Apps Script runs in Google's cloud environment

#### 3.2 Browser Extension Testing

**Manual Test Cases**:
1. Load extension in Chrome dev mode (`chrome://extensions`)
2. Right-click link on webpage → "Check for Phishing with PhishLogic" appears
3. Click menu item → notification shows verdict
4. Check extension popup → history shows recent analysis
5. Test with malicious URL (e.g., `https://bit.ly/xyz123`) → score 7+
6. Test with safe URL (e.g., `https://google.com`) → score <4
7. Configure custom API endpoint in settings → verify API calls use new endpoint

**Cross-browser Testing**:
- Chrome: Manifest V3 full support
- Firefox: Test with same manifest (compatible)
- Edge: Chromium-based, same as Chrome

#### 3.3 Integration Testing
**Update**: `tests/integration/api/analysis.test.ts`

Verify existing tests still pass with new infrastructure:
- All 56 tests should still pass
- Add Gmail OAuth route tests
- Verify no regressions

---

### Phase 4: Documentation & Project Organization (1 day)

#### 4.0 Save Implementation Plan
**New File**: `docs/plans/BROWSER_GMAIL_INTEGRATION_PLAN.md`

Copy the complete implementation plan from `.claude/plans/` to project docs for future reference:
- Full implementation details
- Architecture decisions
- Timeline and verification checklists
- Comparison tables (button vs polling)

#### 4.1 Reorganize CLAUDE.md
**Goal**: Split large CLAUDE.md into focused, topic-specific files for better context management

**Current Issue**: CLAUDE.md is 412 lines - too large for quick reference

**New Structure**:
```
docs/
├── development/
│   ├── ARCHITECTURE.md           # Architecture principles, layers, patterns
│   ├── CODING_STANDARDS.md       # TypeScript conventions, naming, imports
│   ├── TESTING_GUIDE.md          # Testing standards, patterns, examples
│   ├── ERROR_HANDLING.md         # Error patterns, async handling
│   ├── SECURITY.md               # Security best practices, sandboxing
│   └── DEPLOYMENT.md             # Production deployment checklist
└── plans/
    └── BROWSER_GMAIL_INTEGRATION_PLAN.md  # This implementation plan
```

**Update CLAUDE.md** to become a table of contents:
```markdown
# PhishLogic Development Guide

This is the central reference for PhishLogic development standards.

## Quick Links
- [Architecture Principles](docs/development/ARCHITECTURE.md)
- [Coding Standards](docs/development/CODING_STANDARDS.md)
- [Testing Guide](docs/development/TESTING_GUIDE.md)
- [Error Handling](docs/development/ERROR_HANDLING.md)
- [Security Guidelines](docs/development/SECURITY.md)
- [Deployment Guide](docs/development/DEPLOYMENT.md)

## Implementation Plans
- [Browser Extension + Gmail Integration](docs/plans/BROWSER_GMAIL_INTEGRATION_PLAN.md)

## Project Overview
[Brief 2-3 paragraph summary of PhishLogic]
```

#### 4.2 Create Skills File
**New File**: `.claude/skills/phishlogic-integration.md`

Create reusable skill for integration pattern:

```markdown
---
name: phishlogic-integration
description: Add new integration (browser extension, email platform, etc.) to PhishLogic
version: 1.0.0
---

# PhishLogic Integration Pattern

## When to Use
Adding a new platform integration to PhishLogic (Gmail, Outlook, browser extension, social media, etc.)

## Integration Checklist

### 1. Determine Integration Type
- **Direct API**: Calls existing `/api/v1/analyze/url` or `/api/v1/analyze/email`
- **Adapter Pattern**: Requires new InputAdapter implementation
- **External Service**: Requires OAuth or API authentication

### 2. Implementation Steps

#### For Direct API Integrations (Browser Extension, Gmail Add-on)
1. No backend changes needed ✅
2. Create client-side code (extension, Apps Script, etc.)
3. Call existing PhishLogic API endpoint
4. Display result in platform UI

#### For Adapter Pattern Integrations (Outlook, Social Media)
1. Create adapter in `src/adapters/input/[platform].adapter.ts`
2. Implement `InputAdapter<T>` interface
3. Create controller in `src/api/controllers/[platform].controller.ts`
4. Add routes in `src/api/routes/index.ts`
5. Add configuration in `src/config/app.config.ts`
6. Write tests in `tests/integration/api/[platform].test.ts`

### 3. Documentation
- Setup guide in `docs/[PLATFORM]_SETUP.md`
- Update README.md with integration section
- Add implementation plan to `docs/plans/`

### 4. Verification
- [ ] Integration calls PhishLogic API successfully
- [ ] Results displayed in platform UI
- [ ] Error handling works
- [ ] Documentation complete
- [ ] Tests passing (if applicable)

## Examples
- Browser Extension: Direct API (no adapter)
- Gmail Add-on: Direct API (no adapter)
- Outlook Integration: Adapter pattern (OAuth + Graph API)
- LinkedIn Integration: Adapter pattern (OAuth + LinkedIn API)
```

#### 4.3 Gmail Add-on Setup Guide
**New File**: `docs/GMAIL_ADDON_SETUP.md`

```markdown
# Gmail Add-on Setup

## Prerequisites
- Google Account
- PhishLogic API running (http://localhost:3000)

## Installation (Private Deployment)

### Step 1: Create Apps Script Project
1. Open [Google Apps Script](https://script.google.com)
2. Click "New Project"
3. Name it "PhishLogic"

### Step 2: Add Code
1. Delete default Code.gs content
2. Copy contents from `gmail-addon/Code.gs`
3. Paste into Apps Script editor

### Step 3: Add Configuration
1. Click ⚙️ (Project Settings)
2. Click "Add a script property"
3. Set `PHISHLOGIC_API` to your API endpoint
4. Add `appsscript.json` manifest (click "appsscript.json" in left sidebar)

### Step 4: Deploy
1. Click "Deploy" → "Test deployments"
2. Click "Install"
3. Authorize permissions when prompted

### Step 5: Use in Gmail
1. Open Gmail
2. Open any email
3. PhishLogic sidebar appears on right
4. Click "Analyze Email" button
5. View analysis result

## Configuration
- Update `PHISHLOGIC_API` constant in Code.gs for production URL
- For production deployment, see [Google Workspace Marketplace Guide]
```

#### 4.2 Browser Extension Guide
**New File**: `docs/BROWSER_EXTENSION.md`

```markdown
# PhishLogic Browser Extension

## Installation (Chrome)
1. Clone repository
2. Open chrome://extensions
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select browser-extension/ directory

## Installation (Firefox)
1. Open about:debugging
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select browser-extension/manifest.json

## Usage
1. Right-click any link
2. Select "Check for Phishing with PhishLogic"
3. Notification shows verdict and score

## Configuration
1. Click extension icon
2. Click "Settings"
3. Enter API endpoint (default: http://localhost:3000)
```

#### 4.3 Update README
**Update Section**: `README.md`

Add sections after "Quick Start":
```markdown
## 🔌 Integrations

### Browser Extension
Right-click any link in your browser to instantly check for phishing. See [Browser Extension Guide](docs/BROWSER_EXTENSION.md).

**Features**:
- Context menu integration (right-click → "Check for Phishing")
- Instant notification with verdict and score
- Analysis history in popup
- Works in Chrome, Firefox, Edge

### Gmail Add-on
Click a button in Gmail to analyze emails for phishing. See [Gmail Add-on Setup Guide](docs/GMAIL_ADDON_SETUP.md).

**Features**:
- One-click analysis from Gmail sidebar
- Instant results displayed in Gmail UI
- Red flags and reasoning shown
- Report malicious emails directly
- No background processes or polling

**Supported Integrations**:
- ✅ Browser Extension (Chrome/Firefox/Edge)
- ✅ Gmail Add-on (Google Apps Script)
- 🚧 Outlook Add-in (Coming soon)
- 🚧 Social Media (Coming soon)
```

---

## Dependencies to Add

**No additional dependencies needed** ✅

Gmail Add-on uses Google Apps Script (cloud-based, no local dependencies).
Browser extension uses standard browser APIs.
PhishLogic backend already has all necessary dependencies.

---

## Critical Files Summary

### New Files (21 total)

**Gmail Add-on** (Google Apps Script - no local files):
1. `gmail-addon/appsscript.json` - Add-on configuration
2. `gmail-addon/Code.gs` - Apps Script implementation
3. `gmail-addon/README.md` - Installation instructions

**Browser Extension**:
4. `browser-extension/manifest.json` - Extension configuration
5. `browser-extension/background.js` - Service worker
6. `browser-extension/popup/popup.html` - Popup UI
7. `browser-extension/popup/popup.js` - Popup logic
8. `browser-extension/popup/popup.css` - Styling

**Documentation - User Guides**:
9. `docs/GMAIL_ADDON_SETUP.md` - Gmail Add-on setup guide
10. `docs/BROWSER_EXTENSION.md` - Extension installation guide

**Documentation - Development (NEW)**:
11. `docs/development/ARCHITECTURE.md` - Architecture principles (from CLAUDE.md)
12. `docs/development/CODING_STANDARDS.md` - TypeScript conventions (from CLAUDE.md)
13. `docs/development/TESTING_GUIDE.md` - Testing patterns (from CLAUDE.md)
14. `docs/development/ERROR_HANDLING.md` - Error handling standards (from CLAUDE.md)
15. `docs/development/SECURITY.md` - Security best practices (from CLAUDE.md)
16. `docs/development/DEPLOYMENT.md` - Production deployment (from CLAUDE.md)

**Documentation - Plans (NEW)**:
17. `docs/plans/BROWSER_GMAIL_INTEGRATION_PLAN.md` - This implementation plan (preserved for future reference)

**Skills (NEW)**:
18. `.claude/skills/phishlogic-integration.md` - Reusable integration pattern skill

**Modified Files** (2 total):
19. `README.md` - Add integration sections
20. `CLAUDE.md` - Convert to table of contents linking to docs/development/

**No Backend Changes Needed** ✅ - Gmail Add-on calls existing `/api/v1/analyze/email` endpoint

---

## Implementation Timeline (4-5 days)

### Day 1-2: Browser Extension
- Create extension structure (manifest, background, popup)
- Implement context menu + notifications
- Build popup UI with history
- Manual testing in Chrome/Firefox/Edge

### Day 3: Gmail Add-on
- Create Apps Script project
- Implement button + sidebar UI
- Call PhishLogic API endpoint
- Test with real Gmail emails
- Deploy as private add-on

### Day 4: Integration & Testing
- Integration testing (browser extension + Gmail add-on)
- Fix any bugs
- Cross-browser extension testing
- Test with various email types (safe, suspicious, malicious)

### Day 5: Documentation & Project Organization
- **Save implementation plan** to docs/plans/ for future reference
- **Reorganize CLAUDE.md** into focused docs/development/ files
- **Create skills file** for integration pattern (.claude/skills/)
- Write setup guides (GMAIL_ADDON_SETUP.md, BROWSER_EXTENSION.md)
- Update README with integration sections
- Create demo video/screenshots
- Production readiness check

---

## Verification Checklist

### Browser Extension ✓
- [ ] Extension loads in Chrome without errors
- [ ] Extension loads in Firefox without errors
- [ ] Context menu "Check for Phishing" appears on right-click
- [ ] Clicking menu item sends request to PhishLogic API
- [ ] Notification displays with verdict (Safe/Suspicious/Malicious)
- [ ] Notification shows score (0-10) and reasoning
- [ ] Popup shows recent analysis history (last 10)
- [ ] Popup allows configuring API endpoint
- [ ] Settings persist across browser sessions
- [ ] History clears when button clicked

### Gmail Add-on ✓
- [ ] Add-on deploys successfully to test account
- [ ] Add-on appears in Gmail sidebar when opening email
- [ ] "Analyze Email" button is visible
- [ ] Clicking button triggers API call to PhishLogic
- [ ] Email content extracted correctly (from, to, subject, body)
- [ ] API endpoint receives email data in correct format
- [ ] Analysis completes and returns result
- [ ] Result card displays in Gmail sidebar
- [ ] Verdict shown clearly (Safe/Suspicious/Malicious)
- [ ] Score displayed (0-10)
- [ ] Reasoning text appears
- [ ] Red flags listed (if any)
- [ ] "Report Email" button appears for malicious emails
- [ ] Error handling works when API unavailable
- [ ] Works across different email types (plain text, HTML)

### Integration Testing ✓
- [ ] All existing 56 tests still pass
- [ ] Browser extension connects to local API (localhost:3000)
- [ ] Browser extension connects to production API
- [ ] Gmail Add-on connects to local API (localhost:3000)
- [ ] Gmail Add-on connects to production API
- [ ] End-to-end: Email analyzed → result displayed in Gmail
- [ ] End-to-end: URL analyzed → notification displayed in browser

### Security ✓
- [ ] Gmail Add-on only requests necessary scopes (current message readonly, external requests)
- [ ] No email data stored on PhishLogic server
- [ ] Extension only requests necessary permissions (contextMenus, notifications, storage)
- [ ] API CORS configured for extension origin
- [ ] No sensitive data logged
- [ ] HTTPS enforced for production API

### Documentation ✓
- [ ] GMAIL_ADDON_SETUP.md complete with step-by-step instructions
- [ ] BROWSER_EXTENSION.md complete with installation guide
- [ ] README.md updated with integration sections
- [ ] Apps Script code well-commented
- [ ] Screenshots/demo video created

### Project Organization ✓
- [ ] Implementation plan saved to docs/plans/BROWSER_GMAIL_INTEGRATION_PLAN.md
- [ ] CLAUDE.md reorganized into focused files
- [ ] docs/development/ARCHITECTURE.md created
- [ ] docs/development/CODING_STANDARDS.md created
- [ ] docs/development/TESTING_GUIDE.md created
- [ ] docs/development/ERROR_HANDLING.md created
- [ ] docs/development/SECURITY.md created
- [ ] docs/development/DEPLOYMENT.md created
- [ ] .claude/skills/phishlogic-integration.md created
- [ ] CLAUDE.md updated to table of contents format

---

## Production Deployment Considerations

### Gmail Add-on
1. **Private Deployment (Instant)**:
   - Deploy via Google Apps Script "Test deployments"
   - Only you can install (perfect for MVP demo)
   - No approval needed

2. **Organization Deployment** (1-2 days):
   - Google Workspace Admin Console
   - Internal distribution to organization users
   - No Google approval needed

3. **Public Deployment** (2-4 weeks):
   - Submit to Google Workspace Marketplace
   - OAuth verification required
   - Google reviews add-on
   - Public installation available after approval

### Browser Extension
1. **Chrome Web Store**:
   - Package extension: `zip -r phishlogic-extension.zip browser-extension/`
   - Submit to Chrome Web Store
   - Review process: 1-3 days

2. **Firefox Add-ons**:
   - Submit to addons.mozilla.org
   - Review process: ~7 days

3. **Production API**:
   - Update manifest.json host_permissions to production domain
   - Configure CORS on production API

### Infrastructure
- **HTTPS Required**: Production API should use HTTPS
- **Server Uptime**: API should be reliable for on-demand analysis
- **No Database Needed**: Gmail Add-on is stateless (no token storage)
- **Monitoring**: Track API errors, analysis success rate, response times
- **CORS**: Configure CORS to allow requests from Apps Script and browser extension

---

## Success Criteria

✅ **Browser Extension Working**:
- Right-click any link → PhishLogic checks it
- Notification shows verdict instantly (<2 seconds)
- Works in Chrome, Firefox, and Edge

✅ **Gmail Add-on Working**:
- Add-on appears in Gmail sidebar
- User clicks "Analyze Email" button
- Analysis result displays immediately in Gmail UI
- Works with plain text and HTML emails

✅ **Production Ready**:
- All existing 56 tests still passing
- Documentation complete with screenshots
- Security best practices followed
- Demo ready to present

✅ **User Experience**:
- Browser extension: <2 seconds from right-click to notification
- Gmail Add-on: <3 seconds from button click to result display
- Clear error messages if API unavailable
- Intuitive UI in both integrations

---

## Estimated Effort

| Task | Days | Details |
|------|------|---------|
| Browser Extension | 2 | Manifest, background script, popup UI, testing |
| Gmail Add-on | 1 | Apps Script code, sidebar UI, API integration |
| Testing | 1 | Integration tests, manual testing, bug fixes |
| Documentation | 1 | Setup guides, README updates, screenshots |
| **Total** | **4-5 days** | ✅ Faster than polling approach (no backend complexity) |

---

## Risk Mitigation

### Risk 1: Apps Script API Quota
**Mitigation**:
- Apps Script allows 20,000 URL Fetch calls/day (sufficient for MVP)
- On-demand analysis (not continuous polling) keeps quota usage low
- Monitor quota in Google Cloud Console

### Risk 2: CORS Issues
**Mitigation**:
- Configure PhishLogic API CORS to allow Apps Script origin
- Test with localhost first, then production domain
- Add proper headers in Fastify CORS config

### Risk 3: Browser Extension Review Delays
**Mitigation**:
- Start Chrome Web Store submission early
- Use "Load unpacked" for demo
- Provide manual installation guide

### Risk 4: Gmail Add-on Permissions
**Mitigation**:
- Request minimal scopes (current message readonly, external requests)
- Clear permission explanations in setup guide
- Private deployment for MVP (no approval needed)

---

## Next Steps After Implementation

1. **Deploy to Production**:
   - Set up production server with HTTPS
   - Configure Google Cloud production credentials
   - Submit browser extension to stores
   - Deploy Gmail Add-on to organization (if needed)

2. **Documentation Benefits** (from reorganization):
   - ✅ Better context management (smaller, focused files)
   - ✅ Faster reference lookups (topic-specific docs)
   - ✅ Preserved implementation plans (docs/plans/)
   - ✅ Reusable integration pattern (skills file)
   - ✅ Easier onboarding for new developers

3. **Additional Features**:
   - Gmail: Send email alerts for malicious detections
   - Extension: Automatic URL checking (scan all links on page)
   - Dashboard: Web UI to view analysis history

4. **Future Integrations** (use phishlogic-integration skill):
   - Outlook/Microsoft 365 (adapter pattern)
   - Social media platforms (LinkedIn, WhatsApp, Instagram, X)
   - Mobile apps (iOS/Android)

---

## Gmail Add-on vs Backend Polling Comparison

| Aspect | Gmail Add-on (Button) ✅ | Backend Polling |
|--------|--------------------------|-----------------|
| **Complexity** | Simple (Apps Script only) | Complex (Node.js service + OAuth) |
| **Timeline** | 4-5 days | 7-9 days |
| **Backend Changes** | None (reuses existing API) | Token storage, polling service, OAuth |
| **User Experience** | Click button → instant result | Automatic (no action needed) |
| **Server Load** | On-demand only | Continuous (every 60 seconds) |
| **Dependencies** | None | googleapis, token storage |
| **Deployment** | Instant (private add-on) | Requires server deployment |
| **Maintenance** | Minimal | Token refresh, polling state |
| **API Quota** | Per-use only | Continuous API calls |
| **MVP Suitability** | ✅ Perfect for demo | Overkill for MVP |

**Recommendation**: Use Gmail Add-on (button approach) for MVP. It's simpler, faster to build, and provides instant feedback for demos.

---

This plan focuses exclusively on Browser Extension + Gmail Add-on as requested, with production-ready implementation in **4-5 days**.

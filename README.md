# 🛡️ PhishLogic

**A production-ready phishing detection system with real-time analysis, plain English red flags, and automated email alerts.**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-56%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)]()
[![Node.js](https://img.shields.io/badge/Node.js-22+-green)]()

---

## 🚀 Features

### ✅ **Core Detection Capabilities**
- **Static Analysis**: SPF/DKIM validation, URL entropy, suspicious TLDs, phishing keywords
- **Dynamic Analysis**: Playwright-based redirect chains and credential harvesting form detection
- **Smart Execution**: Skips dynamic analysis when static results are conclusive
- **Whitelist System**: Fast bypass (<5ms) for trusted sources

### 🛡️ **Secure Sandbox Execution**
- **Three-layer isolation**: Browser contexts, resource controls, no code execution
- **Safe malicious content analysis**: URLs/emails analyzed without risk to infrastructure
- **Production hardening**: Docker container + Chromium sandbox + network restrictions
- **Automatic cleanup**: Resource limits, timeouts, graceful shutdown

### 📊 **User-Friendly Results**
- **0-10 Scoring**: Easy-to-understand threat score (0-3 Safe, 4-6 Suspicious, 7-10 Malicious)
- **Plain English Red Flags**: No technical jargon - warnings anyone can understand
- **Alert Levels**: Automatic priority classification (none/low/medium/high)
- **Execution Tracking**: Complete audit trail with timestamps for debugging

### 📧 **Email Alerts**
- **Automatic Notifications**: Auto-send alerts when score ≥ 7 or verdict = Malicious
- **Batch Mode**: Queue multiple alerts into periodic summary emails
- **HTML Templates**: Professional email templates for alerts

### 🔌 **REST API**
- **Fastify Server**: High-performance REST API
- **Multiple Input Sources**: Direct URL/email analysis, with future support for Gmail/Outlook/Browser
- **Rate Limiting**: 100 req/min per IP
- **Security**: Helmet, CORS, error handling

---

## 📦 Quick Start

### Prerequisites
- Node.js 22+
- npm 11+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd PhishLogic

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Copy environment configuration
cp .env.example .env

# Edit .env with your settings (optional)
nano .env

# Build the project
npm run build

# Run tests
npm test

# Start the server
npm start
```

The API will be available at `http://localhost:3000`

---

## 🎯 Usage Examples

### Analyze URL

```bash
curl -X POST http://localhost:3000/api/v1/analyze/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

**Response:**
```json
{
  "verdict": "Safe",
  "score": 1.5,
  "alertLevel": "low",
  "redFlags": [],
  "reasoning": "No significant security concerns were detected.",
  "metadata": {
    "duration": 5450,
    "analyzersRun": ["UrlEntropyAnalyzer", "RedirectAnalyzer", "FormAnalyzer"]
  }
}
```

### Add Trusted Domain to Whitelist

```bash
curl -X POST http://localhost:3000/api/v1/whitelist \
  -H "Content-Type: application/json" \
  -d '{
    "type": "domain",
    "value": "trusted-company.com",
    "description": "Company domain"
  }'
```

### JavaScript Example

```javascript
const response = await fetch('http://localhost:3000/api/v1/analyze/url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://suspicious-site.com' }),
});

const result = await response.json();
console.log(`Verdict: ${result.verdict} (Score: ${result.score}/10)`);
console.log('Red Flags:', result.redFlags.map(f => f.message));
```

See [API Documentation](docs/API.md) for complete endpoint reference.

---

## 🔌 Integrations

PhishLogic offers production-ready integrations for instant phishing detection across multiple platforms.

### Browser Extension (Chrome/Firefox/Edge)

Right-click any link in your browser to instantly check for phishing threats.

**Features**:
- 🖱️ Context menu integration ("Check for Phishing with PhishLogic")
- ⚡ Instant notifications with verdict and score
- 📊 Analysis history popup (last 50 checks)
- 📈 Stats dashboard (Safe/Suspicious/Malicious counts)
- ⚙️ Configurable API endpoint

**Installation**:
1. Chrome: Load unpacked extension from `browser-extension/`
2. Firefox: Load temporary add-on from `browser-extension/manifest.json`
3. Configure API endpoint in extension settings

**Documentation**: [Browser Extension Guide](docs/BROWSER_EXTENSION.md)

---

### Gmail Add-on

One-click phishing analysis directly in Gmail with instant results displayed in the sidebar.

**Features**:
- 🛡️ "Analyze Email" button in Gmail sidebar
- 🎯 Instant verdict with score and reasoning
- 🚩 Specific red flags and phishing indicators
- 🗑️ Quick actions (move to trash, report to security)
- ⚡ On-demand analysis (no background polling)

**Installation**:
1. Create Google Apps Script project
2. Add `gmail-addon/Code.gs` and `appsscript.json`
3. Deploy as test add-on (instant, no approval)
4. Opens in Gmail sidebar automatically

**Documentation**: [Gmail Add-on Setup Guide](docs/GMAIL_ADDON_SETUP.md)

---

### Supported Integrations

| Platform | Status | Type | Documentation |
|----------|--------|------|---------------|
| Browser Extension (Chrome/Firefox/Edge) | ✅ Available | Direct API | [Guide](docs/BROWSER_EXTENSION.md) |
| Gmail Add-on | ✅ Available | Direct API | [Guide](docs/GMAIL_ADDON_SETUP.md) |
| Outlook Add-in | 🚧 Coming Soon | Adapter Pattern | - |
| LinkedIn | 🚧 Coming Soon | Adapter Pattern | - |
| WhatsApp | 🚧 Coming Soon | Adapter Pattern | - |
| Instagram | 🚧 Coming Soon | Adapter Pattern | - |
| X/Twitter | 🚧 Coming Soon | Adapter Pattern | - |

**Integration Types**:
- **Direct API**: Calls existing `/api/v1/analyze/url` or `/api/v1/analyze/email` (no backend changes)
- **Adapter Pattern**: Requires new `InputAdapter` implementation with OAuth/API authentication

See [PhishLogic Integration Pattern](.claude/skills/phishlogic-integration.md) for adding new integrations.

---

## 🏗️ Architecture

### Clean Architecture Principles

```
┌─────────────────────────────────────────────┐
│           API Layer (Fastify)               │
│  Routes → Controllers → Response            │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│         Adapters (Input/Output)             │
│  Raw, Gmail, Outlook, Browser Extensions    │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│          Core Domain (Pure Logic)           │
│                                             │
│  ┌──────────────┐    ┌──────────────┐     │
│  │   Analyzers  │    │   Services   │     │
│  │  Static (4)  │    │  Whitelist   │     │
│  │  Dynamic (2) │    │   Verdict    │     │
│  └──────────────┘    └──────────────┘     │
│         │                    │              │
│  ┌──────▼────────────────────▼─────────┐  │
│  │      Analysis Engine                 │  │
│  │  Orchestration + Execution Tracking  │  │
│  └──────────────────────────────────────┘  │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│    Infrastructure (External Services)       │
│  Logging, Email, Browser Automation         │
└─────────────────────────────────────────────┘
```

### 6 Analyzers (Pluggable Architecture)

#### Static Analyzers (Parallel Execution)
1. **UrlEntropyAnalyzer** - Detects random-looking URLs, suspicious TLDs, URL shorteners
2. **SpfAnalyzer** - Validates Sender Policy Framework for emails
3. **DkimAnalyzer** - Validates email signatures
4. **HeaderAnalyzer** - Detects sender mismatches, phishing keywords, urgency language

#### Dynamic Analyzers (Sequential, Conditional)
5. **RedirectAnalyzer** - Follows redirect chains using Playwright
6. **FormAnalyzer** - Detects credential harvesting forms (password, credit card, SSN)

---

## ⚙️ Configuration

Key environment variables (see `.env.example` for full list):

```bash
# Server
PORT=3000
NODE_ENV=development

# Analysis Thresholds
MALICIOUS_THRESHOLD=0.7    # Internal confidence threshold
SUSPICIOUS_THRESHOLD=0.4

# Email Alerts
EMAIL_ENABLED=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_ALERT_RECIPIENTS=security@company.com,admin@company.com
EMAIL_ALERT_THRESHOLD=7    # Send alerts when score >= 7

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000
```

---

## 📊 Scoring System

### User-Facing Score (0-10)
- **0-3**: 🟢 **Safe** - No significant concerns
- **4-6**: 🟡 **Suspicious** - Proceed with caution
- **7-10**: 🔴 **Malicious** - High risk, triggers alert

### Alert Levels
- **none** (0-1): No concerns
- **low** (2-3): Minor concerns
- **medium** (4-6): Be cautious
- **high** (7-10): High priority, take action immediately

### Red Flag Categories
- **sender**: Email authentication issues
- **url**: Suspicious URL patterns
- **content**: Phishing keywords or forms
- **authentication**: SPF/DKIM failures
- **suspicious_behavior**: Unusual patterns

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

**Current Status**: ✅ **56 tests passing**

---

## 📁 Project Structure

```
PhishLogic/
├── src/
│   ├── api/                    # REST API layer
│   │   ├── controllers/        # Request handlers
│   │   ├── routes/             # Route definitions
│   │   ├── schemas/            # Request validation
│   │   └── server.ts           # Fastify setup
│   ├── core/                   # Core domain logic
│   │   ├── analyzers/          # Detection analyzers
│   │   │   ├── static/         # Static analyzers (4)
│   │   │   ├── dynamic/        # Dynamic analyzers (2)
│   │   │   └── base/           # Base classes
│   │   ├── engine/             # Analysis orchestration
│   │   ├── models/             # Domain types
│   │   └── services/           # Business services
│   ├── adapters/               # Input/output adapters
│   │   └── input/              # Input adapters
│   ├── infrastructure/         # External services
│   │   ├── logging/            # Pino logger
│   │   └── email/              # Email notifications
│   ├── config/                 # Configuration
│   └── index.ts                # Entry point
├── tests/
│   ├── unit/                   # Unit tests
│   └── integration/            # Integration tests
├── docs/                       # Documentation
│   ├── API.md                  # API reference
│   ├── BROWSER_EXTENSION.md    # Browser extension guide
│   └── GMAIL_ADDON_SETUP.md    # Gmail add-on guide
├── browser-extension/          # Chrome/Firefox extension
│   ├── manifest.json           # Extension configuration
│   ├── background.js           # Service worker
│   └── popup/                  # Popup UI
├── gmail-addon/                # Gmail add-on
│   ├── appsscript.json         # Add-on configuration
│   └── Code.gs                 # Apps Script code
├── .env.example                # Environment template
└── CLAUDE.md                   # Development standards
```

---

## 🔧 Development

### Code Standards

See [CLAUDE.md](CLAUDE.md) for comprehensive development standards including:
- TypeScript conventions
- Naming patterns
- Error handling
- Testing guidelines
- Security best practices

### Add a New Analyzer

```typescript
// 1. Create analyzer class
export class MyAnalyzer extends BaseAnalyzer {
  getName(): string { return 'MyAnalyzer'; }
  getWeight(): number { return 1.0; }
  getType(): 'static' | 'dynamic' { return 'static'; }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    // Analysis logic
    return signals;
  }
}

// 2. Register in analysis.controller.ts
engine.registerAnalyzer(new MyAnalyzer());
```

### Scripts

```bash
npm run dev          # Development mode with auto-reload
npm run build        # Build for production
npm start            # Start production server
npm test             # Run tests
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
npm run format       # Format with Prettier
npm run typecheck    # TypeScript type checking
```

---

## 🚦 Production Deployment

### Build

```bash
npm run build
```

### Environment Variables

Ensure all required environment variables are set in production:
- SMTP credentials (if email alerts enabled)
- Security configuration
- Analysis thresholds
- Rate limiting settings

### Health Check

```bash
curl http://localhost:3000/health
```

---

## 📈 Performance

- **Whitelist Bypass**: <5ms for trusted sources
- **Static Analysis**: ~10ms (4 analyzers in parallel)
- **Dynamic Analysis**: ~5-15s (Playwright-based, conditional)
- **Total Analysis**: ~30s max (configurable timeout)

### Optimization Tips
- Enable whitelist for trusted domains
- Adjust `EMAIL_ALERT_THRESHOLD` to reduce false positives
- Use batch email mode to reduce SMTP overhead
- Configure browser pool size for dynamic analysis

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Follow coding standards in [CLAUDE.md](CLAUDE.md)
4. Write tests for new features
5. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- Built with [Claude Code](https://claude.com/claude-code)
- Powered by TypeScript, Node.js, Fastify, and Playwright
- Email parsing by Mailparser
- Validation by Zod

---

## 📞 Support

- **Documentation**: [docs/API.md](docs/API.md)
- **Issues**: GitHub Issues
- **Security**: Report vulnerabilities privately

---

**PhishLogic** - Protecting users from phishing with intelligent detection and plain English explanations. 🛡️

# PhishLogic Enterprise Analyzer Enhancement Plan

**Status**: Planning Phase
**Priority**: P0 (Critical - Security Core)
**Timeline**: 8-12 weeks
**Goal**: World-class phishing detection with enterprise-grade analyzers

---

## Current State Analysis

**Existing Analyzers** (6 total):
- ✅ SPF/DKIM verification (email authentication)
- ✅ URL pattern analysis (typosquatting, entropy)
- ✅ Header analysis (basic phishing keywords)
- ✅ Form detection (Playwright-based)
- ✅ Redirect detection (Playwright-based)
- ⚠️ **Gap**: No emotional manipulation detection
- ⚠️ **Gap**: No deep link reputation checking
- ⚠️ **Gap**: No attachment sandboxing
- ⚠️ **Gap**: No threat intelligence integration
- ⚠️ **Gap**: Limited NLP capabilities

---

## Enterprise Enhancement Strategy

### 1. Emotional Manipulation Detection (NLP-Based)

**Goal**: Detect psychological manipulation tactics used in phishing

**Enterprise Solutions**:

#### Option A: Compromise (NLP Library for Node.js) ✅ RECOMMENDED
- **Package**: `compromise` + `compromise-sentences`
- **License**: MIT (Open Source)
- **Maturity**: 50k+ stars, battle-tested
- **Use Case**: Sentiment analysis, urgency detection, fear appeals
- **Integration**: Native Node.js, no external services
```bash
npm install compromise compromise-sentences
```

**Features to Implement**:
- Fear/urgency detection (scarcity tactics)
- Authority impersonation language patterns
- Social proof manipulation
- Trust indicators analysis
- Emotional pressure scoring

**Example Detection**:
```typescript
// Detects: "Your account will be suspended in 24 hours!"
{
  manipulation_type: "fear_urgency",
  confidence: 0.92,
  indicators: ["suspended", "24 hours", "immediate action"],
  risk_score: 8.5
}
```

#### Option B: Natural (Lightweight NLP)
- **Package**: `natural`
- **License**: MIT
- **Features**: Sentiment analysis, tokenization, Bayes classifier
- **Use Case**: Backup/complement to compromise

---

### 2. Advanced Link Reputation & Threat Intelligence

**Goal**: Check all URLs against multiple threat intelligence sources

**Enterprise Solutions**:

#### A. VirusTotal API ✅ RECOMMENDED (Primary)
- **Service**: VirusTotal Public API v3
- **Cost**: Free tier (4 requests/min) or Premium
- **Coverage**: 70+ antivirus engines, URL reputation
- **Integration**: `@virustotal/vt-js` npm package
- **Response Time**: 500-1000ms per URL
```bash
npm install @virustotal/vt-js
```

**Features**:
- Multi-engine scanning (70+ AVs)
- Historical reputation data
- Community votes
- Detected malware families
- Redirect chains

#### B. Google Safe Browsing API ✅ RECOMMENDED (Secondary)
- **Service**: Google Safe Browsing Lookup API v4
- **Cost**: Free (500 requests/day) or paid
- **Coverage**: Malware, phishing, unwanted software, social engineering
- **Integration**: `@googleapis/safebrowsing`
- **Response Time**: 200-500ms
```bash
npm install @googleapis/safebrowsing
```

**Features**:
- Real-time threat detection
- Google's massive database
- Low latency
- High accuracy

#### C. URLhaus API (Abuse.ch) ✅ RECOMMENDED (Tertiary)
- **Service**: URLhaus REST API
- **Cost**: Free
- **Coverage**: Malware distribution URLs
- **Integration**: Direct REST API
- **Response Time**: 100-300ms

**Features**:
- Malware URL database
- Real-time updates
- No rate limits
- Community-driven

#### D. OpenPhish API (Optional)
- **Service**: OpenPhish Community Feed
- **Cost**: Free (limited) or Premium
- **Coverage**: Active phishing URLs
- **Integration**: REST API

#### E. PhishTank API (Optional)
- **Service**: PhishTank REST API
- **Cost**: Free (requires API key)
- **Coverage**: Community-verified phishing URLs
- **Integration**: REST API

**Implementation Strategy**:
1. **Parallel Queries**: Check all services simultaneously
2. **Caching**: Redis cache for 24 hours (reduce API calls)
3. **Fallback Chain**: VirusTotal → Google Safe Browsing → URLhaus
4. **Aggregation**: Combine verdicts with weighted scoring

---

### 3. Attachment Sandboxing & Analysis

**Goal**: Safely analyze email attachments for malicious content

**Enterprise Solutions**:

#### Option A: Cuckoo Sandbox ✅ RECOMMENDED (Self-Hosted)
- **Platform**: Open-source malware analysis system
- **License**: GPL v3
- **Deployment**: Self-hosted (Docker/VM)
- **Integration**: REST API
- **Analysis Types**:
  - Windows PE files (.exe, .dll)
  - Office documents (.doc, .xls, .ppt)
  - PDFs
  - Scripts (.js, .vbs, .ps1)
  - Archives (.zip, .rar)

**Deployment**:
```bash
# Docker Compose setup
docker-compose up -d cuckoo-sandbox
```

**Features**:
- Dynamic behavior analysis
- Network traffic capture
- API call monitoring
- Registry changes tracking
- Screenshot capture
- Memory dumps

**Integration Flow**:
```typescript
// 1. Extract attachment from email
// 2. Submit to Cuckoo Sandbox
// 3. Wait for analysis (1-5 minutes)
// 4. Parse results (malware score, behaviors)
// 5. Return verdict
```

#### Option B: YARA Rules + ClamAV ✅ RECOMMENDED (Static Analysis)
- **YARA**: Pattern matching for malware
  - Package: `yara` (native) or `libyara-wasm` (WebAssembly)
  - License: BSD-3-Clause
  - Use: Static malware signature detection

- **ClamAV**: Antivirus engine
  - Package: `clamscan` (npm wrapper for ClamAV)
  - License: GPL v2
  - Use: Virus scanning for known threats

```bash
npm install clamscan
npm install yara # or libyara-wasm
```

**Features**:
- Fast static analysis (< 1 second)
- No sandbox required
- Known malware signatures
- Custom YARA rules for phishing

#### Option C: Hybrid Approach ✅ BEST PRACTICE
```
1. Quick Static Analysis (ClamAV + YARA) - 1s
   ├─ Known malware → Flag immediately
   └─ Unknown → Proceed to step 2

2. File Type Analysis (file-type, peek-readable)
   ├─ Executable → Send to Cuckoo Sandbox
   ├─ Office/PDF → Send to Cuckoo Sandbox
   ├─ Archive → Extract and analyze contents
   └─ Image/Text → Static analysis only

3. Sandbox Analysis (Cuckoo) - 1-5 minutes
   └─ Dynamic behavior → Malware verdict
```

**Attachment Types to Support**:
- ✅ Executables: .exe, .dll, .msi, .scr
- ✅ Office: .doc, .docx, .xls, .xlsx, .ppt, .pptx, .docm, .xlsm
- ✅ PDF: .pdf
- ✅ Scripts: .js, .vbs, .ps1, .bat, .cmd
- ✅ Archives: .zip, .rar, .7z, .tar.gz
- ✅ Images: .jpg, .png (steganography check)

---

### 4. Enhanced URL Analysis (Internal)

**Goal**: Deep URL analysis using our own heuristics

**Enhancements**:

#### A. Homograph/IDN Attack Detection
- **Package**: `punycode` (built-in Node.js)
- **Detection**: Unicode lookalike characters
- **Example**: `xn--80ak6aa92e.com` (аррӏе.com in Cyrillic)

#### B. URL Reputation Scoring
- **Factors**:
  - Domain age (WHOIS lookup)
  - SSL certificate validity
  - Alexa/Tranco rank
  - DNS records (MX, TXT, SPF)
  - Geo-location (IP-based)
  - Subdomain depth
  - Port usage (non-standard ports)

#### C. Screenshot & Visual Analysis
- **Package**: `playwright` (already installed)
- **Use**: Capture page screenshot
- **Analysis**:
  - Detect fake login forms (brand logo matching)
  - Visual similarity to legitimate sites
  - Phishing kit detection

#### D. Content Analysis
- **Extract**: Page title, meta tags, form fields
- **Detect**:
  - Password input fields
  - Credit card fields
  - Fake brand mentions
  - SSL warning bypass scripts

---

### 5. Machine Learning Integration (Optional - Phase 2)

**Goal**: ML-based phishing detection

**Options**:

#### Option A: TensorFlow.js
- **Package**: `@tensorflow/tfjs-node`
- **Use Case**: Train custom phishing classifier
- **Training Data**: PhishTank, OpenPhish datasets

#### Option B: Pre-trained Models
- **Hugging Face**: `@xenova/transformers`
- **Models**: BERT-based phishing detectors
- **Inference**: Local or API-based

---

## Implementation Phases

### Phase 1: Emotional Manipulation Detection (Week 1-2)

**Files to Create**:
```
src/core/analyzers/nlp/
├── emotional-manipulation.analyzer.ts
├── sentiment.analyzer.ts
├── urgency-pressure.analyzer.ts
└── authority-impersonation.analyzer.ts
```

**Dependencies**:
```json
{
  "dependencies": {
    "compromise": "^14.10.0",
    "compromise-sentences": "^0.2.0",
    "natural": "^6.10.0"
  }
}
```

**Verification**:
- [ ] Detects fear/urgency tactics (90%+ accuracy)
- [ ] Detects authority impersonation (85%+ accuracy)
- [ ] Sentiment scoring (positive/negative/neutral)
- [ ] Manipulation score (0-10 scale)

---

### Phase 2: Link Reputation Integration (Week 3-4)

**Files to Create**:
```
src/core/analyzers/reputation/
├── virustotal.analyzer.ts
├── google-safe-browsing.analyzer.ts
├── urlhaus.analyzer.ts
├── reputation-aggregator.ts
└── cache/redis-cache.service.ts
```

**Dependencies**:
```json
{
  "dependencies": {
    "@virustotal/vt-js": "^1.0.0",
    "@googleapis/safebrowsing": "^1.0.0",
    "axios": "^1.6.0",
    "redis": "^4.6.0"
  }
}
```

**Verification**:
- [ ] VirusTotal integration working
- [ ] Google Safe Browsing working
- [ ] URLhaus integration working
- [ ] Redis caching (24h TTL)
- [ ] Parallel query execution (< 2s total)
- [ ] Aggregated verdict scoring

---

### Phase 3: Attachment Sandboxing (Week 5-7)

**Files to Create**:
```
src/core/analyzers/attachment/
├── attachment-extractor.ts
├── static-analyzer.ts (ClamAV + YARA)
├── cuckoo-sandbox.analyzer.ts
├── file-type-detector.ts
└── sandbox-orchestrator.ts
```

**Dependencies**:
```json
{
  "dependencies": {
    "clamscan": "^2.2.0",
    "yara": "^3.0.0",
    "file-type": "^18.7.0",
    "peek-readable": "^5.0.0",
    "unzipper": "^0.10.14"
  }
}
```

**Infrastructure**:
- [ ] Cuckoo Sandbox deployed (Docker)
- [ ] ClamAV installed and running
- [ ] YARA rules configured
- [ ] File upload handling (multipart/form-data)

**Verification**:
- [ ] Static analysis (< 1s)
- [ ] Sandbox submission working
- [ ] Result parsing correct
- [ ] Handles 10+ file types
- [ ] Safe file handling (no execution on host)

---

### Phase 4: Enhanced URL Analysis (Week 8-9)

**Files to Create**:
```
src/core/analyzers/url/
├── homograph-detector.ts
├── domain-reputation.ts
├── visual-analyzer.ts (screenshot + OCR)
├── content-analyzer.ts
└── ssl-analyzer.ts
```

**Dependencies**:
```json
{
  "dependencies": {
    "punycode": "^2.3.1",
    "whois-json": "^2.1.0",
    "node-ssl-cert-info": "^1.0.0",
    "tesseract.js": "^5.0.0" // OCR for screenshot analysis
  }
}
```

**Verification**:
- [ ] Homograph detection (100% accuracy)
- [ ] WHOIS lookup working
- [ ] SSL validation
- [ ] Screenshot capture
- [ ] Form field detection

---

### Phase 5: Integration & Testing (Week 10-11)

**Tasks**:
1. Integrate all new analyzers into AnalysisEngine
2. Update analyzer registry
3. Configure weights and thresholds
4. Comprehensive testing with real phishing samples
5. Performance optimization
6. Load testing (100+ concurrent analyses)

**Verification**:
- [ ] All analyzers registered
- [ ] Weighted scoring correct
- [ ] Parallel execution working
- [ ] Performance acceptable (< 5s per email)
- [ ] 95%+ detection rate on PhishTank dataset

---

### Phase 6: Documentation & Monitoring (Week 12)

**Deliverables**:
1. Architecture documentation
2. Analyzer configuration guide
3. API key setup guide
4. Monitoring dashboards
5. Alert configuration
6. Runbook for operations

---

## Technology Stack Summary

### NLP & Text Analysis
| Package | Version | Purpose | License |
|---------|---------|---------|---------|
| compromise | ^14.10.0 | NLP, sentiment, urgency detection | MIT |
| natural | ^6.10.0 | Tokenization, Bayes classifier | MIT |

### Threat Intelligence
| Service | Cost | Purpose | SLA |
|---------|------|---------|-----|
| VirusTotal | Free/Paid | Multi-AV URL scanning | 4 req/min |
| Google Safe Browsing | Free/Paid | Phishing/malware detection | 500 req/day |
| URLhaus | Free | Malware URL database | Unlimited |
| PhishTank | Free | Phishing URL database | 1 req/5s |

### Malware Analysis
| Tool | Deployment | Purpose | Performance |
|------|------------|---------|-------------|
| Cuckoo Sandbox | Self-hosted | Dynamic malware analysis | 1-5 min |
| ClamAV | Self-hosted | Antivirus scanning | < 1s |
| YARA | Embedded | Malware signature matching | < 1s |

### Infrastructure
| Component | Technology | Purpose |
|-----------|------------|---------|
| Cache | Redis | API response caching (24h) |
| Queue | Bull (Redis) | Async sandbox jobs |
| Storage | S3/MinIO | Attachment storage |
| Monitoring | Prometheus + Grafana | Metrics & dashboards |

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Email analysis (no attachments) | < 3s | ~2.5s ✅ |
| Email analysis (with attachments) | < 10s | N/A |
| URL reputation check | < 2s | N/A |
| Attachment static scan | < 1s | N/A |
| Attachment sandbox | < 5min | N/A |
| Concurrent analyses | 100+ | ~10 |
| Detection rate (phishing) | 95%+ | ~75% |
| False positive rate | < 2% | ~5% |

---

## Cost Analysis

### API Costs (Monthly Estimates)

**VirusTotal**:
- Free: 4 requests/min (6,000/day) = $0
- Premium: 1,000 requests/day = $500/month

**Google Safe Browsing**:
- Free: 500 requests/day = $0
- Paid: Unlimited = $0.25 per 1,000 requests

**Infrastructure** (Self-Hosted):
- Cuckoo Sandbox: 1 VM (4 CPU, 8GB RAM) = $40/month
- Redis: 1 instance (2GB) = $15/month
- MinIO: 100GB storage = $10/month

**Total Monthly Cost**:
- Minimal: $65/month (free APIs + infrastructure)
- Optimal: $600/month (premium APIs + infrastructure)

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| API rate limits exceeded | High | Medium | Implement caching, queue system |
| Sandbox performance bottleneck | High | Medium | Scale horizontally, prioritize analysis |
| False positives increase | High | Low | Tune thresholds, A/B testing |
| External service downtime | Medium | Low | Fallback to native analysis |
| Malware escape from sandbox | Critical | Very Low | Proper isolation, regular updates |

---

## Success Metrics

**Detection Quality**:
- ✅ 95%+ phishing detection rate
- ✅ < 2% false positive rate
- ✅ 90%+ emotional manipulation detection
- ✅ 99%+ known malware detection (attachments)

**Performance**:
- ✅ < 3s average analysis time (no attachments)
- ✅ < 10s average analysis time (with attachments)
- ✅ 100+ concurrent analyses supported

**Operational**:
- ✅ 99.9% uptime
- ✅ < 1% analysis failure rate
- ✅ Monitoring dashboards operational

---

## Next Steps

1. **Approve Plan** - Review and approve enhancement scope
2. **Set Up Infrastructure** - Deploy Redis, Cuckoo Sandbox
3. **Obtain API Keys** - Register for VirusTotal, Google Safe Browsing
4. **Begin Phase 1** - Implement emotional manipulation detection

**Ready to proceed?** Let me know if you want to:
- Start with Phase 1 (Emotional Manipulation Detection)
- Review any specific component in detail
- Adjust priorities or scope

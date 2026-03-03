# AI Enhancement Plan for PhishLogic

## Overview

PhishLogic currently has AI SDKs installed (`@anthropic-ai/sdk` and `openai`) but they are **not used anywhere**. The system is 100% rule-based with hardcoded thresholds. This plan outlines how to add AI capabilities to improve detection accuracy, user experience, and development velocity.

## Current State Analysis

### What's Installed
- `@anthropic-ai/sdk`: ^0.32.1 (Claude API)
- `openai`: ^4.73.0 (OpenAI/GPT API)

### Current Usage
❌ **ZERO** - SDKs installed but not imported anywhere in `src/`

### Current Architecture (Rule-Based)

**6 Analyzers**:
1. **SPF Analyzer** - DNS-based authentication
2. **DKIM Analyzer** - Email signature validation
3. **Header Analyzer** - Email header inspection
4. **URL Entropy Analyzer** - Shannon entropy, hardcoded TLD lists
5. **Form Analyzer** - Regex pattern matching
6. **Redirect Analyzer** - Browser-based redirect detection

**Verdict Calculation**:
- Fixed thresholds (0.7 = malicious, 0.4 = suspicious)
- Template-based explanations
- Deterministic - same input = same output

---

## AI Enhancement Opportunities

### 1. AI-Enhanced Verdict Reasoning (Quick Win - 2-3 days)

**What**: Replace template-based explanations with natural language from LLM

**Current Problem**:
```typescript
// verdict.service.ts:240-275
private generateReasoning(verdict: Verdict, signals: AnalysisSignal[]): string {
  const parts: string[] = [];
  if (verdict === 'Malicious') {
    parts.push('This appears to be a phishing attempt or malicious content.');
  }
  // Very basic string concatenation
  return parts.join(' ');
}
```

**AI Solution**:
```typescript
// New: src/core/services/ai/ai-verdict-explainer.service.ts
async explainVerdict(signals: AnalysisSignal[], redFlags: RedFlag[], score: number): Promise<string> {
  const prompt = `
    As a security expert, explain this phishing analysis to a non-technical user:
    - Score: ${score}/10
    - Signals: ${JSON.stringify(signals)}
    - Red flags: ${JSON.stringify(redFlags)}
    
    Provide a clear, 2-3 sentence explanation.
  `;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
  });

  return response.content[0].text;
}
```

**Benefits**:
- ✅ Natural, context-aware explanations
- ✅ Educational for users
- ✅ Adapts tone based on severity

**Cost**: $0.001-0.003 per analysis

**Integration**:
- File: `src/core/services/verdict.service.ts:240`
- Config: Add AI section to `app.config.ts`

---

### 2. Visual Phishing Analyzer (High Impact - 1 week)

**What**: Screenshot analysis using Claude Vision to detect visual phishing cues

**Current Gap**:
- Misses fake login pages that look like real brands
- Can't detect typosquatting domains with legitimate UI
- Doesn't see urgency tactics (countdowns, "Act now!")
- Missing social engineering visual cues

**AI Solution**:
```typescript
// New: src/core/analyzers/dynamic/visual-ai.analyzer.ts
export class VisualAIAnalyzer extends BaseAnalyzer {
  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    // 1. Take screenshot with Playwright
    const screenshot = await page.screenshot({ fullPage: true });

    // 2. Send to Claude Vision
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot.toString('base64'),
            },
          },
          {
            type: 'text',
            text: `Analyze for phishing indicators:
              - Brand impersonation?
              - Urgency/pressure tactics?
              - Requests for sensitive info?
              - Low-quality design/typos?
              
              Return JSON: { signals: [...] }`
          }
        ],
      }],
      max_tokens: 1000,
    });

    return this.parseAISignals(response.content[0].text);
  }
}
```

**What AI Detects**:
- Brand logo similarity (Microsoft, Google, banks)
- Emotional manipulation (fear, urgency, greed)
- Fake trust indicators (badges, "verified" icons)
- UI quality assessment
- Contextual anomalies

**Benefits**:
- ✅ Catches sophisticated phishing
- ✅ Works even if URL looks legitimate
- ✅ Multimodal understanding

**Cost**: $0.01-0.03 per analysis (high-res screenshots)

---

### 3. Semantic Content Analyzer (Medium Impact - 3-4 days)

**What**: Analyze email/page text for social engineering patterns

**Current Gap**: Limited to keyword matching

**AI Solution**:
```typescript
// New: src/core/analyzers/static/semantic-ai.analyzer.ts
export class SemanticAIAnalyzer extends BaseAnalyzer {
  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const text = this.extractText(input);

    const prompt = `Analyze for phishing indicators:
      "${text}"
      
      Look for:
      1. Urgency/pressure tactics
      2. Authority impersonation
      3. Sensitive info requests
      4. Emotional manipulation
      5. Grammar issues
      6. Suspicious instructions
      
      Return JSON: { signals: [...] }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Fast, cheap
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return this.parseAISignals(response.choices[0].message.content);
  }
}
```

**Detection Examples**:
- "Your account will be suspended in 24 hours" → Urgency
- "You've won a prize!" → Too good to be true
- "Verify your identity immediately" → Authority + urgency

**Benefits**:
- ✅ Context understanding (not just keywords)
- ✅ Multi-lingual support
- ✅ Fast (1-2s response)

**Cost**: $0.0005-0.001 per analysis

---

### 4. AI Debug Assistant (Developer Tool - 2-3 days)

**What**: Interactive CLI to debug analyses

**Use Case**: Investigate false positives/negatives

**Implementation**:
```bash
npm run debug-analysis <analysisId>

# Output:
Analyzing result: a3f2b1c9...
Verdict: Suspicious (5.2/10)

🤖 This was flagged because:
1. SPF passed ✓ but DKIM failed ✗
2. URL entropy high (4.8)
3. Form with password field

However, might be false positive:
- Domain (microsoft.com) is legitimate
- No visual impersonation
- No urgency language

💡 Recommendation: Whitelist microsoft.com
```

**Cost**: $0.04 per session

---

### 5. Integration Code Generator (Future Tool - 1 week)

**What**: Auto-generate analyzers/adapters from prompts

**Workflow**:
```bash
npm run generate-integration

🤖 What integration?
> "Slack message analyzer"

🤖 Generating...
   ✓ Created slack.adapter.ts
   ✓ Created slack.controller.ts
   ✓ Created tests
   ✓ Updated routes
```

**Benefits**:
- ✅ Hours vs days
- ✅ Consistent patterns
- ✅ Auto-generates tests

---

### 6. Hybrid AI Core Engine (Major - 3-4 weeks)

**What**: AI-powered verdict synthesis for edge cases

**Architecture**:
```typescript
// New: src/core/engine/hybrid-analysis.engine.ts
export class HybridAnalysisEngine {
  async analyze(input: NormalizedInput): Promise<AnalysisResult> {
    // Phase 1: Run rule-based analyzers (fast)
    const ruleSignals = await this.runRuleBasedAnalyzers(input);

    // Phase 2: If inconclusive, invoke AI
    if (this.needsAIAnalysis(ruleSignals)) {
      const aiSignals = await this.runAIAnalyzers(input);
      const verdict = await this.aiVerdictSynthesis([...ruleSignals, ...aiSignals], input);
      return verdict;
    }

    // Use traditional for clear-cut cases
    return this.verdictService.calculateVerdict(ruleSignals);
  }
}
```

**Benefits**:
- ✅ Better edge case handling
- ✅ Learns signal combinations
- ✅ Adapts to new techniques

**Concerns**:
- ⚠️ Latency: +1-3s
- ⚠️ Cost: $0.01-0.05
- ⚠️ Consistency varies

---

### 7. Anomaly Detection (Long-Term - Ongoing)

**What**: Learn from past analyses using embeddings

**Architecture**:
```typescript
// New: src/core/services/anomaly-detection.service.ts
export class AnomalyDetectionService {
  async detectAnomalies(input: NormalizedInput, signals: AnalysisSignal[]): Promise<AnalysisSignal[]> {
    const features = this.extractFeatures(input, signals);
    const embedding = await this.getEmbedding(features);
    const similarity = this.cosineSimilarity(embedding, historicalData);

    if (similarity < 0.6) {
      return [{
        signalType: 'anomaly_detected',
        severity: 'medium',
        confidence: 1 - similarity,
        description: 'Unusual characteristics detected',
      }];
    }

    return [];
  }
}
```

**Benefits**:
- ✅ Zero-day detection
- ✅ Personalized patterns
- ✅ Low latency

**Cost**: $0.0001 per analysis

---

## Comparison Matrix

| Feature | Impact | Effort | Cost/Analysis | Latency | Risk |
|---------|--------|--------|---------------|---------|------|
| Verdict Reasoning | Medium | Low (2-3 days) | $0.001-0.003 | +200ms | Low |
| Visual Analyzer | High | Medium (1 week) | $0.01-0.03 | +3-5s | Medium |
| Semantic Analyzer | Medium | Low (3-4 days) | $0.0005-0.001 | +1-2s | Low |
| Debug Assistant | Low | Low (2-3 days) | N/A | N/A | Low |
| Code Generator | Low | Medium (1 week) | N/A | N/A | Low |
| Hybrid Engine | Very High | High (3-4 weeks) | $0.01-0.05 | +1-3s | High |
| Anomaly Detection | Medium | High (ongoing) | $0.0001 | +100ms | Medium |

---

## Implementation Roadmap

### Phase 1: Quick Wins (Week 1-2)
1. AI Verdict Reasoning (Days 1-3)
2. Semantic Content Analyzer (Days 4-7)
3. Testing & Tuning (Days 8-10)

**Deliverable**: AI-enhanced explanations

### Phase 2: High-Impact (Week 3-4)
1. Visual Phishing Analyzer (Week 3)
2. Integration & Optimization (Week 4)

**Deliverable**: Visual phishing detection

### Phase 3: Developer Tools (Week 5-6)
1. Debug Assistant (Week 5)
2. Code Generator (Week 6)

**Deliverable**: AI-assisted dev tools

### Phase 4: Core Engine (Month 2)
1. Hybrid Engine (Week 7-8)
2. Anomaly Detection (Week 9-10)

**Deliverable**: Production hybrid system

---

## Cost Projections

### Monthly Costs (1000 analyses/month)

**Light** (Reasoning + Semantic):
- 1000 × $0.002 = **$2/month**

**Moderate** (+Visual for 20%):
- 800 text × $0.002 = $1.60
- 200 visual × $0.03 = $6.00
- **Total: $7.60/month**

**Full** (Hybrid + All Features):
- 600 rule-based (free)
- 400 AI × $0.05 = $20
- **Total: $20/month**

### At Scale (10,000/month)
- Light: $20/month
- Moderate: $76/month
- Full: $200/month

**Conclusion**: Negligible cost vs benefits

---

## Benefits Summary

**Better Detection**:
- Visual phishing detection
- Social engineering language
- Context understanding
- Adapts to new techniques

**Superior UX**:
- Natural explanations
- Educational
- Personalized recommendations

**Faster Development**:
- Auto-generated integrations
- AI-assisted debugging
- Fewer manual updates

**Competitive Edge**:
- "AI-Powered" marketing
- Multimodal analysis
- Explainable AI
- Self-improving

---

## Technical Integration

### New Files

**AI Services**:
```
src/core/services/ai/
├── anthropic.client.ts
├── openai.client.ts
├── ai-verdict-explainer.service.ts
├── ai-prompt-builder.ts
└── ai-response-parser.ts
```

**AI Analyzers**:
```
src/core/analyzers/ai/
├── visual-ai.analyzer.ts
├── semantic-ai.analyzer.ts
└── anomaly-ai.analyzer.ts
```

**Developer Tools**:
```
src/cli/
├── debug-assistant.ts
└── integration-generator.ts
```

### Configuration

```typescript
// app.config.ts
const AIConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['anthropic', 'openai']).default('anthropic'),
  features: z.object({
    verdictReasoning: z.boolean().default(true),
    visualAnalysis: z.boolean().default(false),
    semanticAnalysis: z.boolean().default(true),
  }),
});
```

### Environment Variables

```bash
AI_ENABLED=true
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
AI_VERDICT_REASONING=true
AI_VISUAL_ANALYSIS=false
AI_SEMANTIC_ANALYSIS=true
```

---

## Success Metrics

**Accuracy**:
- ↓ False positives
- ↓ False negatives
- ↑ Sophisticated phishing detection

**Performance**:
- <5s with AI
- <500ms without AI
- API cost tracking

**User Experience**:
- Satisfaction surveys
- ↓ Support tickets
- Better phishing education

**Business**:
- "AI-Powered" positioning
- Marketing differentiation
- Enterprise adoption

---

## Risks & Mitigation

**Cost Overruns**:
- Feature flags
- Caching
- Cheaper models
- Conditional AI

**Latency**:
- Async analysis
- Parallel execution
- Streaming responses

**Consistency**:
- Audit logging
- A/B testing
- Temperature=0
- Schema validation

**API Outages**:
- Graceful degradation
- Multi-provider support
- Timeout handling

---

## Next Steps

1. Start with AI Verdict Reasoning (lowest risk, highest ROI)
2. Add Semantic Analyzer (fast, cheap, effective)
3. Evaluate after 2 weeks
4. Decide on Visual Analysis based on results

**Decision Points**:
- Default-enabled or opt-in?
- Primary provider (Anthropic vs OpenAI)?
- Keep both SDKs or choose one?
- Cost budget per analysis?

---

See also:
- [Cost Tracking Plan](./COST_TRACKING_PLAN.md)
- [Admin UI Plan](./ADMIN_UI_PLAN.md)
- [Implementation Roadmap](./IMPLEMENTATION_ROADMAP.md)

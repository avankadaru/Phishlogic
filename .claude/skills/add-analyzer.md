---
name: add-analyzer
description: Add a new analyzer (static or dynamic) to PhishLogic's detection engine
version: 1.0.0
---

# Add New Analyzer Skill

## When to Use

Use this skill when:
- Adding a new detection method to PhishLogic
- Implementing a new phishing signal detector
- Creating custom analyzers for specific threats
- Extending the analysis engine with new capabilities
- Adding domain-specific detection logic

## Analyzer Types

### Static Analyzers
- **Characteristics**: Fast, synchronous, no external dependencies
- **Execution**: Run in parallel with other static analyzers
- **Examples**: URL entropy, SPF check, DKIM validation, header analysis
- **Use for**: Pattern matching, data validation, mathematical analysis

### Dynamic Analyzers
- **Characteristics**: Slower, may use browser automation, external APIs
- **Execution**: Run conditionally based on static results
- **Examples**: Redirect chain following, form detection, JavaScript analysis
- **Use for**: Behavioral analysis, rendering-dependent checks

## Step 1: Choose Analyzer Type

```bash
# Decide based on these criteria:
# Static if: No external deps, <100ms execution, deterministic
# Dynamic if: Needs browser, >100ms execution, behavioral analysis

ANALYZER_TYPE="static"  # or "dynamic"
ANALYZER_NAME="MyAnalyzer"  # PascalCase
ANALYZER_FILE="my-analyzer"  # kebab-case
```

## Step 2: Create Analyzer File

### For Static Analyzer

Create `src/core/analyzers/static/[analyzer-name].analyzer.ts`:

```typescript
import { BaseAnalyzer } from '../base.analyzer.js';
import { AnalysisSignal, NormalizedInput } from '../../models/index.js';
import { isEmailInput, isUrlInput } from '../../utils/input-type.utils.js';

export class [AnalyzerName]Analyzer extends BaseAnalyzer {
  /**
   * Analyze the input for [specific threat/pattern]
   */
  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    // Check if this analyzer applies to the input type
    if (isUrlInput(input)) {
      // URL-specific analysis
      const url = input.data.url;
      
      // Perform your analysis logic
      if (this.detect[Pattern](url)) {
        signals.push(
          this.createSignal({
            signalType: '[pattern]_detected',
            severity: 'high', // 'low' | 'medium' | 'high' | 'critical'
            confidence: 0.8,  // 0.0 to 1.0
            description: 'Clear description of what was detected',
            evidence: {
              // Include relevant evidence
              url,
              pattern: '[specific pattern found]',
              details: '[additional context]'
            },
            metadata: {
              analyzer: this.getName(),
              category: '[phishing|malware|suspicious]'
            }
          })
        );
      }
    }

    if (isEmailInput(input)) {
      // Email-specific analysis
      const { headers, body, attachments } = input.data;
      
      // Analyze email components
      // Add signals for any suspicious findings
    }

    return signals;
  }

  /**
   * Detect [specific pattern/threat]
   */
  private detect[Pattern](url: string): boolean {
    // Implementation of your detection logic
    // Examples:
    // - Regex pattern matching
    // - Statistical analysis
    // - Heuristic checks
    
    return false; // Replace with actual logic
  }

  getName(): string {
    return '[AnalyzerName]Analyzer';
  }

  getWeight(): number {
    // Weight affects how much this analyzer contributes to final score
    // 1.0 = normal, 1.5 = high importance, 0.5 = low importance
    return 1.0;
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  isApplicable(input: NormalizedInput): boolean {
    // Determine if this analyzer should run for this input
    // Can check input type, presence of certain fields, etc.
    return isUrlInput(input) || isEmailInput(input);
  }
}
```

### For Dynamic Analyzer

Create `src/core/analyzers/dynamic/[analyzer-name].analyzer.ts`:

```typescript
import { BaseAnalyzer } from '../base.analyzer.js';
import { AnalysisSignal, NormalizedInput } from '../../models/index.js';
import { BrowserService } from '../../../infrastructure/browser/browser.service.js';
import { logger } from '../../../infrastructure/logging/index.js';

export class [AnalyzerName]Analyzer extends BaseAnalyzer {
  private browserService: BrowserService;

  constructor() {
    super();
    this.browserService = new BrowserService();
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals: AnalysisSignal[] = [];

    if (!this.isApplicable(input)) {
      return signals;
    }

    try {
      // Launch browser for dynamic analysis
      const browser = await this.browserService.launch();
      const page = await browser.newPage();

      try {
        // Set up page configuration
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0...');

        // Navigate to URL
        const url = input.data.url;
        await page.goto(url, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });

        // Perform dynamic analysis
        const [specificCheck] = await this.perform[Check](page);

        if ([specificCheck]) {
          signals.push(
            this.createSignal({
              signalType: '[behavior]_detected',
              severity: 'high',
              confidence: 0.9,
              description: 'Description of dynamic behavior detected',
              evidence: {
                url,
                behavior: '[specific behavior]',
                screenshot: await page.screenshot({ encoding: 'base64' })
              }
            })
          );
        }

      } finally {
        await page.close();
      }

      await browser.close();

    } catch (error) {
      logger.error({ error, analyzer: this.getName() }, 'Dynamic analysis failed');
      // Don't throw - return partial results
    }

    return signals;
  }

  private async perform[Check](page: any): Promise<boolean> {
    // Implement your dynamic check
    // Examples:
    // - Check for forms: await page.$$('form input[type="password"]')
    // - Monitor redirects: page.on('response', ...)
    // - Evaluate JavaScript: await page.evaluate(() => ...)
    
    return false;
  }

  getName(): string {
    return '[AnalyzerName]Analyzer';
  }

  getWeight(): number {
    return 1.5; // Dynamic analyzers often have higher weight
  }

  getType(): 'static' | 'dynamic' {
    return 'dynamic';
  }

  isApplicable(input: NormalizedInput): boolean {
    // Only run for URLs, not emails
    return input.type === 'url' && !!input.data.url;
  }
}
```

## Step 3: Register Analyzer

### Update Analyzer Registry

Edit `src/core/engine/analyzer-registry.ts`:

```typescript
import { [AnalyzerName]Analyzer } from '../analyzers/[static|dynamic]/[analyzer-name].analyzer.js';

// In the registry initialization
export function createAnalyzerRegistry(): AnalyzerRegistry {
  const registry = new AnalyzerRegistry();

  // Static analyzers
  registry.register(new UrlEntropyAnalyzer());
  registry.register(new SpfAnalyzer());
  registry.register(new DkimAnalyzer());
  registry.register(new HeaderAnalyzer());
  registry.register(new [AnalyzerName]Analyzer()); // ADD THIS

  // Dynamic analyzers (if applicable)
  registry.register(new RedirectAnalyzer());
  registry.register(new FormAnalyzer());
  // registry.register(new [AnalyzerName]Analyzer()); // OR ADD HERE

  return registry;
}
```

## Step 4: Configure Analyzer Weight

### Update Configuration

Edit `src/config/app.config.ts`:

```typescript
const analyzerWeights = z.object({
  urlEntropy: z.number().default(1.0),
  spf: z.number().default(1.5),
  dkim: z.number().default(1.5),
  header: z.number().default(1.2),
  [analyzerName]: z.number().default(1.0), // ADD THIS
  redirect: z.number().default(2.0),
  form: z.number().default(2.0),
});
```

Add to `.env`:

```bash
ANALYZER_WEIGHT_[ANALYZER_NAME]=1.0
```

## Step 5: Create Unit Tests

### Create Test File

Create `tests/unit/analyzers/[analyzer-name].analyzer.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { [AnalyzerName]Analyzer } from '../../../src/core/analyzers/[static|dynamic]/[analyzer-name].analyzer.js';
import { createMockUrlInput, createMockEmailInput } from '../../fixtures/index.js';

describe('[AnalyzerName]Analyzer', () => {
  let analyzer: [AnalyzerName]Analyzer;

  beforeEach(() => {
    analyzer = new [AnalyzerName]Analyzer();
  });

  describe('analyze', () => {
    it('should detect [pattern] in URL', async () => {
      // Arrange
      const input = createMockUrlInput({
        url: 'https://suspicious-example.com/[pattern]'
      });

      // Act
      const signals = await analyzer.analyze(input);

      // Assert
      expect(signals).toHaveLength(1);
      expect(signals[0].signalType).toBe('[pattern]_detected');
      expect(signals[0].severity).toBe('high');
      expect(signals[0].confidence).toBeGreaterThan(0.7);
    });

    it('should not trigger on legitimate URLs', async () => {
      // Arrange
      const input = createMockUrlInput({
        url: 'https://google.com'
      });

      // Act
      const signals = await analyzer.analyze(input);

      // Assert
      expect(signals).toHaveLength(0);
    });

    it('should handle email inputs appropriately', async () => {
      // Arrange
      const input = createMockEmailInput({
        subject: 'Test email',
        from: 'test@example.com'
      });

      // Act
      const signals = await analyzer.analyze(input);

      // Assert
      // Add appropriate assertions
    });
  });

  describe('metadata', () => {
    it('should return correct analyzer name', () => {
      expect(analyzer.getName()).toBe('[AnalyzerName]Analyzer');
    });

    it('should return correct type', () => {
      expect(analyzer.getType()).toBe('[static|dynamic]');
    });

    it('should return appropriate weight', () => {
      expect(analyzer.getWeight()).toBe(1.0);
    });
  });

  describe('isApplicable', () => {
    it('should be applicable to URL inputs', () => {
      const input = createMockUrlInput();
      expect(analyzer.isApplicable(input)).toBe(true);
    });

    // Add more applicability tests
  });
});
```

## Step 6: Integration Testing

### Test with Engine

Create `tests/integration/analyzers/[analyzer-name].integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { AnalysisEngine } from '../../../src/core/engine/index.js';
import { createMockUrlInput } from '../../fixtures/index.js';

describe('[AnalyzerName]Analyzer Integration', () => {
  let engine: AnalysisEngine;

  beforeEach(() => {
    engine = new AnalysisEngine();
  });

  it('should contribute to overall analysis', async () => {
    // Arrange
    const input = createMockUrlInput({
      url: 'https://phishing-test.com/[pattern]'
    });

    // Act
    const result = await engine.analyze(input);

    // Assert
    expect(result.signals).toContainEqual(
      expect.objectContaining({
        signalType: '[pattern]_detected',
        metadata: expect.objectContaining({
          analyzer: '[AnalyzerName]Analyzer'
        })
      })
    );
  });

  it('should affect verdict calculation', async () => {
    // Test that your analyzer affects the final verdict appropriately
  });
});
```

## Step 7: Documentation

### Update Analyzer Documentation

Create `docs/analyzers/[analyzer-name].md`:

```markdown
# [AnalyzerName] Analyzer

## Purpose
[Describe what this analyzer detects and why it's important]

## Type
- **Category**: [Static|Dynamic]
- **Weight**: 1.0
- **Execution Time**: ~[X]ms

## Detection Logic
[Explain how the analyzer works]

### Patterns Detected
- [Pattern 1]: Description
- [Pattern 2]: Description

### Signal Types
- `[pattern]_detected`: When [condition]

## Configuration
- `ANALYZER_WEIGHT_[ANALYZER_NAME]`: Adjust importance (default: 1.0)

## Examples

### Detected Threats
- `https://malicious.com/[pattern]` - [Why this is detected]

### False Positive Mitigation
[How the analyzer avoids false positives]

## Performance Considerations
[Any performance implications]

## References
- [Link to research or documentation about the threat]
```

## Step 8: Verification Checklist

### Implementation
- [ ] Analyzer file created in correct directory (static/ or dynamic/)
- [ ] Extends BaseAnalyzer class
- [ ] Implements all required methods (analyze, getName, getWeight, getType)
- [ ] Creates signals with appropriate severity and confidence
- [ ] Handles both URL and email inputs (if applicable)
- [ ] Error handling doesn't crash the analysis

### Registration
- [ ] Added to analyzer registry
- [ ] Weight configured in app.config.ts
- [ ] Environment variable added to .env.example

### Testing
- [ ] Unit tests cover main detection logic
- [ ] Unit tests verify metadata methods
- [ ] Integration test verifies engine integration
- [ ] Tests include positive and negative cases
- [ ] Performance is acceptable (<100ms for static, <5s for dynamic)

### Documentation
- [ ] Analyzer documented in docs/analyzers/
- [ ] Added to analyzer list in README
- [ ] Configuration options documented

## Common Patterns

### Pattern: Keyword Detection
```typescript
private detectSuspiciousKeywords(text: string): boolean {
  const keywords = ['urgent', 'verify', 'suspended', 'click here'];
  const lowerText = text.toLowerCase();
  return keywords.some(keyword => lowerText.includes(keyword));
}
```

### Pattern: Domain Analysis
```typescript
private analyzeUrlStructure(url: string): SuspicionLevel {
  const parsed = new URL(url);
  
  // Check for homograph attacks
  if (/[а-яА-Я]/.test(parsed.hostname)) {
    return 'high'; // Cyrillic characters
  }
  
  // Check for subdomain abuse
  if (parsed.hostname.split('.').length > 4) {
    return 'medium'; // Excessive subdomains
  }
  
  return 'low';
}
```

### Pattern: Email Header Analysis
```typescript
private analyzeEmailHeaders(headers: EmailHeaders): Signal[] {
  const signals = [];
  
  // SPF alignment
  if (headers['return-path'] !== headers['from']) {
    signals.push(this.createSignal({
      signalType: 'spf_alignment_fail',
      severity: 'medium'
    }));
  }
  
  return signals;
}
```

## Troubleshooting

### Issue: Analyzer not running
- Check registration in analyzer-registry.ts
- Verify isApplicable() returns true for your input
- Check logs for initialization errors

### Issue: Signals not affecting verdict
- Verify weight is configured properly
- Check signal severity levels
- Ensure confidence scores are reasonable (0.3-1.0)

### Issue: Performance problems
- For static: Optimize algorithms, cache results
- For dynamic: Reuse browser instances, add timeouts
- Consider moving to dynamic if >100ms

## Examples from Codebase

### Good Example: SPF Analyzer
- Location: `src/core/analyzers/static/spf.analyzer.ts`
- Clear signal types
- Appropriate confidence scores
- Good error handling

### Good Example: Form Analyzer
- Location: `src/core/analyzers/dynamic/form.analyzer.ts`
- Proper browser automation
- Timeout handling
- Screenshot evidence

## Related Documentation

- [BaseAnalyzer Class](src/core/analyzers/base.analyzer.ts)
- [Analysis Engine](src/core/engine/README.md)
- [Signal Model](src/core/models/signal.model.ts)
- [Testing Guide](docs/development/TESTING_GUIDE.md)
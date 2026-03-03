# Testing Guide

## Testing Philosophy

- **Test behavior, not implementation**: Focus on what the code does, not how
- **Test in isolation**: Unit tests should not depend on external services
- **Test realistic scenarios**: Integration tests should simulate production conditions
- **Aim for >80% coverage**: Code coverage should be above 80%

## Test Types

### Unit Tests (`tests/unit/`)

Test pure logic in isolation:

```typescript
describe('SpfAnalyzer', () => {
  describe('analyze', () => {
    it('should return spf_fail signal when SPF check fails', async () => {
      // Arrange
      const analyzer = new SpfAnalyzer();
      const input = createEmailInput({ spfResult: 'fail' });

      // Act
      const signals = await analyzer.analyze(input);

      // Assert
      expect(signals).toHaveLength(1);
      expect(signals[0]?.signalType).toBe('spf_fail');
      expect(signals[0]?.severity).toBe('high');
      expect(signals[0]?.confidence).toBeGreaterThan(0.8);
    });

    it('should return empty array for non-email input', async () => {
      // Arrange
      const analyzer = new SpfAnalyzer();
      const input = createUrlInput({ url: 'https://example.com' });

      // Act
      const signals = await analyzer.analyze(input);

      // Assert
      expect(signals).toHaveLength(0);
    });
  });
});
```

### Integration Tests (`tests/integration/`)

Test API endpoints and component interactions:

```typescript
describe('Analysis API', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('POST /api/v1/analyze/url', () => {
    it('should analyze a legitimate URL', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'https://www.google.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.verdict).toBeDefined();
      expect(body.score).toBeGreaterThanOrEqual(0);
      expect(body.score).toBeLessThanOrEqual(10);
      expect(body.redFlags).toBeInstanceOf(Array);
    });

    it('should reject invalid URL', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/v1/analyze/url',
        payload: {
          url: 'not-a-valid-url',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });
});
```

## Test Patterns

### Arrange-Act-Assert (AAA)

Structure all tests with AAA pattern:

```typescript
it('should detect suspicious TLD', async () => {
  // Arrange - Set up test data
  const analyzer = new UrlEntropyAnalyzer();
  const input = createUrlInput({ url: 'https://example.tk' });

  // Act - Execute the code under test
  const signals = await analyzer.analyze(input);

  // Assert - Verify the results
  expect(signals).toHaveLength(1);
  expect(signals[0]?.signalType).toBe('suspicious_tld');
});
```

### Test Factories

Create test data with factories for consistency:

```typescript
// test/factories/input.factory.ts
export function createEmailInput(overrides?: Partial<EmailInput>): NormalizedInput {
  return {
    type: 'email',
    id: 'test-email-' + Date.now(),
    timestamp: new Date(),
    data: {
      from: 'sender@example.com',
      to: 'recipient@example.com',
      subject: 'Test Email',
      body: 'This is a test email.',
      headers: {
        'Received-SPF': 'pass',
        'DKIM-Signature': 'valid',
      },
      ...overrides,
    },
  };
}

// Usage in tests
const input = createEmailInput({
  from: 'suspicious@phishing.com',
  headers: { 'Received-SPF': 'fail' },
});
```

### Mock External Dependencies

Mock browser, DNS, HTTP calls:

```typescript
// Mock Playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn(() =>
      Promise.resolve({
        newContext: jest.fn(() =>
          Promise.resolve({
            newPage: jest.fn(() =>
              Promise.resolve({
                goto: jest.fn(),
                $: jest.fn(),
                close: jest.fn(),
              })
            ),
            close: jest.fn(),
          })
        ),
        close: jest.fn(),
      })
    ),
  },
}));

// Mock DNS resolver
jest.mock('dns', () => ({
  promises: {
    resolveTxt: jest.fn(() => Promise.resolve([['v=spf1 include:_spf.google.com ~all']])),
  },
}));
```

### Test Edge Cases

Test boundary conditions and error cases:

```typescript
describe('UrlEntropyAnalyzer', () => {
  it('should handle extremely long URLs', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(10000);
    const input = createUrlInput({ url: longUrl });

    const signals = await analyzer.analyze(input);

    // Should not crash
    expect(signals).toBeDefined();
  });

  it('should handle URLs with special characters', async () => {
    const url = 'https://example.com/path?query=<script>alert(1)</script>';
    const input = createUrlInput({ url });

    const signals = await analyzer.analyze(input);

    expect(signals).toBeDefined();
  });

  it('should handle null/undefined gracefully', async () => {
    const input = createUrlInput({ url: undefined as any });

    await expect(analyzer.analyze(input)).rejects.toThrow();
  });
});
```

## Test Organization

### Describe Blocks

Use nested describe blocks for organization:

```typescript
describe('VerdictService', () => {
  describe('calculateVerdict', () => {
    describe('when score is 0-3', () => {
      it('should return Safe verdict', () => {
        // ...
      });
    });

    describe('when score is 4-6', () => {
      it('should return Suspicious verdict', () => {
        // ...
      });
    });

    describe('when score is 7-10', () => {
      it('should return Malicious verdict', () => {
        // ...
      });
    });
  });
});
```

### Setup and Teardown

Use beforeEach/afterEach for setup:

```typescript
describe('WhitelistService', () => {
  let service: WhitelistService;

  beforeEach(() => {
    service = getWhitelistService();
    service.clear(); // Clean state for each test
  });

  afterEach(() => {
    service.clear();
  });

  it('should add email to whitelist', () => {
    const entry = service.addEntry({
      type: 'email',
      value: 'safe@example.com',
    });

    expect(entry.id).toBeDefined();
    expect(entry.active).toBe(true);
  });
});
```

## Testing Best Practices

### Test One Thing Per Test

❌ **Bad**:
```typescript
it('should validate and analyze input', async () => {
  // Testing too many things
  const validation = await adapter.validate(input);
  expect(validation.isValid).toBe(true);

  const result = await adapter.adapt(input);
  expect(result.type).toBe('email');

  const signals = await analyzer.analyze(result);
  expect(signals.length).toBeGreaterThan(0);
});
```

✅ **Good**:
```typescript
it('should validate input successfully', async () => {
  const validation = await adapter.validate(input);
  expect(validation.isValid).toBe(true);
});

it('should adapt input to normalized format', async () => {
  const result = await adapter.adapt(input);
  expect(result.type).toBe('email');
});

it('should produce signals from analysis', async () => {
  const signals = await analyzer.analyze(input);
  expect(signals.length).toBeGreaterThan(0);
});
```

### Use Descriptive Test Names

Test names should describe what and why:

❌ **Bad**:
```typescript
it('works', () => { ... });
it('test1', () => { ... });
it('should return true', () => { ... });
```

✅ **Good**:
```typescript
it('should return spf_fail signal when SPF check fails', () => { ... });
it('should detect URL shortener domains', () => { ... });
it('should bypass analysis for whitelisted email', () => { ... });
```

### Avoid Test Interdependence

Each test should be independent:

❌ **Bad**:
```typescript
let globalState: any;

it('should create entry', () => {
  globalState = service.addEntry({ ... });
  expect(globalState).toBeDefined();
});

it('should delete entry', () => {
  // Depends on previous test - bad!
  service.deleteEntry(globalState.id);
});
```

✅ **Good**:
```typescript
it('should create entry', () => {
  const entry = service.addEntry({ ... });
  expect(entry).toBeDefined();
});

it('should delete entry', () => {
  const entry = service.addEntry({ ... });
  service.deleteEntry(entry.id);

  expect(service.getEntry(entry.id)).toBeNull();
});
```

### Test Error Cases

Don't just test happy paths:

```typescript
describe('analyzeEmail', () => {
  it('should analyze valid email', async () => {
    // Happy path
  });

  it('should throw ValidationError for invalid email', async () => {
    await expect(analyzeEmail(invalidInput)).rejects.toThrow(ValidationError);
  });

  it('should handle network timeout gracefully', async () => {
    // Mock network timeout
    await expect(analyzeEmail(input)).rejects.toThrow('Timeout');
  });

  it('should continue analysis if one analyzer fails', async () => {
    // Verify graceful degradation
  });
});
```

## Test Coverage

### Run Coverage Reports

```bash
npm run test:coverage
```

### Coverage Goals
- **Overall**: >80%
- **Critical paths**: >95% (analysis engine, verdict calculation)
- **Edge cases**: Test all error paths

### What to Cover

✅ **High Priority**:
- Core business logic (analyzers, verdict calculation)
- Input validation
- Error handling paths
- API endpoints

⚠️ **Lower Priority**:
- Configuration loading
- Logger initialization
- Type definitions

## Running Tests

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

---

**See Also**:
- [Coding Standards](CODING_STANDARDS.md)
- [Error Handling](ERROR_HANDLING.md)
- [Architecture](ARCHITECTURE.md)

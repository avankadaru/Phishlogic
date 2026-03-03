# Architecture Principles

## Overview

PhishLogic follows **Clean Architecture** principles with clear separation of concerns across four distinct layers.

## Layer Structure

### API Layer (`src/api/`)
- **Purpose**: HTTP interface only
- **Responsibilities**: Request handling, response formatting, route definitions
- **No business logic**: All logic delegated to Core and Adapters
- **Framework**: Fastify

### Core Domain (`src/core/`)
- **Purpose**: Pure business logic
- **Characteristics**: Framework-agnostic, testable in isolation
- **Components**: Analyzers, Services, Models, Engine
- **Dependencies**: None (pure domain logic)

### Adapters (`src/adapters/`)
- **Purpose**: Input/output transformations
- **Types**: Input adapters (Raw, Gmail, Outlook), Output adapters (future)
- **Responsibilities**: Transform external data to/from domain models
- **Dependencies**: Core models only

### Infrastructure (`src/infrastructure/`)
- **Purpose**: Technical implementations
- **Components**: Logging, Email service, Browser automation
- **Usage**: Can be used by any layer
- **Examples**: Pino logger, Nodemailer, Playwright

## Dependency Rules

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

**Rules**:
- ✅ Core depends on **nothing** (pure domain logic)
- ✅ API depends on **Core** and **Adapters**
- ✅ Adapters depend on **Core models**
- ✅ Infrastructure can be used by **any layer**

## Design Patterns

### Adapter Pattern

All input sources implement the `InputAdapter<T>` interface:

```typescript
interface InputAdapter<T> {
  adapt(input: T): Promise<NormalizedInput>;
  validate(input: T): Promise<ValidationResult>;
  getType(): InputType;
}
```

**Benefits**:
- Easy addition of new input sources (Gmail, Outlook, Browser Extension)
- No modification to core logic when adding platforms
- Consistent transformation pipeline

**Examples**:
- `RawUrlAdapter` - Direct URL input
- `RawEmailAdapter` - MIME email parsing
- `GmailAdapter` - Gmail API integration (future)
- `OutlookAdapter` - Microsoft Graph API (future)

### Plugin Pattern

All analyzers implement the `IAnalyzer` interface:

```typescript
interface IAnalyzer {
  analyze(input: NormalizedInput): Promise<AnalysisSignal[]>;
  getName(): string;
  getWeight(): number;
  isApplicable(input: NormalizedInput): boolean;
  getType(): 'static' | 'dynamic';
}
```

**Benefits**:
- Analyzers can be added/removed independently
- No coupling between analyzers
- Easy to test in isolation

**Current Analyzers**:
1. **Static** (parallel execution):
   - `UrlEntropyAnalyzer` - Random URL detection
   - `SpfAnalyzer` - Email authentication
   - `DkimAnalyzer` - Email signatures
   - `HeaderAnalyzer` - Phishing keywords

2. **Dynamic** (sequential, conditional):
   - `RedirectAnalyzer` - Redirect chains
   - `FormAnalyzer` - Credential harvesting forms

### Module Patterns

#### Analyzer Pattern

All analyzers extend `BaseAnalyzer`:

```typescript
export class SpfAnalyzer extends BaseAnalyzer {
  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const signals: AnalysisSignal[] = [];
    const spfResult = await this.checkSpf(input.data);

    if (spfResult.status === 'fail') {
      signals.push(
        this.createSignal({
          signalType: 'spf_fail',
          severity: 'high',
          confidence: 0.9,
          description: 'SPF validation failed',
          evidence: { spfResult },
        })
      );
    }

    return signals;
  }

  getName(): string {
    return 'SpfAnalyzer';
  }

  getWeight(): number {
    return 1.5;
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }
}
```

#### Signals and Scoring

- **Each analyzer produces signals**: Observations about the input
- **Signals have confidence scores**: Range from 0 to 1
- **Verdict service aggregates signals**: Combines with analyzer weights
- **Reasoning explains decisions**: Human-readable explanation

## Configuration

- **All magic numbers in config**: No hardcoded values in business logic
- **Environment-based**: Use `.env` files for configuration
- **Validated on startup**: Zod validates all configuration
- **Type-safe**: Configuration is fully typed

## Adding New Components

### Adding a New Analyzer
1. Create file in `src/core/analyzers/static/` or `dynamic/`
2. Extend `BaseAnalyzer` class
3. Implement required methods
4. Add to analyzer registry
5. Update configuration weights
6. Write unit tests

### Adding a New Input Adapter
1. Create file in `src/adapters/input/`
2. Implement `InputAdapter` interface
3. Add adapter selection in controller
4. Create request schema
5. Write integration tests

---

**See Also**:
- [Coding Standards](CODING_STANDARDS.md)
- [Testing Guide](TESTING_GUIDE.md)
- [Implementation Plans](../plans/)

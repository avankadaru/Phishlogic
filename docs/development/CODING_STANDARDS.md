# Coding Standards

## Naming Conventions

### Files
- **Format**: kebab-case
- **Examples**: `spf-analyzer.ts`, `analysis.controller.ts`, `whitelist.service.ts`

### Classes
- **Format**: PascalCase
- **Examples**: `SpfAnalyzer`, `AnalysisEngine`, `WhitelistService`

### Interfaces
- **Format**: PascalCase, prefix with `I` for contracts
- **Examples**: `IAnalyzer`, `InputAdapter<T>`, `ValidationResult`
- **When to use `I` prefix**: For contracts and public interfaces only

### Functions/Methods
- **Format**: camelCase
- **Examples**: `analyzeEmail()`, `validateInput()`, `getWhitelistService()`

### Variables
- **Format**: camelCase
- **Examples**: `analysisResult`, `emailInput`, `verdictScore`

### Constants
- **Format**: UPPER_SNAKE_CASE
- **Examples**: `MAX_REDIRECT_DEPTH`, `MALICIOUS_THRESHOLD`, `DEFAULT_TIMEOUT`

### Enums
- **Format**: PascalCase with UPPER_CASE values
```typescript
enum Verdict {
  SAFE = 'Safe',
  SUSPICIOUS = 'Suspicious',
  MALICIOUS = 'Malicious',
}
```

### Type Aliases
- **Format**: PascalCase
- **Examples**: `Verdict`, `InputType`, `AnalysisSignal`

## File Organization

### One Primary Export Per File
Each file should have one main purpose:
```typescript
// Good
// spf-analyzer.ts
export class SpfAnalyzer extends BaseAnalyzer { ... }

// Bad
// analyzers.ts
export class SpfAnalyzer { ... }
export class DkimAnalyzer { ... }
export class HeaderAnalyzer { ... }
```

### Group Related Types
Keep related interfaces/types in the same file:
```typescript
// models/input.ts
export interface NormalizedInput { ... }
export interface UrlInput { ... }
export interface EmailInput { ... }
export type InputType = 'url' | 'email';
```

### Index Files for Clean Imports
Use `index.ts` to re-export:
```typescript
// analyzers/static/index.ts
export * from './spf-analyzer.js';
export * from './dkim-analyzer.js';
export * from './url-entropy-analyzer.js';
export * from './header-analyzer.js';
```

### Test Files
- **Suffix**: `*.test.ts`
- **Location**: `tests/unit/` or `tests/integration/`
- **Mirror structure**: Match source file structure

## TypeScript Standards

### Strict Mode
All strict compiler options enabled:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true
  }
}
```

### No `any` Types
❌ **Bad**:
```typescript
function analyze(input: any): any {
  return input.data;
}
```

✅ **Good**:
```typescript
function analyze(input: NormalizedInput): AnalysisResult {
  return { verdict: 'Safe', score: 0 };
}
```

If type is truly unknown, use `unknown`:
```typescript
function parseJson(text: string): unknown {
  return JSON.parse(text);
}
```

### Explicit Return Types
All functions must have explicit return types:

❌ **Bad**:
```typescript
async function analyzeEmail(input) {
  return await engine.analyze(input);
}
```

✅ **Good**:
```typescript
async function analyzeEmail(input: NormalizedInput): Promise<AnalysisResult> {
  return await engine.analyze(input);
}
```

### Interfaces vs Types

**Use interfaces for**:
- Public APIs
- Contracts (like `IAnalyzer`)
- When inheritance/extension is needed

**Use types for**:
- Unions and intersections
- Data shapes
- Type aliases
- When extending is not needed

```typescript
// Interface for contract
interface IAnalyzer {
  analyze(input: NormalizedInput): Promise<AnalysisSignal[]>;
}

// Type for data shape
type AnalysisSignal = {
  signalType: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
};

// Type for union
type InputType = 'url' | 'email';
```

## Import Conventions

### ESM Syntax
Always use ES modules with `.js` extension:
```typescript
import { SpfAnalyzer } from './spf-analyzer.js';
import type { IAnalyzer } from '../base/analyzer.interface.js';
```

**Why `.js` extension?**: Required for Node.js ESM compatibility

### Path Mapping
Use path aliases from `tsconfig.json`:
```typescript
// Instead of:
import { logger } from '../../../infrastructure/logging/logger.js';

// Use:
import { logger } from '@/infrastructure/logging/logger.js';
```

### Import Order
1. **External dependencies** (npm packages)
2. **Internal absolute imports** (using path aliases)
3. **Relative imports** (same directory or parent)

```typescript
// 1. External
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// 2. Internal absolute
import { getAnalysisEngine } from '@/core/engine/analysis.engine.js';
import { logger } from '@/infrastructure/logging/logger.js';

// 3. Relative
import { RawUrlAdapter } from '../adapters/raw.adapter.js';
import type { AnalysisRequest } from './analysis.schema.js';
```

### Type-Only Imports
Use `import type` for type-only imports:
```typescript
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { NormalizedInput } from '@/core/models/input.js';
```

## Code Style

### Prefer Const
Use `const` by default, `let` only when reassignment needed:
```typescript
// Good
const maxRetries = 3;
const signals: AnalysisSignal[] = [];

// Avoid
let maxRetries = 3; // Never reassigned
```

### Arrow Functions
Prefer arrow functions for callbacks:
```typescript
// Good
const signals = results
  .filter((r) => r.status === 'fulfilled')
  .map((r) => r.value);

// Acceptable for methods
class Analyzer {
  analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    // ...
  }
}
```

### Destructuring
Use destructuring for cleaner code:
```typescript
// Good
const { verdict, score, redFlags } = result;
const [first, ...rest] = signals;

// Avoid
const verdict = result.verdict;
const score = result.score;
```

### Template Literals
Use template literals for string interpolation:
```typescript
// Good
logger.info(`Analysis completed: ${verdict} (score: ${score})`);

// Avoid
logger.info('Analysis completed: ' + verdict + ' (score: ' + score + ')');
```

## Common Pitfalls to Avoid

1. ❌ **Don't use `any` type**: Always provide proper types
2. ❌ **Don't forget error handling**: Every async operation needs try/catch
3. ❌ **Don't hardcode values**: Use configuration for all constants
4. ❌ **Don't log sensitive data**: Be careful with logging email content
5. ❌ **Don't ignore timeouts**: All external operations need timeouts
6. ❌ **Don't forget to close resources**: Always clean up browsers, connections
7. ❌ **Don't trust external data**: Validate all inputs
8. ❌ **Don't block the event loop**: Use async operations properly

---

**See Also**:
- [Architecture Principles](ARCHITECTURE.md)
- [Error Handling](ERROR_HANDLING.md)
- [Testing Guide](TESTING_GUIDE.md)

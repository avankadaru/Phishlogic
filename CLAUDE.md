# PhishLogic Development Guide

This is the central reference for PhishLogic development standards.

## Project Overview

PhishLogic is a modular phishing detection system built with TypeScript and Node.js. It analyzes URLs and email content to determine if they're Safe, Suspicious, or Malicious, providing clear reasoning for its verdicts.

**Key Features**:
- 6 analyzers (4 static, 2 dynamic)
- 0-10 user-friendly scoring system
- Plain English red flags
- Whitelist system (<5ms bypass)
- REST API with Fastify
- Email alerts via SMTP

## Quick Links

### Development Standards
- [Architecture Principles](docs/development/ARCHITECTURE.md) - Clean architecture, layers, patterns, dependencies
- [Coding Standards](docs/development/CODING_STANDARDS.md) - TypeScript conventions, naming, imports, style
- [Error Handling](docs/development/ERROR_HANDLING.md) - Error patterns, async handling, Result pattern
- [Testing Guide](docs/development/TESTING_GUIDE.md) - Unit/integration tests, patterns, coverage
- [Security Guidelines](docs/development/SECURITY.md) - Sandboxing, input validation, data privacy
- [Logging Standards](docs/development/LOGGING.md) - Structured logging, Pino configuration, security
- [Monitoring Guide](docs/development/MONITORING.md) - Metrics, health checks, alerting, dashboards
- [Deployment Guide](docs/development/DEPLOYMENT.md) - Production deployment, Docker, scaling

### Implementation Plans
- [Browser Extension + Gmail Integration](docs/plans/BROWSER_GMAIL_INTEGRATION_PLAN.md) - Complete plan with timeline, code snippets, verification

### Skills
- [Architecture Verification](.claude/skills/architecture-verification.md) - Verify clean architecture compliance and repository pattern usage
- [PhishLogic Integration Pattern](.claude/skills/phishlogic-integration.md) - Reusable pattern for adding new integrations
- [Add Analyzer](.claude/skills/add-analyzer.md) - Add new static or dynamic analyzers to extend phishing detection capabilities
- [Database Migration](.claude/skills/database-migration.md) - Create and execute database migrations with proper testing, rollback, and deployment procedures
- [Deployment](.claude/skills/deployment.md) - Build, push to ECR, and deploy to AWS ECS production (no-cache, linux/amd64)

## Quick Reference

### Common Commands

```bash
npm run dev                # Start development server (port 3000)
npm test                   # Run all tests (unit + integration)
npm run test:unit          # Run unit tests only
npm run test:integration   # Run integration tests only
npm run test:watch         # Watch mode for TDD
npm run test:coverage      # Generate coverage report
npm run build              # Build TypeScript to dist/
npm run lint               # Run ESLint
npm run format             # Run Prettier
npm run type-check         # TypeScript type checking
```

### Quick Patterns

**Add New Analyzer** (3 steps):
1. Create `src/core/analyzers/static/my-analyzer.ts` or `dynamic/`
2. Extend `BaseAnalyzer`, implement `analyze()`, `getName()`, `getWeight()`, `getType()`
3. Register in `src/core/engine/analyzer.ts` registry

**Add Input Adapter** (5 steps):
1. Create `src/adapters/input/platform.adapter.ts`
2. Implement `InputAdapter<T>` interface (`validate`, `adapt`, `getType`)
3. Add controller in `src/api/controllers/platform.controller.ts`
4. Add routes in `src/api/routes/index.ts`
5. Add config in `src/config/app.config.ts`

**Test Structure** (AAA Pattern):
```typescript
describe('Component', () => {
  it('should do something specific', async () => {
    // Arrange - Set up test data
    const input = createTestInput();

    // Act - Execute the code
    const result = await component.method(input);

    // Assert - Verify results
    expect(result).toBeDefined();
    expect(result.verdict).toBe('Safe');
  });
});
```

## Project Structure

```
PhishLogic/
├── src/
│   ├── api/                    # HTTP layer (Fastify)
│   │   ├── controllers/        # Request handlers
│   │   ├── routes/             # Route definitions
│   │   └── schemas/            # Zod validation schemas
│   ├── core/                   # Business logic (framework-agnostic)
│   │   ├── analyzers/          # Signal detection (6 analyzers)
│   │   │   ├── static/         # Fast analyzers (SPF, DKIM, URL patterns)
│   │   │   └── dynamic/        # Browser-based (form detection, redirects)
│   │   ├── engine/             # Analysis orchestration
│   │   ├── models/             # Domain types & interfaces
│   │   └── services/           # Verdict calculation, whitelist
│   ├── adapters/               # Input transformations
│   │   └── input/              # Platform-specific adapters
│   ├── infrastructure/         # Technical concerns
│   │   ├── logging/            # Pino logger
│   │   └── email/              # SMTP alerts
│   └── config/                 # Configuration (Zod schemas)
├── tests/
│   ├── unit/                   # Isolated component tests
│   └── integration/            # API endpoint tests
├── docs/
│   ├── development/            # Development standards
│   └── plans/                  # Implementation plans
└── browser-extension/          # Chrome/Firefox extension
    └── gmail-addon/            # Google Apps Script add-on
```

### Key Patterns

- **Clean Architecture**: Core has no dependencies on external frameworks
- **Adapter Pattern**: All input sources implement `InputAdapter<T>`
- **Plugin Pattern**: All analyzers implement `IAnalyzer` interface
- **Result Pattern**: Use `Result<T, E>` for expected failures
- **Promise.allSettled**: For parallel operations that can fail independently

## Code Review Checklist

Before submitting PR:
- [ ] TypeScript strict checks pass
- [ ] Tests added/updated
- [ ] No `console.log` statements (use logger)
- [ ] Error handling present
- [ ] Documentation updated
- [ ] No hardcoded values (use config)
- [ ] Security implications considered
- [ ] Performance tested

## Common Pitfalls

1. ❌ Don't use `any` type - Use proper types
2. ❌ Don't forget error handling - Wrap async in try/catch
3. ❌ Don't hardcode values - Use configuration
4. ❌ Don't log sensitive data - Be careful with PII
5. ❌ Don't ignore timeouts - All external ops need timeouts
6. ❌ Don't trust external data - Validate all inputs

## Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Fastify Documentation](https://www.fastify.io/docs/latest/)
- [Zod Documentation](https://zod.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Pino Documentation](https://getpino.io/)

---

**Remember**: When in doubt, refer to the focused documentation files above. Each topic has its own detailed guide for better context management and faster reference lookups.

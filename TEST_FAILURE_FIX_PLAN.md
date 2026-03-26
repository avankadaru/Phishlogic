# Fix All Test Failures - Comprehensive Test Suite Repair

## Context

**Current Status**: 9 test suites total, **9 failed**, 14 tests failed, 21 tests passed (35 tests total).

The TypeScript build is now **100% clean** (128 errors → 0 ✅), but the test suite has multiple categories of failures:

1. **ESM Module Import Issues** (2 test suites blocked): `whois` dependency is pure ESM, Jest can't parse it
2. **Test Expectation Mismatches** (1 test): url-entropy weight expects 1.0, actual is 1.2
3. **Invalid Test Data** (4 tests): Using invalid UUID strings ("non-existent", "1") causing PostgreSQL errors
4. **Missing Required Fields** (1 test): createApiKey missing required `name` field
5. **Incomplete Mock Setup** (6 tests): Database queries not properly mocked, tests hit real DB

**Impact**: Cannot run test suite cleanly, blocks CI/CD, hides real test failures.

**Critical**: These failures violate our documented development standards in `docs/development/`:
- ❌ **TESTING_GUIDE.md** - Not using test factories, incomplete mocks
- ❌ **SECURITY.md** - Missing input validation (UUID format)
- ❌ **ERROR_HANDLING.md** - Controllers not handling validation errors properly

**This plan explicitly follows established standards** documented in CLAUDE.md and docs/development/.

---

## Test Failure Categories and Root Causes

### Category 1: ESM Module Parse Errors (Blocks 2 Test Suites)

**Affected Files**:
- `tests/unit/analyzers/sender-reputation.analyzer.test.ts` ❌ CANNOT RUN
- `tests/integration/api/analysis.test.ts` ❌ CANNOT RUN

**Error**:
```
SyntaxError: Cannot use import statement outside a module
/node_modules/whois/index.js:1
import net from "net";
^^^^^^
```

**Root Cause**:
- `sender-reputation.analyzer.ts` imports `whois-json@2.0.4` (CommonJS)
- `whois-json` requires `whois@2.16.1` (Pure ESM with `import` statements)
- Jest + ts-jest cannot transform pure ESM in `node_modules` by default
- No `transformIgnorePatterns` configured in `jest.config.js`

**Dependency Chain**:
```
src/core/analyzers/reputation/sender-reputation.analyzer.ts (line 14)
  → import whois from 'whois-json'
    → whois-json/index.js (line 2): require('whois')
      → whois/index.js (line 1): import net from "net" ❌ ESM syntax
```

---


---

### Category 2: Test Expectation Mismatch (1 Test)

**Affected Test**: `tests/unit/analyzers/url-entropy.analyzer.test.ts:23`

**Error**: `Expected: 1.0, Received: 1.2`

**Root Cause**:
- Test expects `getWeight()` to return `1.0`
- Actual implementation in `src/core/analyzers/static/url-entropy.analyzer.ts:30` returns `this.config.analysis.analyzerWeights.urlEntropy`
- Config default in `src/config/app.config.ts:55` is `1.2` (not 1.0)
- **The weight was updated from 1.0 to 1.2 but test wasn't updated**

---

### Category 3: Invalid UUID Test Data (4 Tests)

**Affected Tests**:
1. `tests/unit/admin/auth.controller.test.ts:323` - revokeApiKey success
2. `tests/unit/admin/auth.controller.test.ts:340` - revokeApiKey non-existent
3. `tests/unit/admin/whitelist.controller.test.ts:148` - deleteWhitelistEntry

**Error Example**: `invalid input syntax for type uuid: "non-existent"`

**Root Cause**:
- Tests use string literals like `"non-existent"` or `"1"` as UUID parameters
- PostgreSQL UUID columns reject invalid format with error code `22P02`
- Controllers pass these directly to database queries without validation
- Database throws 500 error instead of graceful 404

**Example from auth.controller.test.ts:333**:
```typescript
params: { id: 'non-existent' }  // ❌ Should be valid UUID
```

---

### Category 4: Missing Required Fields (1 Test)

**Affected Test**: `tests/unit/admin/auth.controller.test.ts:230` - createApiKey

**Root Cause**:
- Test request body: `{ userName: 'John Doe', userEmail: 'john@example.com' }`
- Schema in `auth.controller.ts:22` requires `name` field: `z.object({ name: z.string().min(1), ... })`
- Missing required field causes Zod validation error (400)

---

### Category 5: Incomplete Mock Setup (6 Tests)

**Affected Tests**:
1. `tests/unit/admin/auth.controller.test.ts:63` - loginAdmin JWT decode
2. `tests/unit/admin/auth.controller.test.ts:115` - deactivated admin login
3. `tests/unit/admin/auth.controller.test.ts:157` - loginUser success
4. `tests/unit/admin/auth.controller.test.ts:213` - expired API key
5. `tests/unit/admin/auth.controller.test.ts:295` - listApiKeys
6. `tests/unit/admin/whitelist.controller.test.ts:193` - getWhitelistStats

**Root Cause**:
- `mockQuery` in `test-helpers.ts` mocks database queries
- BUT: Some tests don't mock ALL queries made by the controller
- Result: Real database is queried, returns unexpected data
- Example: `listApiKeys` test expects 2 items (mocked), gets 1 item (real DB)

**Why This Happens**:
- Controllers make multiple sequential queries
- Tests mock the first query but forget subsequent ones
- When mock exhausted, Jest falls through to real database client

---

## Compliance with Documented Standards

Our test fixes MUST align with established PhishLogic development standards:

### From `docs/development/TESTING_GUIDE.md`:

**1. Test Factories (lines 121-151)** - Use factory functions for test data:
```typescript
// STANDARD: Create reusable test data factories
export function createMockUUID(prefix: string = 'test'): string {
  return `550e8400-e29b-41d4-a716-44665544${prefix.padStart(4, '0')}`;
}
```
✅ **Our Fix**: Replace hardcoded UUIDs with valid UUID format (GROUP 3)

**2. Mock External Dependencies (lines 153-187)** - Proper mocking pattern:
```typescript
// STANDARD: Mock at module level with jest.mock()
jest.mock('external-module', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(/* ... */),
}));
```
✅ **Our Fix**: Mock whois-json following this exact pattern (GROUP 1)

**3. AAA Pattern (lines 102-119)** - Arrange-Act-Assert structure:
- Arrange: Set up test data
- Act: Execute code under test
- Assert: Verify results

✅ **Our Fix**: All test updates maintain AAA structure

### From `docs/development/SECURITY.md`:

**4. Input Validation (lines 106-149)** - Validate all inputs with Zod:
```typescript
// STANDARD: Validate before processing
const UuidSchema = z.string().uuid();
const validated = UuidSchema.parse(request.params.id);
```
❌ **Current Gap**: Controllers accept invalid UUIDs without validation
✅ **Proposed Fix**: Add UUID validation in controllers (OPTIONAL GROUP 6)

### From `docs/development/ERROR_HANDLING.md`:

**5. Never Swallow Errors (lines 60-80)** - Always log and handle:
```typescript
// STANDARD: Log errors with context
catch (error) {
  logger.error({ msg: 'Operation failed', context, error });
  throw error; // or return error response
}
```
✅ **Our Fix**: Tests properly expect and handle errors

---

## Implementation Plan (Following Standards)

### GROUP 1: Mock whois-json Module (10 min)

**Goal**: Unblock 2 test suites that can't parse whois ESM dependency

**Follows**: `docs/development/TESTING_GUIDE.md` lines 153-187 (Mock External Dependencies pattern)

**Approach**: Add Jest mock for `whois-json` following documented pattern

**File to Update**: `tests/unit/analyzers/sender-reputation.analyzer.test.ts`

Add at the top (after imports), **following TESTING_GUIDE.md mock pattern**:
```typescript
// Mock external ESM dependency (TESTING_GUIDE.md pattern)
jest.mock('whois-json', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({
    createdDate: new Date('2020-01-01'),
    updatedDate: new Date('2024-01-01'),
    registrantOrganization: 'Example Corp',
    registrantCountry: 'US',
    domainName: 'example.com',
  }),
}));
```

**Verification**: 
```bash
npm run test:unit -- sender-reputation.analyzer.test.ts
# Should run without parse errors
```

---

### GROUP 2: Fix url-entropy Weight Test (2 min)

**Goal**: Update test expectation to match actual config default

**File**: `tests/unit/analyzers/url-entropy.analyzer.test.ts`

**Line 23**: Change expectation from `1.0` to `1.2`

```typescript
// Before:
expect(analyzer.getWeight()).toBe(1.0);

// After:
expect(analyzer.getWeight()).toBe(1.2);
```

**Verification**:
```bash
npm run test:unit -- url-entropy.analyzer.test.ts
# Should pass: getWeight test
```

---

### GROUP 3: Fix Invalid UUID Test Data (15 min)

**Goal**: Replace invalid UUID strings with valid UUID format using test factory pattern

**Follows**: `docs/development/TESTING_GUIDE.md` lines 121-151 (Test Factories pattern)

**Step 1**: Add UUID test factory to `tests/unit/admin/test-helpers.ts`:
```typescript
/**
 * Create test UUID (TESTING_GUIDE.md factory pattern)
 * @param seed - Unique identifier for this test UUID
 */
export function createTestUUID(seed: number = 0): string {
  const paddedSeed = seed.toString().padStart(12, '0');
  return `550e8400-e29b-41d4-a716-${paddedSeed}`;
}

// Predefined UUIDs for common test scenarios
export const TEST_UUIDS = {
  EXISTING_USER: createTestUUID(1),
  EXISTING_KEY: createTestUUID(2),
  NON_EXISTENT: createTestUUID(9999),
  WHITELIST_ENTRY: createTestUUID(100),
} as const;
```

**Step 2**: Update test files to use factory

**File**: `tests/unit/admin/auth.controller.test.ts`

**Fix 1 - Line 333** (revokeApiKey non-existent):
```typescript
// Before:
params: { id: 'non-existent' }

// After (using factory):
params: { id: TEST_UUIDS.NON_EXISTENT }  // Valid UUID, semantically clear
```

**Fix 2 - Line 316** (revokeApiKey success):
```typescript
// Before:
params: { id: '550e8400-e29b-41d4-a716-446655440001' }

// After (using factory):
params: { id: TEST_UUIDS.EXISTING_KEY }

// Ensure all 3 database queries are mocked (complete mock chain):
mockQuery
  .mockResolvedValueOnce(createMockQueryResult([{ user_name: 'test-user' }]))  // SELECT query
  .mockResolvedValueOnce(createMockQueryResult([]))  // UPDATE query
  .mockResolvedValueOnce(createMockQueryResult([]));  // INSERT audit log
```

**File**: `tests/unit/admin/whitelist.controller.test.ts`

**Fix 3 - Line 148** (deleteWhitelistEntry):
```typescript
// Before:
params: { id: '1' }  // Invalid UUID format

// After (using factory):
params: { id: TEST_UUIDS.WHITELIST_ENTRY }  // Valid UUID, semantic name
```

**Verification**:
```bash
npm run test:unit -- auth.controller.test.ts
npm run test:unit -- whitelist.controller.test.ts
# Should not see UUID parse errors
```

---

### GROUP 4: Add Missing Required Fields (2 min)

**Goal**: Add required `name` field to createApiKey test

**File**: `tests/unit/admin/auth.controller.test.ts`

**Line 230** - Add `name` field to request body:
```typescript
// Before:
body: {
  userName: 'John Doe',
  userEmail: 'john@example.com',
},

// After:
body: {
  name: 'API Key for John Doe',  // Required field
  userName: 'John Doe',
  userEmail: 'john@example.com',
},
```

**Verification**:
```bash
npm run test:unit -- auth.controller.test.ts
# createApiKey test should pass validation
```

---

### GROUP 5: Fix Incomplete Mock Setups (20 min)

**Goal**: Ensure all database queries are properly mocked in each test

**File**: `tests/unit/admin/auth.controller.test.ts`

**Fix 1 - deactivated admin test (line 115)**:
Ensure mock returns is_active: false

**Fix 2 - loginUser test (line 157)**:
Add complete mock chain for user login (SELECT api_keys, UPDATE last_used_at)

**Fix 3 - expired API key test (line 213)**:
Ensure expires_at is in the past

**Fix 4 - listApiKeys test (line 295)**:
Mock should return 2 API keys as expected

**File**: `tests/unit/admin/whitelist.controller.test.ts`

**Fix 5 - getWhitelistStats test (line 193)**:
Mock the topMatched query to return exactly 1 item

**Verification**:
```bash
npm run test:unit -- auth.controller.test.ts
npm run test:unit -- whitelist.controller.test.ts
# All mock-related failures should resolve
```

---

### GROUP 6: Add UUID Validation to Controllers (15 min) - OPTIONAL

**Goal**: Prevent 500 errors from invalid UUID format, return 400 instead (production safety)

**Follows**: `docs/development/SECURITY.md` lines 106-149 (Input Validation pattern)

**Why Optional**: Tests should use valid UUIDs (GROUP 3), but this adds production safety per SECURITY.md

**File**: `src/api/controllers/auth.controller.ts`

**Add Zod validation schema following SECURITY.md pattern**:
```typescript
import { z } from 'zod';

// UUID validation schema (SECURITY.md pattern)
const UuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

// Helper function for validation
function validateUuidParam(
  id: string,
  reply: FastifyReply
): boolean {
  try {
    UuidParamSchema.parse({ id });
    return true;
  } catch (error) {
    reply.status(400).send({
      success: false,
      error: 'Invalid UUID format',
    });
    return false;
  }
}
```

**Use in revokeApiKey (line 420)**:
```typescript
export async function revokeApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id } = request.params;

  // Validate UUID format (SECURITY.md input validation)
  if (!validateUuidParam(id, reply)) {
    return;
  }

  // Continue with query...
}
```

**File**: `src/api/controllers/admin/whitelist.controller.ts`

Apply same pattern to:
- `deleteWhitelistEntry` (line ~430)
- `getWhitelistEntry` (line ~180)
- `updateWhitelistEntry` (line ~320)

**Benefits**:
- ✅ Follows SECURITY.md input validation standards
- ✅ Returns 400 (client error) instead of 500 (server error)
- ✅ Prevents PostgreSQL parse errors reaching logs
- ✅ Better API error messages for consumers

---

## Execution Order

1. **GROUP 1** - Mock whois-json (10 min) - Unblocks 2 test suites
2. **GROUP 2** - Fix url-entropy weight (2 min) - Quick win
3. **GROUP 4** - Add missing fields (2 min) - Quick win
4. **GROUP 3** - Fix invalid UUIDs with factories (20 min) - Core issue + standards compliance
5. **GROUP 5** - Fix incomplete mocks (20 min) - Most complex
6. **GROUP 6** - UUID validation (15 min) - OPTIONAL production safety

**Total estimated time**: 54 minutes (69 minutes with optional GROUP 6)

---

## Final Verification

After completing all groups, run full test suite:

```bash
# Run all tests
npm test

# Expected results:
# - Test Suites: 9 passed, 9 total ✅
# - Tests: 35 passed, 35 total ✅
```

**Individual test verification**:
```bash
npm run test:unit -- url-entropy.analyzer.test.ts
npm run test:unit -- sender-reputation.analyzer.test.ts
npm run test:unit -- auth.controller.test.ts
npm run test:unit -- whitelist.controller.test.ts
```

---

## Success Criteria

- [ ] `npm test` exits with code 0
- [ ] All 9 test suites pass
- [ ] All 35 tests pass
- [ ] No Jest parse errors from whois-json/whois modules
- [ ] No PostgreSQL UUID validation errors in test output
- [ ] No "missing required field" validation errors

---

## Critical Files to Modify

### Test Files (Following TESTING_GUIDE.md):
1. `tests/unit/admin/test-helpers.ts` - Add UUID factory functions (GROUP 3)
2. `tests/unit/analyzers/sender-reputation.analyzer.test.ts` - Add whois-json mock (GROUP 1)
3. `tests/unit/analyzers/url-entropy.analyzer.test.ts` - Update weight expectation (GROUP 2)
4. `tests/unit/admin/auth.controller.test.ts` - Fix UUIDs, fields, mocks (GROUPS 3, 4, 5)
5. `tests/unit/admin/whitelist.controller.test.ts` - Fix UUID, mocks (GROUPS 3, 5)

### Production Files (Following SECURITY.md) - OPTIONAL:
6. `src/api/controllers/auth.controller.ts` - Add UUID validation (GROUP 6)
7. `src/api/controllers/admin/whitelist.controller.ts` - Add UUID validation (GROUP 6)

---

## Standards Compliance Matrix

| Group | Fix Category | Documented Standard | Reference |
|-------|-------------|---------------------|-----------|
| GROUP 1 | Mock whois-json | Mock External Dependencies | TESTING_GUIDE.md lines 153-187 |
| GROUP 2 | Update weight test | Test expectations match code | TESTING_GUIDE.md lines 102-119 (AAA) |
| GROUP 3 | UUID test factories | Test Factories pattern | TESTING_GUIDE.md lines 121-151 |
| GROUP 4 | Add required fields | Zod schema validation | SECURITY.md lines 106-123 |
| GROUP 5 | Complete mocks | Isolate unit tests | TESTING_GUIDE.md lines 13-16 |
| GROUP 6 | UUID validation | Input Validation | SECURITY.md lines 106-149 |

---

## References

**Development Documentation**:
- [CLAUDE.md](../CLAUDE.md) - Central development guide
- [TESTING_GUIDE.md](../docs/development/TESTING_GUIDE.md) - Test patterns and factories
- [SECURITY.md](../docs/development/SECURITY.md) - Input validation with Zod
- [ERROR_HANDLING.md](../docs/development/ERROR_HANDLING.md) - Error patterns
- [CODING_STANDARDS.md](../docs/development/CODING_STANDARDS.md) - Naming and organization

**This plan ensures all fixes align with established PhishLogic development standards.**

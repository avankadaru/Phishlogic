## Database Design Principles & Patterns

### Core Principles

1. **No Direct DB Calls** - All database access through Repository layer
2. **JSONB-First** - Prefer JSONB over columns for flexibility
3. **Additive-Only Schema** - Add columns, never rename/delete
4. **Views for Format** - Use views when data needs specific format
5. **Performance-Critical Only** - Only add columns if absolutely necessary for performance

---

## 1. Repository Pattern - No Direct DB Calls

### ❌ **Anti-Pattern: Direct DB Calls**

```typescript
// BAD: Direct DB access scattered throughout code
async function analyzeEmail(input: EmailInput) {
  // Direct query in controller
  const result = await query('SELECT * FROM analyses WHERE id = $1', [id]);

  // Direct query in service
  await query('INSERT INTO analyses ...', [values]);

  // Direct query in another service
  const stats = await query('SELECT COUNT(*) FROM analyses ...', []);
}
```

**Problems:**
- ❌ Scattered SQL across codebase
- ❌ Hard to change schema (SQL everywhere)
- ❌ No single source of truth
- ❌ Hard to test (can't mock DB)
- ❌ Duplicate queries
- ❌ SQL injection risks

### ✅ **Pattern: Repository Layer**

```typescript
// GOOD: All DB access through repository
async function analyzeEmail(input: EmailInput) {
  const analysisRepo = getAnalysisRepository();

  // Clean, business-focused methods
  const existing = await analysisRepo.findById(id);
  await analysisRepo.insert(analysis);
  const stats = await analysisRepo.count({ verdict: 'Malicious' });
}
```

**Benefits:**
- ✅ Single point of database access
- ✅ Easy to change schema (one place to update)
- ✅ Easy to test (mock repository)
- ✅ Reusable queries
- ✅ Type-safe
- ✅ Centralized security

---

## 2. JSONB-First Approach

### Principle: Prefer JSONB over adding columns

**When to use JSONB:**
- ✅ Flexible/evolving data structures
- ✅ Optional metadata
- ✅ Provider-specific data
- ✅ Debug information
- ✅ Non-critical query fields

**When to use columns:**
- ✅ Required for foreign keys
- ✅ Frequently filtered/sorted
- ✅ Critical for query performance
- ✅ Strict type enforcement needed

### Example: AI Metadata

#### ❌ **Anti-Pattern: Many Columns**

```sql
-- BAD: Adding 10+ columns for AI metadata
ALTER TABLE analyses ADD COLUMN ai_provider VARCHAR(50);
ALTER TABLE analyses ADD COLUMN ai_model VARCHAR(100);
ALTER TABLE analyses ADD COLUMN ai_prompt_tokens INTEGER;
ALTER TABLE analyses ADD COLUMN ai_completion_tokens INTEGER;
ALTER TABLE analyses ADD COLUMN ai_total_tokens INTEGER;
ALTER TABLE analyses ADD COLUMN ai_temperature DECIMAL(3,2);
ALTER TABLE analyses ADD COLUMN ai_latency_ms INTEGER;
ALTER TABLE analyses ADD COLUMN ai_cost_usd DECIMAL(10,6);
ALTER TABLE analyses ADD COLUMN ai_reasoning_steps TEXT;
ALTER TABLE analyses ADD COLUMN ai_model_version VARCHAR(50);
-- ... and it keeps growing!
```

**Problems:**
- ❌ Schema bloat (10+ columns)
- ❌ Rigid structure (can't add fields)
- ❌ Migration required for each new field
- ❌ Null columns if AI not used
- ❌ Different providers have different metadata

#### ✅ **Pattern: JSONB Column**

```sql
-- GOOD: Single JSONB column
ALTER TABLE analyses ADD COLUMN ai_metadata JSONB DEFAULT '{}';

-- GIN index for fast queries
CREATE INDEX idx_analyses_ai_metadata_gin
ON analyses USING GIN (ai_metadata);
```

**Usage:**

```typescript
// Store any structure
const aiMetadata = {
  provider: 'anthropic',
  model: 'claude-3-5-sonnet',
  tokens: { prompt: 150, completion: 200, total: 350 },
  temperature: 0.7,
  latency_ms: 1234,
  cost_usd: 0.0042,
  // Add new fields anytime!
  reasoning_steps: [...],
  model_version: '20241022',
  custom_provider_field: 'value',
};

await analysisRepo.insert({
  ...analysis,
  aiMetadata,  // Just store the object
});

// Query efficiently with GIN index
const anthropicAnalyses = await analysisRepo.findByAIProvider('anthropic');

// Complex queries without adding columns
const sql = `
  SELECT * FROM analyses
  WHERE (ai_metadata->'tokens'->>'total')::INTEGER > 1000
  AND ai_metadata->>'provider' = 'anthropic'
`;
```

**Benefits:**
- ✅ Single column (no schema bloat)
- ✅ Flexible (add fields anytime)
- ✅ No migration for new fields
- ✅ Fast queries with GIN index
- ✅ Provider-agnostic

### Performance Considerations

**JSONB with GIN index is fast:**
```sql
-- Uses GIN index (fast)
SELECT * FROM analyses
WHERE ai_metadata @> '{"provider": "anthropic"}'::jsonb;

-- Uses GIN index (fast)
SELECT * FROM analyses
WHERE ai_metadata->>'provider' = 'anthropic';

-- Without index (slower, but still reasonable)
SELECT * FROM analyses
WHERE (ai_metadata->'tokens'->>'total')::INTEGER > 1000;
```

**When to add column instead:**
```sql
-- If you query by provider 1000x/second, consider column:
ALTER TABLE analyses ADD COLUMN ai_provider VARCHAR(50)
  GENERATED ALWAYS AS (ai_metadata->>'provider') STORED;
CREATE INDEX idx_analyses_ai_provider ON analyses(ai_provider);

-- But usually GIN index is sufficient!
```

---

## 3. Additive-Only Schema Changes

### Principle: Never rename or delete columns

**Allowed:**
- ✅ Add new columns
- ✅ Add indexes
- ✅ Add views
- ✅ Add constraints (if backward compatible)

**Not Allowed:**
- ❌ Rename columns
- ❌ Delete columns
- ❌ Change column types
- ❌ Remove indexes
- ❌ Break backward compatibility

### Example: Column Renaming

#### ❌ **Anti-Pattern: Rename Column**

```sql
-- BAD: Renaming breaks existing code
ALTER TABLE analyses RENAME COLUMN confidence TO confidence_score;
```

**What breaks:**
```typescript
// All existing queries break
const result = await query('SELECT confidence FROM analyses');  // ❌ Error!

// All existing code breaks
const confidence = analysis.confidence;  // ❌ undefined!

// All integrations break
// Chrome extension, Gmail add-on, etc.
```

#### ✅ **Pattern: Add Column + View**

```sql
-- GOOD: Keep old column, add view for new name
-- Option 1: Just use a view (zero changes to table)
CREATE OR REPLACE VIEW analyses_v2 AS
SELECT
  id,
  confidence AS confidence_score,  -- Alias
  -- ... other columns
FROM analyses;

-- Option 2: If absolutely necessary, add generated column
ALTER TABLE analyses
ADD COLUMN confidence_score DECIMAL(4,3)
GENERATED ALWAYS AS (confidence) STORED;
```

**Migration strategy:**
```typescript
// Old code continues working
const result = await query('SELECT confidence FROM analyses');  // ✅ Works

// New code uses view or new column
const result = await query('SELECT confidence_score FROM analyses_v2');  // ✅ Works

// Gradual migration over time
// No breaking changes
```

### Example: Deleting Column

#### ❌ **Anti-Pattern: Delete Column**

```sql
-- BAD: Deleting breaks all readers
ALTER TABLE analyses DROP COLUMN old_field;
```

#### ✅ **Pattern: Deprecate, then Remove**

```sql
-- Step 1: Mark as deprecated (documentation)
COMMENT ON COLUMN analyses.old_field IS 'DEPRECATED: Use new_field instead. Will be removed in v2.0';

-- Step 2: Stop writing to it (code changes)
-- ... wait 6 months ...

-- Step 3: Verify no reads (query logs)
SELECT * FROM pg_stat_user_tables WHERE schemaname = 'public';

-- Step 4: Only then consider removal
-- (Usually just leave it - storage is cheap)
```

---

## 4. Views for Specific Formats

### Principle: Use views, not schema changes

**When you need:**
- Different column names (legacy compatibility)
- Computed columns (aggregations)
- Denormalized data (joins)
- Filtered data (security)

**Don't:**
- ❌ Rename columns in table
- ❌ Add computed columns to table
- ❌ Duplicate data in table

**Do:**
- ✅ Create view with desired format
- ✅ Keep table schema stable

### Example: Debug Controller Needs Different Names

#### ❌ **Anti-Pattern: Change Table Schema**

```sql
-- BAD: Changing table to match one consumer
ALTER TABLE analyses RENAME COLUMN confidence TO confidence_score;
ALTER TABLE analyses RENAME COLUMN duration_ms TO processing_time_ms;
-- Breaks everything else!
```

#### ✅ **Pattern: Create View**

```sql
-- GOOD: View provides desired format
CREATE OR REPLACE VIEW analyses_debug_view AS
SELECT
  id,
  confidence AS confidence_score,        -- Alias
  duration_ms AS processing_time_ms,     -- Alias
  red_flags AS risk_factors,             -- Alias

  -- Extract JSONB fields as columns (for convenience)
  (ai_metadata->>'provider')::VARCHAR(50) AS ai_provider,
  (ai_metadata->>'model')::VARCHAR(100) AS ai_model,
  (ai_metadata->'tokens'->>'total')::INTEGER AS ai_tokens_total,

  -- Keep original columns too
  confidence,
  duration_ms,
  red_flags,
  ai_metadata
FROM analyses;
```

**Usage:**

```typescript
// Debug controller queries view
const result = await query('SELECT * FROM analyses_debug_view WHERE ...');

// Other code queries table directly
const result = await query('SELECT * FROM analyses WHERE ...');

// Both work, no conflicts
```

---

## 5. Performance-Critical Columns Only

### Principle: Only add columns for critical performance needs

**Before adding a column, ask:**
1. Can JSONB + GIN index handle this? (Usually yes)
2. Is this query critical path? (< 1% of queries are)
3. Is JSONB query too slow? (Measure first!)
4. Will we query this 1000x/second? (Probably not)

### Performance Comparison

```sql
-- JSONB query with GIN index
SELECT * FROM analyses
WHERE ai_metadata @> '{"provider": "anthropic"}'::jsonb;
-- ~10-50ms on 1M rows with GIN index

-- Regular column query
SELECT * FROM analyses
WHERE ai_provider = 'anthropic';
-- ~5-20ms on 1M rows with B-tree index

-- Difference: ~2-3x, usually not worth the schema bloat
```

### When to Add Column

**Add column if:**
- ✅ Queried 100+ times/second
- ✅ JSONB query measured too slow (> 100ms)
- ✅ Critical user-facing feature (e.g., verdict filter)
- ✅ Foreign key relationship

**Use JSONB if:**
- ✅ Queried < 10 times/second
- ✅ JSONB query fast enough (< 50ms)
- ✅ Debug/admin feature (not user-facing)
- ✅ Metadata/optional field

### Example: Should we add `ai_provider` column?

**Analysis:**
```typescript
// Query frequency: ~5 queries/minute (from logs)
// Query time with GIN index: ~15ms
// Query time with column: ~8ms
// Improvement: 7ms, 0.08 queries/second

// Decision: NOT worth it
// - Infrequent queries (5/min, not 100/sec)
// - Fast enough with JSONB (15ms < 50ms threshold)
// - Saves schema bloat
```

**When to reconsider:**
```typescript
// If usage grows to 1000 queries/second
// AND JSONB query time degrades (> 100ms)
// THEN add column:

ALTER TABLE analyses
ADD COLUMN ai_provider VARCHAR(50)
GENERATED ALWAYS AS (ai_metadata->>'provider') STORED;

CREATE INDEX idx_analyses_ai_provider ON analyses(ai_provider);

// But measure first!
```

---

## Migration Strategy

### Adding New Feature (e.g., Cost Tracking)

```sql
-- Step 1: Add JSONB column (flexible)
ALTER TABLE analyses ADD COLUMN cost_metadata JSONB DEFAULT '{}';
CREATE INDEX idx_analyses_cost_metadata_gin ON analyses USING GIN (cost_metadata);

-- Step 2: Use it in code
INSERT INTO analyses (..., cost_metadata) VALUES (
  ...,
  '{"compute_cost": 0.01, "storage_cost": 0.001, "network_cost": 0.005}'::jsonb
);

-- Step 3: Query it
SELECT * FROM analyses
WHERE (cost_metadata->>'compute_cost')::DECIMAL > 0.05;

-- Step 4: IF performance becomes issue (measured!), THEN consider column
-- But usually not needed!
```

### Deprecating Old Field

```sql
-- Step 1: Document deprecation
COMMENT ON COLUMN analyses.old_field IS
  'DEPRECATED v1.5: Use new_jsonb->field instead. Removal planned v2.0 (2025-Q4)';

-- Step 2: Add new JSONB field
-- (Already exists - ai_metadata, timing_metadata, etc.)

-- Step 3: Write to both during transition
UPDATE analyses SET
  old_field = 123,
  ai_metadata = jsonb_set(ai_metadata, '{field}', '123');

-- Step 4: Stop writing to old_field
-- Step 5: Wait 6 months
-- Step 6: Check usage (should be zero)
-- Step 7: Keep column (storage cheap) or drop if certain
```

---

## Repository Pattern Benefits

### Single Source of Truth

```typescript
// All queries in one place
class AnalysisRepository {
  findById(id: string): Promise<Analysis | null>
  findByVerdict(verdict: string): Promise<Analysis[]>
  findByAIProvider(provider: string): Promise<Analysis[]>
  findWithErrors(): Promise<Analysis[]>
  getAICostByProvider(): Promise<CostSummary[]>
}

// Changes require updating repository only
// All consumers benefit automatically
```

### Easy to Test

```typescript
// Mock repository in tests
const mockRepo = {
  findById: jest.fn().mockResolvedValue(mockAnalysis),
  insert: jest.fn().mockResolvedValue(mockAnalysis),
};

// Inject into service
const service = new AnalysisEngine(mockRepo);

// Test without database
await service.analyze(input);
expect(mockRepo.insert).toHaveBeenCalled();
```

### Easy to Optimize

```typescript
// Add caching in repository (transparent to consumers)
class AnalysisRepository {
  private cache = new Map();

  async findById(id: string): Promise<Analysis | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id);
    }

    const result = await this.executeQuery(...);
    this.cache.set(id, result);
    return result;
  }
}

// All consumers get caching automatically
// No code changes needed
```

### Easy to Change Database

```typescript
// Switch from PostgreSQL to MongoDB (hypothetical)
class AnalysisMongoRepository implements IAnalysisRepository {
  async findById(id: string): Promise<Analysis | null> {
    return await this.collection.findOne({ _id: id });
  }

  // Same interface, different implementation
}

// Consumers unchanged
const repo = getAnalysisRepository();  // Returns Mongo version
const analysis = await repo.findById(id);  // Works same as before
```

---

## Summary

### Core Rules

1. **Repository Pattern**: All DB access through repository layer
2. **JSONB-First**: Prefer JSONB + GIN index over columns
3. **Additive-Only**: Add columns, never rename/delete
4. **Views for Format**: Use views, not schema changes
5. **Performance-Critical**: Only add columns when measured necessary

### Decision Matrix

| Need | Solution | Don't |
|------|----------|-------|
| Query by field | JSONB + GIN index | Add column |
| Different column names | View with aliases | Rename columns |
| New metadata field | Add to existing JSONB | Add new column |
| Deprecate field | Mark deprecated, keep column | Delete column |
| Format for consumer | Create view | Change table schema |
| Improve performance | Measure first, GIN index | Add column blindly |
| Change database | Repository abstraction | Direct SQL everywhere |

### Benefits

- ✅ Schema stability (no breaking changes)
- ✅ Easy to extend (just add to JSONB)
- ✅ Easy to test (mock repository)
- ✅ Easy to optimize (change repository)
- ✅ Easy to maintain (single source of truth)
- ✅ Fast queries (GIN indexes work great)
- ✅ Flexible (add fields without migration)

---
name: database-migration
description: Create and execute database migrations for PhishLogic
version: 1.0.0
---

# Database Migration Skill

## When to Use

Use this skill when:
- Adding new database tables or columns
- Modifying existing schema (indexes, constraints, types)
- Adding or updating database views
- Seeding initial or reference data
- Implementing database version control
- Rolling back problematic changes

## Migration Principles

1. **Always Forward**: Migrations should be append-only
2. **Idempotent**: Safe to run multiple times (ON CONFLICT, IF NOT EXISTS)
3. **Transactional**: Wrap in transactions when possible
4. **Reversible**: Plan rollback strategy (down migrations)
5. **Tested**: Test locally before production

## Step 1: Create Migration File

### Generate Timestamp-Based Filename

```bash
# Generate migration filename with timestamp
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_NAME="add_feature_name"  # Use snake_case
FILENAME="${TIMESTAMP}_${MIGRATION_NAME}.sql"

# Create migration file
touch "src/infrastructure/database/migrations/${FILENAME}"
echo "Created migration: ${FILENAME}"
```

### Migration File Template

Create `src/infrastructure/database/migrations/[timestamp]_[name].sql`:

```sql
-- Migration: [Brief description of what this migration does]
-- Author: [Your name]
-- Date: [YYYY-MM-DD]
-- Ticket: [JIRA/GitHub issue if applicable]

-- ============================================
-- UP MIGRATION
-- ============================================

BEGIN;

-- 1. Create new tables (if needed)
CREATE TABLE IF NOT EXISTS [table_name] (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    
    -- Domain fields
    [field_name] VARCHAR(255) NOT NULL,
    [field_name] TEXT,
    [field_name] JSONB DEFAULT '{}',
    [field_name] INTEGER DEFAULT 0,
    [field_name] BOOLEAN DEFAULT false,
    [field_name] DECIMAL(10, 2),
    [field_name] TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    deleted_at TIMESTAMP, -- Soft delete support
    
    -- Constraints
    CONSTRAINT [table_name]_unique_constraint UNIQUE(tenant_id, [field_name]),
    CONSTRAINT [table_name]_check_constraint CHECK ([field_name] > 0)
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_[table_name]_tenant_id 
    ON [table_name](tenant_id);

CREATE INDEX IF NOT EXISTS idx_[table_name]_created_at 
    ON [table_name](created_at DESC);

-- For JSONB columns, use GIN indexes
CREATE INDEX IF NOT EXISTS idx_[table_name]_metadata 
    ON [table_name] USING gin (metadata);

-- 3. Add columns to existing tables (if needed)
ALTER TABLE [existing_table] 
    ADD COLUMN IF NOT EXISTS [new_column] VARCHAR(255);

-- 4. Create views (if needed)
CREATE OR REPLACE VIEW [view_name] AS
SELECT 
    t.id,
    t.field_name,
    u.email as user_email,
    COUNT(*) OVER (PARTITION BY t.tenant_id) as total_count
FROM [table_name] t
LEFT JOIN users u ON t.created_by = u.id
WHERE t.deleted_at IS NULL;

-- 5. Insert reference data (if needed)
INSERT INTO [table_name] (id, tenant_id, field_name) 
VALUES 
    ('550e8400-e29b-41d4-a716-446655440001', '[tenant_id]', 'value1'),
    ('550e8400-e29b-41d4-a716-446655440002', '[tenant_id]', 'value2')
ON CONFLICT (id) DO NOTHING;

-- 6. Grant permissions (if using row-level security)
GRANT SELECT, INSERT, UPDATE, DELETE ON [table_name] TO app_user;
GRANT SELECT ON [view_name] TO readonly_user;

-- 7. Add triggers (if needed)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_[table_name]_updated_at
    BEFORE UPDATE ON [table_name]
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- 8. Add comments for documentation
COMMENT ON TABLE [table_name] IS 'Stores [description]';
COMMENT ON COLUMN [table_name].[field_name] IS '[Field description]';

COMMIT;

-- ============================================
-- DOWN MIGRATION (Rollback)
-- ============================================
-- Uncomment to rollback (run manually if needed)

/*
BEGIN;

-- Reverse the changes in opposite order
DROP TRIGGER IF EXISTS trigger_[table_name]_updated_at ON [table_name];
DROP FUNCTION IF EXISTS update_updated_at();
DROP VIEW IF EXISTS [view_name];
DROP TABLE IF EXISTS [table_name] CASCADE;
ALTER TABLE [existing_table] DROP COLUMN IF EXISTS [new_column];

COMMIT;
*/
```

## Step 2: Test Migration Locally

### Run Migration Script

```bash
# Using the migration runner
npx tsx scripts/run-migration.ts src/infrastructure/database/migrations/[filename].sql

# Or directly with psql
psql -h localhost -p 5432 -U postgres -d Phishlogic < src/infrastructure/database/migrations/[filename].sql
```

### Verify Migration

```bash
# Check if tables were created
psql -h localhost -U postgres -d Phishlogic -c "\dt [table_name]"

# Check table structure
psql -h localhost -U postgres -d Phishlogic -c "\d [table_name]"

# Verify indexes
psql -h localhost -U postgres -d Phishlogic -c "\di [table_name]*"

# Test with verification script
npx tsx scripts/verify-migration.ts
```

## Step 3: Create TypeScript Models

### Domain Model

Create `src/core/models/[entity].model.ts`:

```typescript
import { z } from 'zod';

// Domain model (business logic representation)
export interface [Entity]Domain {
  id: string;
  tenantId: string;
  // Domain fields
  [fieldName]: string;
  [fieldName]: number;
  [fieldName]: boolean;
  [fieldName]: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

// Database model (exact table representation)
export interface [Entity]Database {
  id: string;
  tenant_id: string;
  // Database columns (snake_case)
  [field_name]: string;
  [field_name]: number;
  [field_name]: boolean;
  [field_name]: Date;
  metadata: any; // JSONB
  created_at: Date;
  updated_at: Date;
  created_by?: string;
  deleted_at?: Date;
}

// Input validation schemas
export const [Entity]CreateSchema = z.object({
  tenantId: z.string().uuid(),
  [fieldName]: z.string().min(1).max(255),
  [fieldName]: z.number().positive(),
  [fieldName]: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

export const [Entity]UpdateSchema = z.object({
  [fieldName]: z.string().min(1).max(255).optional(),
  [fieldName]: z.number().positive().optional(),
  [fieldName]: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

export const [Entity]FiltersSchema = z.object({
  tenantId: z.string().uuid().optional(),
  [fieldName]: z.string().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  limit: z.number().positive().max(100).default(20),
  offset: z.number().min(0).default(0),
});

// Type exports
export type [Entity]CreateInput = z.infer<typeof [Entity]CreateSchema>;
export type [Entity]UpdateInput = z.infer<typeof [Entity]UpdateSchema>;
export type [Entity]Filters = z.infer<typeof [Entity]FiltersSchema>;
```

## Step 4: Create Repository (If New Table)

See the Architecture Verification skill for repository creation template.
Quick reference:

```typescript
// src/infrastructure/database/repositories/[entity].repository.ts
export class [Entity]Repository extends BaseRepository<[Entity]Database, [Entity]Domain> {
  constructor(pool: DatabasePool) {
    super(pool, '[table_name]');
  }

  protected toDomain(row: [Entity]Database): [Entity]Domain {
    // Map snake_case to camelCase
  }

  protected toDatabase(domain: Partial<[Entity]Domain>): Partial<[Entity]Database> {
    // Map camelCase to snake_case
  }
}
```

## Step 5: Migration Testing Checklist

### Pre-Migration
- [ ] Backup production database
- [ ] Test migration on staging environment
- [ ] Review migration with team
- [ ] Check for blocking queries
- [ ] Plan maintenance window if needed

### Migration Execution
- [ ] Run migration in transaction
- [ ] Monitor database performance
- [ ] Check for lock contention
- [ ] Verify row counts
- [ ] Test application functionality

### Post-Migration
- [ ] Verify all changes applied
- [ ] Run integration tests
- [ ] Monitor error logs
- [ ] Check query performance
- [ ] Document any issues

## Step 6: Common Migration Patterns

### Pattern: Add Column with Default

```sql
-- Safe way to add column with default value
ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS status VARCHAR(50);

-- Update existing rows
UPDATE users 
SET status = 'active' 
WHERE status IS NULL;

-- Then add NOT NULL constraint
ALTER TABLE users 
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'active';
```

### Pattern: Rename Column Safely

```sql
-- Step 1: Add new column
ALTER TABLE [table] ADD COLUMN [new_name] [type];

-- Step 2: Copy data
UPDATE [table] SET [new_name] = [old_name];

-- Step 3: Add constraints to new column
ALTER TABLE [table] ALTER COLUMN [new_name] SET NOT NULL;

-- Step 4: Drop old column (in separate migration)
-- ALTER TABLE [table] DROP COLUMN [old_name];
```

### Pattern: Create Index Without Blocking

```sql
-- Create index concurrently (doesn't block writes)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_[table]_[column] 
    ON [table]([column]);

-- Note: Cannot run in transaction
```

### Pattern: Add Foreign Key Safely

```sql
-- Check if constraint exists first
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_[table]_[reference]'
    ) THEN
        ALTER TABLE [table] 
        ADD CONSTRAINT fk_[table]_[reference] 
        FOREIGN KEY ([column]) 
        REFERENCES [reference_table](id) 
        ON DELETE CASCADE;
    END IF;
END $$;
```

## Step 7: Rollback Procedures

### Manual Rollback

```bash
# Extract down migration from file
sed -n '/DOWN MIGRATION/,/\*\//p' migrations/[filename].sql > rollback.sql

# Review rollback script
cat rollback.sql

# Execute rollback
psql -h localhost -U postgres -d Phishlogic < rollback.sql
```

### Emergency Rollback

```sql
-- If migration fails mid-execution
ROLLBACK;

-- Check current state
SELECT * FROM pg_stat_activity WHERE state = 'active';

-- Kill blocking queries if needed
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid <> pg_backend_pid() 
  AND query LIKE '%[table_name]%';
```

## Step 8: Production Deployment

### Deployment Checklist

```bash
# 1. Announce maintenance window
echo "Maintenance scheduled for [time]"

# 2. Backup database
pg_dump -h [host] -U [user] -d Phishlogic > backup_$(date +%Y%m%d).sql

# 3. Run migration
psql -h [host] -U [user] -d Phishlogic < migrations/[filename].sql

# 4. Verify migration
psql -h [host] -U [user] -d Phishlogic -c "SELECT COUNT(*) FROM [table]"

# 5. Deploy application code
npm run deploy

# 6. Run smoke tests
npm run test:smoke

# 7. Monitor logs
tail -f logs/app.log | grep ERROR
```

## Common Issues and Solutions

### Issue: Migration Takes Too Long
**Solution**: 
- Use CONCURRENTLY for index creation
- Break into smaller migrations
- Run during low-traffic period
- Consider pg_repack for large table changes

### Issue: Constraint Violation
**Solution**:
- Clean data before adding constraints
- Use CHECK CONSTRAINT NOT VALID first
- Validate constraint separately

### Issue: Rollback Fails
**Solution**:
- Always test rollback locally first
- Keep backups before migration
- Use CASCADE carefully
- Document dependencies

### Issue: Application Errors After Migration
**Solution**:
- Ensure models match new schema
- Update repository mappings
- Clear application cache
- Restart application servers

## Migration Scripts

### Run Migration Script
Location: `scripts/run-migration.ts`
- Handles connection
- Runs SQL file
- Reports success/failure

### Verify Migration Script
Location: `scripts/verify-migration.ts`  
- Checks table existence
- Verifies column types
- Validates constraints
- Tests basic queries

## Best Practices

1. **Small Migrations**: One concern per migration
2. **Descriptive Names**: Clear migration purpose in filename
3. **Idempotent**: Use IF NOT EXISTS, ON CONFLICT
4. **Test Locally**: Always test before production
5. **Document**: Include comments in SQL
6. **Version Control**: Commit migrations with code
7. **No Data Loss**: Plan data preservation strategy
8. **Monitor**: Watch performance during migration

## Examples from Codebase

### Good Examples
- `001_initial_schema.sql`: Complete initial setup
- `002_add_analyses_table.sql`: Well-structured table creation
- `003_add_indexes.sql`: Performance optimization

### Migration Patterns Used
- ON CONFLICT for idempotent inserts
- IF NOT EXISTS for safe schema changes
- Transactions for atomicity
- Comments for documentation

## Related Documentation

- [Database Client](src/infrastructure/database/client.ts)
- [Base Repository](src/infrastructure/database/repositories/base.repository.ts)
- [Migration Scripts](scripts/)
- [Database Schema](docs/database/SCHEMA.md)
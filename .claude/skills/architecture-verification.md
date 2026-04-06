---
name: architecture-verification
description: Verify clean architecture compliance - check for repository pattern usage and prevent direct database calls
version: 1.0.0
---

# Architecture Verification Skill

## When to Use

Use this skill when:
- Adding new features that interact with the database
- Reviewing code for architecture compliance
- Refactoring existing code to follow clean architecture
- Performing code quality audits
- Before major releases to ensure architectural integrity
- When you suspect direct database access violations

## Clean Architecture Rules

Based on `docs/development/ARCHITECTURE.md`, PhishLogic follows these principles:

### Layer Dependencies
```
API Layer → Adapters → Core Domain → Infrastructure
```

### Strict Rules
1. **Core Layer** (`src/core/`): NO infrastructure imports, pure business logic only
2. **API Layer** (`src/api/`): Use repositories/services, NO direct database queries
3. **Adapters** (`src/adapters/`): Transform data, depend only on core models
4. **Infrastructure** (`src/infrastructure/`): Database access ONLY here

### Repository Pattern Requirements
- All database entities MUST have a repository in `src/infrastructure/database/repositories/`
- Controllers MUST use repositories, not direct queries
- Services MUST inject repositories as dependencies
- Only repositories should import `query` or `getDatabaseClient` from database client

## Step 1: Run Architecture Verification Scan

### Scan for Direct Database Access Violations

```bash
# Find all direct query imports (VIOLATIONS)
echo "=== Checking for direct query imports ==="
grep -r "import.*{.*query.*}.*from.*database/client" src/ --include="*.ts" | grep -v "repositories/"

# Find all getDatabaseClient usage (VIOLATIONS)
echo "=== Checking for getDatabaseClient usage ==="
grep -r "getDatabaseClient" src/ --include="*.ts" | grep -v "repositories/"

# Find raw SQL in non-repository files (VIOLATIONS)
echo "=== Checking for SQL queries outside repositories ==="
grep -r "SELECT\|INSERT\|UPDATE\|DELETE\|FROM\|WHERE" src/ --include="*.ts" | grep -v "repositories/" | grep -v "migrations/"

# Check Core layer for infrastructure imports (CRITICAL VIOLATIONS)
echo "=== Checking Core layer for infrastructure imports ==="
grep -r "from.*infrastructure" src/core/ --include="*.ts"
```

### Generate Violation Report

```bash
# Create detailed violation report
cat > architecture-violations.md << 'EOF'
# Architecture Violations Report

## Summary
- Total Files with Violations: [COUNT]
- Critical (Core Layer): [COUNT]
- High (Controllers): [COUNT]
- Medium (Middleware): [COUNT]

## Critical Violations (Core Layer)
These violate the fundamental principle that Core has no dependencies.

## High Priority (Controllers)
Controllers should delegate to repositories, not construct SQL.

## Medium Priority (Middleware)
Middleware should use repositories for data access.

## Missing Repositories
Entities without repository implementations:
EOF
```

## Step 2: Identify Missing Repositories

### Check Which Entities Need Repositories

```bash
# List all database tables
psql -h localhost -U postgres -d Phishlogic -c "\dt" | awk '{print $3}' | grep -v "^$" | sort

# Check which have repositories
ls -la src/infrastructure/database/repositories/*.repository.ts | awk -F'/' '{print $NF}' | sed 's/.repository.ts//' | sort

# Compare to find missing repositories
```

### Entities Commonly Missing Repositories
- analyzers
- tasks
- system_settings
- notifications
- prompt_templates
- whitelist_entries
- api_keys
- admin_users

## Step 3: Fix Templates

### Template A: Create New Repository

Create `src/infrastructure/database/repositories/[entity].repository.ts`:

```typescript
import { BaseRepository } from './base.repository.js';
import { DatabasePool } from '../client.js';
import type { 
  [Entity]Domain,
  [Entity]Database,
  [Entity]CreateInput,
  [Entity]UpdateInput,
  [Entity]Filters
} from '../models/[entity].model.js';

export interface I[Entity]Repository {
  findById(id: string): Promise<[Entity]Domain | null>;
  findMany(filters?: [Entity]Filters): Promise<[Entity]Domain[]>;
  create(data: [Entity]CreateInput): Promise<[Entity]Domain>;
  update(id: string, data: [Entity]UpdateInput): Promise<[Entity]Domain | null>;
  delete(id: string): Promise<boolean>;
}

export class [Entity]Repository extends BaseRepository<[Entity]Database, [Entity]Domain> implements I[Entity]Repository {
  constructor(pool: DatabasePool) {
    super(pool, '[entity_table_name]');
  }

  protected toDomain(row: [Entity]Database): [Entity]Domain {
    return {
      id: row.id,
      // Map database fields to domain model
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected toDatabase(domain: Partial<[Entity]Domain>): Partial<[Entity]Database> {
    const db: Partial<[Entity]Database> = {};
    
    if (domain.id !== undefined) db.id = domain.id;
    // Map domain fields to database columns
    
    return db;
  }

  async findMany(filters?: [Entity]Filters): Promise<[Entity]Domain[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    
    if (filters?.tenantId) {
      conditions.push(`tenant_id = $${values.length + 1}`);
      values.push(filters.tenantId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY created_at DESC`;
    
    const rows = await this.executeQuery<[Entity]Database>(query, values);
    return rows.map(row => this.toDomain(row));
  }

  async create(data: [Entity]CreateInput): Promise<[Entity]Domain> {
    const dbData = this.toDatabase(data);
    const result = await this.insert(dbData as [Entity]Database);
    return this.toDomain(result);
  }

  async update(id: string, data: [Entity]UpdateInput): Promise<[Entity]Domain | null> {
    const dbData = this.toDatabase(data);
    const result = await super.update(id, dbData);
    return result ? this.toDomain(result) : null;
  }
}
```

### Template B: Refactor Controller to Use Repository

**Before** (Direct Query):
```typescript
// ❌ VIOLATION: Direct database access in controller
import { query } from '../../../infrastructure/database/client.js';

export class AnalyzerController {
  async getAnalyzers(request: FastifyRequest, reply: FastifyReply) {
    const result = await query('SELECT * FROM analyzers WHERE tenant_id = $1', [tenantId]);
    return reply.send(result.rows);
  }
}
```

**After** (Repository Pattern):
```typescript
// ✅ CORRECT: Using repository pattern
import { AnalyzerRepository } from '../../../infrastructure/database/repositories/analyzer.repository.js';

export class AnalyzerController {
  constructor(private analyzerRepository: AnalyzerRepository) {}

  async getAnalyzers(request: FastifyRequest, reply: FastifyReply) {
    const analyzers = await this.analyzerRepository.findMany({ tenantId });
    return reply.send(analyzers);
  }
}
```

### Template C: Refactor Service to Use Repository

**Before** (Direct Query):
```typescript
// ❌ VIOLATION: Direct database access in service
import { query } from '../../infrastructure/database/client.js';

export class WhitelistService {
  async getWhitelistEntries() {
    const result = await query('SELECT * FROM whitelist_entries WHERE active = true');
    return result.rows;
  }
}
```

**After** (Repository Injection):
```typescript
// ✅ CORRECT: Repository injected as dependency
import { IWhitelistRepository } from '../../infrastructure/database/repositories/whitelist.repository.js';

export class WhitelistService {
  constructor(private whitelistRepository: IWhitelistRepository) {}

  async getWhitelistEntries() {
    return this.whitelistRepository.findMany({ active: true });
  }
}
```

### Template D: Update Dependency Injection

In `src/api/server.ts` or dependency container:

```typescript
// Register repositories
const pool = await getDatabasePool();
const analyzerRepository = new AnalyzerRepository(pool);
const whitelistRepository = new WhitelistRepository(pool);
const taskRepository = new TaskRepository(pool);

// Inject into services
const whitelistService = new WhitelistService(whitelistRepository);

// Inject into controllers
const analyzerController = new AnalyzerController(analyzerRepository);

// Register with Fastify
app.decorate('repositories', {
  analyzer: analyzerRepository,
  whitelist: whitelistRepository,
  task: taskRepository,
});
```

## Step 4: Verification Checklist

### Pre-Implementation
- [ ] Run architecture scan to identify all violations
- [ ] List all missing repositories
- [ ] Prioritize fixes by layer (Core > API > Middleware)
- [ ] Create migration plan for each violation

### Implementation
- [ ] Create repository for each missing entity
- [ ] Create domain and database models for each entity
- [ ] Implement repository interface with CRUD methods
- [ ] Add specialized query methods as needed
- [ ] Update controllers to use repositories
- [ ] Update services to inject repositories
- [ ] Update middleware to use repositories
- [ ] Update dependency injection configuration

### Post-Implementation
- [ ] Re-run architecture scan - should show 0 violations
- [ ] All tests pass
- [ ] No direct imports of `query` or `getDatabaseClient` outside infrastructure
- [ ] Core layer has no infrastructure imports
- [ ] Controllers delegate to repositories/services
- [ ] Services use injected repositories

## Step 5: Common Patterns to Fix

### Pattern 1: Admin Controllers
Most admin controllers have extensive direct database access. Fix by:
1. Create repository for the entity
2. Move complex queries to repository methods
3. Keep business logic in services
4. Controller only handles HTTP concerns

### Pattern 2: Whitelist Service
Currently has 10+ direct queries. Fix by:
1. Create WhitelistRepository with all query logic
2. Inject repository into service
3. Service focuses on business rules
4. Repository handles all SQL

### Pattern 3: Auth Middleware
Direct API key queries. Fix by:
1. Create APIKeyRepository
2. Inject into middleware
3. Add caching layer if needed for performance

## Examples from Current Codebase

### Good Example - Analysis Repository
Location: `src/infrastructure/database/repositories/analysis.repository.ts`
- Extends BaseRepository
- Implements domain/database mapping
- Provides specialized query methods
- No business logic, just data access

### Violation Example - Analyzer Controller
Location: `src/api/controllers/admin/analyzers.controller.ts`
- Direct database client import
- Constructs raw SQL queries
- Mixes data access with HTTP handling
- Should use AnalyzerRepository instead

## Automated Fix Script

```bash
#!/bin/bash
# fix-architecture-violations.sh

echo "Starting architecture violation fixes..."

# Step 1: Create missing repositories
ENTITIES=("analyzer" "task" "whitelist" "api_key" "system_setting" "notification" "prompt_template")

for entity in "${ENTITIES[@]}"; do
  if [ ! -f "src/infrastructure/database/repositories/${entity}.repository.ts" ]; then
    echo "Creating ${entity} repository..."
    # Use Template A above to create repository
  fi
done

# Step 2: Update imports in violated files
echo "Updating imports..."
find src/core src/api -name "*.ts" -type f | while read file; do
  # Replace direct query imports with repository imports
  sed -i '' "s/import.*query.*from.*database\/client/\/\/ TODO: Use repository instead/g" "$file"
done

# Step 3: Generate fix report
echo "Generating fix report..."
echo "Files requiring manual update:"
grep -r "TODO: Use repository instead" src/ --include="*.ts" | cut -d: -f1 | sort -u

echo "Fix script complete. Manual updates required for business logic migration."
```

## Troubleshooting

### Issue: Circular Dependencies
**Solution**: Use interfaces and dependency injection
- Define repository interfaces
- Import interfaces in services, not implementations
- Wire implementations in dependency container

### Issue: Complex Queries
**Solution**: Add specialized methods to repository
- Don't try to make everything generic
- Add specific methods for complex queries
- Keep SQL in repository, not service

### Issue: Transaction Management
**Solution**: Use repository transaction support
- BaseRepository has transaction methods
- Wrap multiple operations in transaction
- Repository handles rollback on error

## Success Metrics

After applying this skill:
- **0** direct database calls outside infrastructure layer
- **100%** of entities have repositories
- **100%** of controllers use repositories/services
- **100%** of services use injected repositories
- All architecture scans pass
- Improved testability with mockable repositories
- Clear separation of concerns

## Related Documentation

- [Architecture Principles](docs/development/ARCHITECTURE.md)
- [Base Repository](src/infrastructure/database/repositories/base.repository.ts)
- [Coding Standards](docs/development/CODING_STANDARDS.md)
- [Testing Guide](docs/development/TESTING_GUIDE.md)
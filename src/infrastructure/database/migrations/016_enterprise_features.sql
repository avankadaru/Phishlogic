-- ============================================================================
-- PhishLogic Enterprise Features
-- SCIM 2.0 Provisioning + SSO Integration + Audit Logging
-- ============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- For GIN indexes on mixed columns

-- ============================================================================
-- ORGANIZATIONS TABLE
-- Supports multi-tenant architecture with SCIM and SSO capabilities
-- ============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(255) UNIQUE NOT NULL,  -- e.g., "acme.com"
  display_name VARCHAR(255) NOT NULL,    -- e.g., "Acme Corporation"
  organization_type VARCHAR(50) NOT NULL DEFAULT 'workspace',  -- 'workspace', 'enterprise', 'individual'

  -- SCIM Configuration
  scim_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  scim_base_url VARCHAR(500),  -- e.g., "https://api.phishlogic.com/scim/v2"
  scim_bearer_token TEXT,  -- Encrypted bearer token for SCIM authentication

  -- SSO Configuration
  sso_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sso_provider VARCHAR(50),  -- 'cyberark', 'okta', 'azure_ad', 'auth0'
  sso_entity_id VARCHAR(500),  -- SAML Entity ID
  sso_sso_url TEXT,  -- SAML SSO URL
  sso_logout_url TEXT,  -- SAML Logout URL (optional)
  sso_certificate TEXT,  -- X.509 certificate in PEM format

  -- JSONB for flexible metadata (NO schema migrations needed for new fields)
  sso_metadata JSONB DEFAULT '{}',  -- Additional SSO config (ACS URL, name ID format, etc.)
  organization_attributes JSONB DEFAULT '{}',  -- Custom fields (size, tier, contract dates, etc.)

  -- Telemetry
  total_users INT DEFAULT 0,
  total_analyses INT DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT chk_organization_type CHECK (organization_type IN ('individual', 'workspace', 'enterprise')),
  CONSTRAINT chk_sso_provider CHECK (sso_provider IS NULL OR sso_provider IN ('cyberark', 'okta', 'azure_ad', 'auth0', 'google_workspace'))
);

-- Indexes
CREATE INDEX idx_organizations_domain ON organizations(domain) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_type ON organizations(organization_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_sso_provider ON organizations(sso_provider) WHERE sso_enabled = TRUE AND deleted_at IS NULL;

-- GIN indexes for JSONB queries
CREATE INDEX idx_organizations_sso_metadata_gin ON organizations USING GIN (sso_metadata);
CREATE INDEX idx_organizations_attributes_gin ON organizations USING GIN (organization_attributes);

COMMENT ON TABLE organizations IS 'Multi-tenant organizations with SCIM and SSO support';
COMMENT ON COLUMN organizations.scim_bearer_token IS 'Encrypted bearer token for IdP to authenticate with SCIM endpoints';
COMMENT ON COLUMN organizations.sso_certificate IS 'X.509 certificate from IdP for SAML assertion validation';
COMMENT ON COLUMN organizations.organization_attributes IS 'JSONB for extensibility: {tier, size, employee_count, contract_start, compliance, etc.}';

-- ============================================================================
-- USERS TABLE
-- Enterprise users provisioned via SCIM or self-signup
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SCIM Standard Fields (urn:ietf:params:scim:schemas:core:2.0:User)
  external_id VARCHAR(255) UNIQUE,  -- IdP's unique identifier (e.g., Okta user ID)
  user_name VARCHAR(255) NOT NULL,  -- SCIM userName (usually email)
  email VARCHAR(255) UNIQUE NOT NULL,
  given_name VARCHAR(100),  -- First name
  family_name VARCHAR(100),  -- Last name
  display_name VARCHAR(255),  -- Full name
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Organization Link
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_type VARCHAR(50) NOT NULL DEFAULT 'individual',  -- 'individual' or 'organization'

  -- Authentication
  google_id VARCHAR(255) UNIQUE,  -- Google OAuth user ID (for individual users)
  api_key VARCHAR(255) UNIQUE,  -- Generated API key for analysis requests
  api_key_created_at TIMESTAMPTZ,

  -- JSONB for flexible user attributes (NO schema migrations needed)
  user_attributes JSONB DEFAULT '{}',  -- {department, job_title, manager_email, provisioned_via, etc.}

  -- Telemetry
  total_analyses INT DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  last_analysis_at TIMESTAMPTZ,

  -- SCIM ETag Support (Optimistic Locking)
  version INT NOT NULL DEFAULT 1,  -- Increment on each update, used for ETag

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT chk_user_type CHECK (user_type IN ('individual', 'organization'))
);

-- Indexes
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_external_id ON users(external_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_google_id ON users(google_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_organization_id ON users(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_api_key ON users(api_key) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_active ON users(active) WHERE deleted_at IS NULL;

-- GIN index for JSONB queries
CREATE INDEX idx_users_attributes_gin ON users USING GIN (user_attributes);

COMMENT ON TABLE users IS 'Enterprise users with SCIM provisioning and OAuth support';
COMMENT ON COLUMN users.external_id IS 'IdP unique identifier from SCIM (e.g., Okta user ID)';
COMMENT ON COLUMN users.version IS 'Version counter for optimistic locking (ETag support in SCIM)';
COMMENT ON COLUMN users.user_attributes IS 'JSONB for extensibility: {department, job_title, employee_id, manager, provisioned_via, etc.}';

-- ============================================================================
-- ROLES TABLE
-- SCIM Groups mapped to PhishLogic roles with JSONB permissions
-- ============================================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- SCIM Standard Fields (urn:ietf:params:scim:schemas:core:2.0:Group)
  external_id VARCHAR(255) UNIQUE,  -- IdP's group ID (e.g., Okta group ID)
  display_name VARCHAR(255) NOT NULL,  -- e.g., "Admins", "Analysts", "Viewers"

  -- Organization Link
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Permissions (Flat structure for MVP)
  permissions JSONB DEFAULT '{}',  -- {analyze: true, admin_panel: true, view_all_analyses: true, manage_users: true}

  -- JSONB for flexible role attributes
  role_attributes JSONB DEFAULT '{}',  -- {description, created_via, okta_group_name, etc.}

  -- SCIM ETag Support
  version INT NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT unique_role_display_name_per_org UNIQUE (organization_id, display_name)
);

-- Indexes
CREATE INDEX idx_roles_external_id ON roles(external_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_roles_organization_id ON roles(organization_id) WHERE deleted_at IS NULL;

-- GIN indexes for JSONB queries
CREATE INDEX idx_roles_permissions_gin ON roles USING GIN (permissions);
CREATE INDEX idx_roles_attributes_gin ON roles USING GIN (role_attributes);

COMMENT ON TABLE roles IS 'SCIM groups mapped to roles with flat JSONB permissions';
COMMENT ON COLUMN roles.external_id IS 'IdP group identifier from SCIM (e.g., Okta group ID)';
COMMENT ON COLUMN roles.permissions IS 'Flat JSONB permissions: {analyze, admin_panel, view_all_analyses, manage_users}';
COMMENT ON COLUMN roles.role_attributes IS 'JSONB for extensibility: {description, created_via, okta_group_name, etc.}';

-- ============================================================================
-- USER_ROLES TABLE
-- Junction table for many-to-many relationship between users and roles
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by VARCHAR(255) DEFAULT 'scim',  -- 'scim', 'admin', 'self'

  PRIMARY KEY (user_id, role_id)
);

-- Indexes
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

COMMENT ON TABLE user_roles IS 'Many-to-many relationship between users and roles';
COMMENT ON COLUMN user_roles.assigned_by IS 'How the role was assigned: scim (IdP), admin (manual), self (user-initiated)';

-- ============================================================================
-- AUDIT_LOG TABLE
-- Comprehensive event logging for compliance and troubleshooting
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event Classification
  event_name VARCHAR(100) NOT NULL,  -- 'user.created', 'user.updated', 'user.deactivated', 'analysis.completed', 'role.assigned', etc.
  event_type VARCHAR(50) NOT NULL,  -- 'scim', 'sso', 'analysis', 'admin', 'api'

  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL,  -- When the event actually happened
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- When we logged it

  -- Entity (what was affected)
  entity_type VARCHAR(50),  -- 'user', 'organization', 'role', 'analysis', etc.
  entity_id UUID,
  entity_name VARCHAR(255),  -- Email, name, or identifier for human readability

  -- Actor (who performed the action)
  actor_type VARCHAR(50),  -- 'user', 'admin', 'idp', 'system'
  actor_id UUID,
  actor_name VARCHAR(255),

  -- Context
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  source VARCHAR(50),  -- 'scim_api', 'sso_saml', 'gmail_addon', 'browser_extension', 'admin_ui', 'api_direct'
  ip_address INET,
  user_agent TEXT,

  -- Event-Specific Metadata (JSONB for flexibility)
  event_metadata JSONB DEFAULT '{}',  -- Analysis results, SCIM payload, SSO claims, changes made, etc.

  -- Analysis-Specific Fields (for analysis.completed events)
  analysis_id UUID,  -- Foreign key to analyses table
  verdict VARCHAR(50),  -- 'Safe', 'Suspicious', 'Malicious'
  confidence DECIMAL(3,2),  -- 0.00 to 1.00
  processing_time_ms INT,

  -- Success/Failure
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,

  CONSTRAINT chk_event_type CHECK (event_type IN ('scim', 'sso', 'analysis', 'admin', 'api', 'system')),
  CONSTRAINT chk_actor_type CHECK (actor_type IS NULL OR actor_type IN ('user', 'admin', 'idp', 'system'))
);

-- Indexes for common queries
CREATE INDEX idx_audit_log_event_name ON audit_log(event_name);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_occurred_at ON audit_log(occurred_at DESC);
CREATE INDEX idx_audit_log_entity_id ON audit_log(entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_log_organization_id ON audit_log(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_audit_log_source ON audit_log(source);
CREATE INDEX idx_audit_log_analysis_id ON audit_log(analysis_id) WHERE analysis_id IS NOT NULL;

-- GIN index for JSONB metadata queries
CREATE INDEX idx_audit_log_metadata_gin ON audit_log USING GIN (event_metadata);

-- Composite index for organization audit queries
CREATE INDEX idx_audit_log_org_occurred ON audit_log(organization_id, occurred_at DESC) WHERE organization_id IS NOT NULL;

COMMENT ON TABLE audit_log IS 'Comprehensive event log for compliance, security, and troubleshooting';
COMMENT ON COLUMN audit_log.occurred_at IS 'When the event actually occurred (may differ from logged_at for delayed logging)';
COMMENT ON COLUMN audit_log.event_metadata IS 'JSONB for event-specific data: SCIM payloads, SSO claims, analysis details, changes made, etc.';

-- ============================================================================
-- UPDATE EXISTING TABLES
-- Link existing api_keys table to users table
-- ============================================================================

-- Add user_id foreign key to api_keys (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_keys' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX idx_api_keys_user_id ON api_keys(user_id) WHERE deleted_at IS NULL;
    COMMENT ON COLUMN api_keys.user_id IS 'Link to enterprise users table (for SCIM-provisioned users)';
  END IF;
END $$;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- Automatic timestamp updates
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE DATA (Development Only)
-- Uncomment for local development testing
-- ============================================================================

-- Sample Organization (Acme Corporation)
-- INSERT INTO organizations (id, domain, display_name, organization_type, scim_enabled, sso_enabled, organization_attributes)
-- VALUES (
--   gen_random_uuid(),
--   'acme.com',
--   'Acme Corporation',
--   'enterprise',
--   TRUE,
--   TRUE,
--   '{"tier": "enterprise", "employee_count": 500, "compliance": ["SOC2", "HIPAA"]}'
-- );

-- Sample User (Alice from Acme)
-- INSERT INTO users (
--   external_id, user_name, email, given_name, family_name, display_name,
--   organization_id, user_type, active, user_attributes
-- )
-- SELECT
--   'okta-user-12345',
--   'alice@acme.com',
--   'alice@acme.com',
--   'Alice',
--   'Smith',
--   'Alice Smith',
--   id,
--   'organization',
--   TRUE,
--   '{"department": "Security", "job_title": "Security Analyst", "provisioned_via": "scim"}'
-- FROM organizations WHERE domain = 'acme.com';

-- Sample Role (Admins)
-- INSERT INTO roles (
--   external_id, display_name, organization_id, permissions, role_attributes
-- )
-- SELECT
--   'okta-group-admin-123',
--   'Admins',
--   id,
--   '{"analyze": true, "admin_panel": true, "view_all_analyses": true, "manage_users": true}',
--   '{"description": "Full administrative access", "created_via": "scim"}'
-- FROM organizations WHERE domain = 'acme.com';

-- ============================================================================
-- GRANTS
-- Grant necessary permissions to application user
-- ============================================================================

-- Assuming application database user is 'phishlogic' (adjust if different)
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO phishlogic;
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO phishlogic;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO phishlogic;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_roles TO phishlogic;
GRANT SELECT, INSERT, UPDATE, DELETE ON audit_log TO phishlogic;

-- Grant sequence usage (for auto-increment columns if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO phishlogic;

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these after migration to verify schema
-- ============================================================================

-- Check tables exist
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('organizations', 'users', 'roles', 'user_roles', 'audit_log')
-- ORDER BY table_name;

-- Check indexes on JSONB columns
-- SELECT schemaname, tablename, indexname
-- FROM pg_indexes
-- WHERE indexname LIKE '%_gin'
-- ORDER BY tablename, indexname;

-- Check foreign key constraints
-- SELECT
--   tc.table_name,
--   kcu.column_name,
--   ccu.table_name AS foreign_table_name,
--   ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name
--   AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name
--   AND ccu.table_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
-- AND tc.table_name IN ('users', 'roles', 'user_roles', 'audit_log')
-- ORDER BY tc.table_name, kcu.column_name;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

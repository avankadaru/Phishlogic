/**
 * Organization Domain Model
 * Represents a multi-tenant organization with SCIM and SSO capabilities
 */

export interface OrganizationDomain {
  id: string;
  domain: string; // e.g., "acme.com"
  displayName: string; // e.g., "Acme Corporation"
  organizationType: 'individual' | 'workspace' | 'enterprise';

  // SCIM Configuration
  scimEnabled: boolean;
  scimBaseUrl?: string;
  scimBearerToken?: string; // Encrypted

  // SSO Configuration
  ssoEnabled: boolean;
  ssoProvider?: 'cyberark' | 'okta' | 'azure_ad' | 'auth0' | 'google_workspace';
  ssoEntityId?: string;
  ssoSsoUrl?: string;
  ssoLogoutUrl?: string;
  ssoCertificate?: string; // X.509 PEM format

  // Flexible metadata (JSONB)
  ssoMetadata?: Record<string, any>; // ACS URL, name ID format, etc.
  organizationAttributes?: Record<string, any>; // tier, size, contract dates, compliance, etc.

  // Telemetry
  totalUsers: number;
  totalAnalyses: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Database Model - Matches table structure exactly
 */
export interface OrganizationDatabaseModel {
  id: string;
  domain: string;
  display_name: string;
  organization_type: string;

  scim_enabled: boolean;
  scim_base_url: string | null;
  scim_bearer_token: string | null;

  sso_enabled: boolean;
  sso_provider: string | null;
  sso_entity_id: string | null;
  sso_sso_url: string | null;
  sso_logout_url: string | null;
  sso_certificate: string | null;

  sso_metadata: any; // JSONB
  organization_attributes: any; // JSONB

  total_users: number;
  total_analyses: number;

  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

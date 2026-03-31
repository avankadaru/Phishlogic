/**
 * User Domain Model
 * Represents enterprise users with SCIM provisioning and OAuth support
 */

export interface UserDomain {
  id: string;

  // SCIM Standard Fields
  externalId?: string; // IdP's unique identifier
  userName: string; // SCIM userName (usually email)
  email: string;
  givenName?: string; // First name
  familyName?: string; // Last name
  displayName?: string; // Full name
  active: boolean;

  // Organization Link
  organizationId?: string;
  userType: 'individual' | 'organization';

  // Authentication
  googleId?: string; // For individual users
  apiKey?: string; // Generated API key
  apiKeyCreatedAt?: Date;

  // Flexible user attributes (JSONB)
  userAttributes?: Record<string, any>; // department, job_title, manager_email, etc.

  // Telemetry
  totalAnalyses: number;
  lastLoginAt?: Date;
  lastAnalysisAt?: Date;

  // SCIM ETag Support (Optimistic Locking)
  version: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Database Model - Matches table structure exactly
 */
export interface UserDatabaseModel {
  id: string;

  external_id: string | null;
  user_name: string;
  email: string;
  given_name: string | null;
  family_name: string | null;
  display_name: string | null;
  active: boolean;

  organization_id: string | null;
  user_type: string;

  google_id: string | null;
  api_key: string | null;
  api_key_created_at: Date | null;

  user_attributes: any; // JSONB

  total_analyses: number;
  last_login_at: Date | null;
  last_analysis_at: Date | null;

  version: number;

  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

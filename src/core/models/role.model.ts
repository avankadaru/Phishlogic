/**
 * Role Domain Model
 * Represents SCIM groups mapped to PhishLogic roles
 */

export interface RoleDomain {
  id: string;

  // SCIM Standard Fields
  externalId?: string; // IdP's group ID
  displayName: string; // e.g., "Admins", "Analysts", "Viewers"

  // Organization Link
  organizationId: string;

  // Permissions (Flat structure for MVP)
  permissions: Record<string, boolean>; // {analyze: true, admin_panel: true, etc.}

  // Flexible role attributes (JSONB)
  roleAttributes?: Record<string, any>; // description, created_via, okta_group_name, etc.

  // SCIM ETag Support
  version: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Database Model - Matches table structure exactly
 */
export interface RoleDatabaseModel {
  id: string;

  external_id: string | null;
  display_name: string;

  organization_id: string;

  permissions: any; // JSONB
  role_attributes: any; // JSONB

  version: number;

  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/**
 * User-Role Junction Table Model
 */
export interface UserRoleDomain {
  userId: string;
  roleId: string;
  assignedAt: Date;
  assignedBy: string; // 'scim', 'admin', 'self'
}

export interface UserRoleDatabaseModel {
  user_id: string;
  role_id: string;
  assigned_at: Date;
  assigned_by: string;
}

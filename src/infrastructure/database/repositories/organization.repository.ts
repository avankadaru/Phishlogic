/**
 * Organization Repository
 * Single source of truth for organization data access
 */

import { BaseRepository } from './base.repository.js';
import {
  OrganizationDomain,
  OrganizationDatabaseModel,
} from '../../../core/models/organization.model.js';

export class OrganizationRepository extends BaseRepository<
  OrganizationDomain,
  OrganizationDatabaseModel
> {
  constructor() {
    super('organizations');
  }

  /**
   * Map database row to domain model
   */
  protected mapToDomain(row: OrganizationDatabaseModel): OrganizationDomain {
    return {
      id: row.id,
      domain: row.domain,
      displayName: row.display_name,
      organizationType: row.organization_type as 'individual' | 'workspace' | 'enterprise',

      scimEnabled: row.scim_enabled,
      scimBaseUrl: row.scim_base_url || undefined,
      scimBearerToken: row.scim_bearer_token || undefined,

      ssoEnabled: row.sso_enabled,
      ssoProvider: (row.sso_provider as any) || undefined,
      ssoEntityId: row.sso_entity_id || undefined,
      ssoSsoUrl: row.sso_sso_url || undefined,
      ssoLogoutUrl: row.sso_logout_url || undefined,
      ssoCertificate: row.sso_certificate || undefined,

      ssoMetadata: row.sso_metadata || undefined,
      organizationAttributes: row.organization_attributes || undefined,

      totalUsers: row.total_users,
      totalAnalyses: row.total_analyses,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || undefined,
    };
  }

  /**
   * Map domain model to database row
   */
  protected mapToDatabase(domain: Partial<OrganizationDomain>): Partial<OrganizationDatabaseModel> {
    const db: Partial<OrganizationDatabaseModel> = {};

    if (domain.id !== undefined) db.id = domain.id;
    if (domain.domain !== undefined) db.domain = domain.domain;
    if (domain.displayName !== undefined) db.display_name = domain.displayName;
    if (domain.organizationType !== undefined) db.organization_type = domain.organizationType;

    if (domain.scimEnabled !== undefined) db.scim_enabled = domain.scimEnabled;
    if (domain.scimBaseUrl !== undefined) db.scim_base_url = domain.scimBaseUrl || null;
    if (domain.scimBearerToken !== undefined) db.scim_bearer_token = domain.scimBearerToken || null;

    if (domain.ssoEnabled !== undefined) db.sso_enabled = domain.ssoEnabled;
    if (domain.ssoProvider !== undefined) db.sso_provider = domain.ssoProvider || null;
    if (domain.ssoEntityId !== undefined) db.sso_entity_id = domain.ssoEntityId || null;
    if (domain.ssoSsoUrl !== undefined) db.sso_sso_url = domain.ssoSsoUrl || null;
    if (domain.ssoLogoutUrl !== undefined) db.sso_logout_url = domain.ssoLogoutUrl || null;
    if (domain.ssoCertificate !== undefined) db.sso_certificate = domain.ssoCertificate || null;

    if (domain.ssoMetadata !== undefined) db.sso_metadata = domain.ssoMetadata;
    if (domain.organizationAttributes !== undefined)
      db.organization_attributes = domain.organizationAttributes;

    if (domain.totalUsers !== undefined) db.total_users = domain.totalUsers;
    if (domain.totalAnalyses !== undefined) db.total_analyses = domain.totalAnalyses;

    if (domain.createdAt !== undefined) db.created_at = domain.createdAt;
    if (domain.updatedAt !== undefined) db.updated_at = domain.updatedAt;
    if (domain.deletedAt !== undefined) db.deleted_at = domain.deletedAt || null;

    return db;
  }

  /**
   * Find organization by domain
   */
  async findByDomain(domain: string): Promise<OrganizationDomain | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE domain = $1 AND deleted_at IS NULL`;
    const result = await this.executeQuery<OrganizationDatabaseModel>(sql, [domain]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Find organizations by SSO provider
   */
  async findBySSOProvider(provider: string): Promise<OrganizationDomain[]> {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE sso_enabled = TRUE
      AND sso_provider = $1
      AND deleted_at IS NULL
      ORDER BY display_name ASC
    `;
    const result = await this.executeQuery<OrganizationDatabaseModel>(sql, [provider]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Increment analysis count
   */
  async incrementAnalysisCount(id: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET total_analyses = total_analyses + 1,
          updated_at = NOW()
      WHERE id = $1
    `;
    await this.executeQuery(sql, [id]);
  }

  /**
   * Increment user count
   */
  async incrementUserCount(id: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET total_users = total_users + 1,
          updated_at = NOW()
      WHERE id = $1
    `;
    await this.executeQuery(sql, [id]);
  }

  /**
   * Decrement user count
   */
  async decrementUserCount(id: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET total_users = GREATEST(total_users - 1, 0),
          updated_at = NOW()
      WHERE id = $1
    `;
    await this.executeQuery(sql, [id]);
  }
}

// Singleton instance
let organizationRepositoryInstance: OrganizationRepository | null = null;

export function getOrganizationRepository(
  instance?: OrganizationRepository
): OrganizationRepository {
  if (instance) {
    organizationRepositoryInstance = instance;
    return instance;
  }
  if (!organizationRepositoryInstance) {
    organizationRepositoryInstance = new OrganizationRepository();
  }
  return organizationRepositoryInstance;
}

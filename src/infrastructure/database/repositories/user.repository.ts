/**
 * User Repository
 * Single source of truth for user data access
 */

import { BaseRepository, QueryOptions } from './base.repository.js';
import { UserDomain, UserDatabaseModel } from '../../../core/models/user.model.js';

export class UserRepository extends BaseRepository<UserDomain, UserDatabaseModel> {
  constructor() {
    super('users');
  }

  /**
   * Map database row to domain model
   */
  protected mapToDomain(row: UserDatabaseModel): UserDomain {
    return {
      id: row.id,

      externalId: row.external_id || undefined,
      userName: row.user_name,
      email: row.email,
      givenName: row.given_name || undefined,
      familyName: row.family_name || undefined,
      displayName: row.display_name || undefined,
      active: row.active,

      organizationId: row.organization_id || undefined,
      userType: row.user_type as 'individual' | 'organization',

      googleId: row.google_id || undefined,
      apiKey: row.api_key || undefined,
      apiKeyCreatedAt: row.api_key_created_at || undefined,

      userAttributes: row.user_attributes || undefined,

      totalAnalyses: row.total_analyses,
      lastLoginAt: row.last_login_at || undefined,
      lastAnalysisAt: row.last_analysis_at || undefined,

      version: row.version,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || undefined,
    };
  }

  /**
   * Map domain model to database row
   */
  protected mapToDatabase(domain: Partial<UserDomain>): Partial<UserDatabaseModel> {
    const db: Partial<UserDatabaseModel> = {};

    if (domain.id !== undefined) db.id = domain.id;

    if (domain.externalId !== undefined) db.external_id = domain.externalId || null;
    if (domain.userName !== undefined) db.user_name = domain.userName;
    if (domain.email !== undefined) db.email = domain.email;
    if (domain.givenName !== undefined) db.given_name = domain.givenName || null;
    if (domain.familyName !== undefined) db.family_name = domain.familyName || null;
    if (domain.displayName !== undefined) db.display_name = domain.displayName || null;
    if (domain.active !== undefined) db.active = domain.active;

    if (domain.organizationId !== undefined) db.organization_id = domain.organizationId || null;
    if (domain.userType !== undefined) db.user_type = domain.userType;

    if (domain.googleId !== undefined) db.google_id = domain.googleId || null;
    if (domain.apiKey !== undefined) db.api_key = domain.apiKey || null;
    if (domain.apiKeyCreatedAt !== undefined)
      db.api_key_created_at = domain.apiKeyCreatedAt || null;

    if (domain.userAttributes !== undefined) db.user_attributes = domain.userAttributes;

    if (domain.totalAnalyses !== undefined) db.total_analyses = domain.totalAnalyses;
    if (domain.lastLoginAt !== undefined) db.last_login_at = domain.lastLoginAt || null;
    if (domain.lastAnalysisAt !== undefined) db.last_analysis_at = domain.lastAnalysisAt || null;

    if (domain.version !== undefined) db.version = domain.version;

    if (domain.createdAt !== undefined) db.created_at = domain.createdAt;
    if (domain.updatedAt !== undefined) db.updated_at = domain.updatedAt;
    if (domain.deletedAt !== undefined) db.deleted_at = domain.deletedAt || null;

    return db;
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<UserDomain | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE email = $1 AND deleted_at IS NULL`;
    const result = await this.executeQuery<UserDatabaseModel>(sql, [email]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Find user by external ID (SCIM)
   */
  async findByExternalId(externalId: string): Promise<UserDomain | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE external_id = $1 AND deleted_at IS NULL`;
    const result = await this.executeQuery<UserDatabaseModel>(sql, [externalId]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Find user by Google ID (OAuth)
   */
  async findByGoogleId(googleId: string): Promise<UserDomain | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE google_id = $1 AND deleted_at IS NULL`;
    const result = await this.executeQuery<UserDatabaseModel>(sql, [googleId]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Find user by API key
   */
  async findByApiKey(apiKey: string): Promise<UserDomain | null> {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE api_key = $1
      AND active = TRUE
      AND deleted_at IS NULL
    `;
    const result = await this.executeQuery<UserDatabaseModel>(sql, [apiKey]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Find users by organization
   */
  async findByOrganization(
    organizationId: string,
    options?: QueryOptions
  ): Promise<UserDomain[]> {
    const orderClause = options?.orderBy
      ? `ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`
      : 'ORDER BY created_at DESC';

    const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options?.offset ? `OFFSET ${options.offset}` : '';

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE organization_id = $1
      AND deleted_at IS NULL
      ${orderClause}
      ${limitClause}
      ${offsetClause}
    `;

    const result = await this.executeQuery<UserDatabaseModel>(sql, [organizationId]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Deactivate user (soft delete + set active = false)
   */
  async deactivate(id: string): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET active = FALSE,
          deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `;
    const result = await this.executeQuery(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Reactivate user
   */
  async reactivate(id: string): Promise<boolean> {
    const sql = `
      UPDATE ${this.tableName}
      SET active = TRUE,
          deleted_at = NULL,
          updated_at = NOW()
      WHERE id = $1
    `;
    const result = await this.executeQuery(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Increment analysis count
   */
  async incrementAnalysisCount(id: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET total_analyses = total_analyses + 1,
          last_analysis_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `;
    await this.executeQuery(sql, [id]);
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    const sql = `
      UPDATE ${this.tableName}
      SET last_login_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `;
    await this.executeQuery(sql, [id]);
  }

  /**
   * Update with version increment (for SCIM ETag support)
   */
  async updateWithVersionIncrement(
    id: string,
    data: Partial<UserDomain>
  ): Promise<UserDomain | null> {
    const dbData = this.mapToDatabase(data);

    // Build SET clause
    const setItems: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(dbData)) {
      if (key !== 'id' && key !== 'version') {
        setItems.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    // Add version increment
    setItems.push(`version = version + 1`);
    setItems.push(`updated_at = NOW()`);

    const sql = `
      UPDATE ${this.tableName}
      SET ${setItems.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.executeQuery<UserDatabaseModel>(sql, [...values, id]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }
}

// Singleton instance
let userRepositoryInstance: UserRepository | null = null;

export function getUserRepository(instance?: UserRepository): UserRepository {
  if (instance) {
    userRepositoryInstance = instance;
    return instance;
  }
  if (!userRepositoryInstance) {
    userRepositoryInstance = new UserRepository();
  }
  return userRepositoryInstance;
}

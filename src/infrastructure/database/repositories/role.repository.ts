/**
 * Role Repository
 * Single source of truth for role data access (SCIM groups)
 */

import { BaseRepository, QueryOptions } from './base.repository.js';
import { RoleDomain, RoleDatabaseModel } from '../../../core/models/role.model.js';

export class RoleRepository extends BaseRepository<RoleDomain, RoleDatabaseModel> {
  constructor() {
    super('roles');
  }

  /**
   * Map database row to domain model
   */
  protected mapToDomain(row: RoleDatabaseModel): RoleDomain {
    return {
      id: row.id,

      externalId: row.external_id || undefined,
      displayName: row.display_name,

      organizationId: row.organization_id,

      permissions: row.permissions || {},
      roleAttributes: row.role_attributes || undefined,

      version: row.version,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || undefined,
    };
  }

  /**
   * Map domain model to database row
   */
  protected mapToDatabase(domain: Partial<RoleDomain>): Partial<RoleDatabaseModel> {
    const db: Partial<RoleDatabaseModel> = {};

    if (domain.id !== undefined) db.id = domain.id;

    if (domain.externalId !== undefined) db.external_id = domain.externalId || null;
    if (domain.displayName !== undefined) db.display_name = domain.displayName;

    if (domain.organizationId !== undefined) db.organization_id = domain.organizationId;

    if (domain.permissions !== undefined) db.permissions = domain.permissions;
    if (domain.roleAttributes !== undefined) db.role_attributes = domain.roleAttributes;

    if (domain.version !== undefined) db.version = domain.version;

    if (domain.createdAt !== undefined) db.created_at = domain.createdAt;
    if (domain.updatedAt !== undefined) db.updated_at = domain.updatedAt;
    if (domain.deletedAt !== undefined) db.deleted_at = domain.deletedAt || null;

    return db;
  }

  /**
   * Find roles by organization
   */
  async findByOrganization(
    organizationId: string,
    options?: QueryOptions
  ): Promise<RoleDomain[]> {
    const orderClause = options?.orderBy
      ? `ORDER BY ${options.orderBy} ${options.orderDirection || 'ASC'}`
      : 'ORDER BY display_name ASC';

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

    const result = await this.executeQuery<RoleDatabaseModel>(sql, [organizationId]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Find role by external ID (SCIM)
   */
  async findByExternalId(externalId: string): Promise<RoleDomain | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE external_id = $1 AND deleted_at IS NULL`;
    const result = await this.executeQuery<RoleDatabaseModel>(sql, [externalId]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Find role by display name and organization
   */
  async findByDisplayName(
    organizationId: string,
    displayName: string
  ): Promise<RoleDomain | null> {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE organization_id = $1
      AND display_name = $2
      AND deleted_at IS NULL
    `;
    const result = await this.executeQuery<RoleDatabaseModel>(sql, [organizationId, displayName]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Get members of a role (users in this role)
   */
  async findMembersByRoleId(roleId: string): Promise<string[]> {
    const sql = `
      SELECT user_id FROM user_roles
      WHERE role_id = $1
      ORDER BY assigned_at ASC
    `;
    const result = await this.executeQuery<{ user_id: string }>(sql, [roleId]);
    return result.rows.map((row) => row.user_id);
  }

  /**
   * Get roles for a user
   */
  async findRolesByUserId(userId: string): Promise<RoleDomain[]> {
    const sql = `
      SELECT r.* FROM ${this.tableName} r
      INNER JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1
      AND r.deleted_at IS NULL
      ORDER BY r.display_name ASC
    `;
    const result = await this.executeQuery<RoleDatabaseModel>(sql, [userId]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Add member to role
   */
  async addMember(roleId: string, userId: string, assignedBy: string = 'scim'): Promise<void> {
    const sql = `
      INSERT INTO user_roles (user_id, role_id, assigned_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, role_id) DO NOTHING
    `;
    await this.executeQuery(sql, [userId, roleId, assignedBy]);
  }

  /**
   * Remove member from role
   */
  async removeMember(roleId: string, userId: string): Promise<void> {
    const sql = `
      DELETE FROM user_roles
      WHERE user_id = $1 AND role_id = $2
    `;
    await this.executeQuery(sql, [userId, roleId]);
  }

  /**
   * Replace all members of a role (SCIM PATCH operation)
   */
  async replaceMembers(
    roleId: string,
    userIds: string[],
    assignedBy: string = 'scim'
  ): Promise<void> {
    // Use transaction to ensure atomicity
    const deleteSQL = `DELETE FROM user_roles WHERE role_id = $1`;
    await this.executeQuery(deleteSQL, [roleId]);

    if (userIds.length > 0) {
      // Insert new members
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      userIds.forEach((userId) => {
        values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
        params.push(userId, roleId, assignedBy);
        paramIndex += 3;
      });

      const insertSQL = `
        INSERT INTO user_roles (user_id, role_id, assigned_by)
        VALUES ${values.join(', ')}
        ON CONFLICT (user_id, role_id) DO NOTHING
      `;
      await this.executeQuery(insertSQL, params);
    }
  }

  /**
   * Check if user has role
   */
  async hasRole(userId: string, roleId: string): Promise<boolean> {
    const sql = `
      SELECT 1 FROM user_roles
      WHERE user_id = $1 AND role_id = $2
    `;
    const result = await this.executeQuery(sql, [userId, roleId]);
    return result.rows.length > 0;
  }

  /**
   * Check if user has permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const sql = `
      SELECT 1 FROM ${this.tableName} r
      INNER JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1
      AND r.permissions ? $2
      AND (r.permissions->$2)::boolean = true
      AND r.deleted_at IS NULL
      LIMIT 1
    `;
    const result = await this.executeQuery(sql, [userId, permission]);
    return result.rows.length > 0;
  }

  /**
   * Update with version increment (for SCIM ETag support)
   */
  async updateWithVersionIncrement(
    id: string,
    data: Partial<RoleDomain>
  ): Promise<RoleDomain | null> {
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

    const result = await this.executeQuery<RoleDatabaseModel>(sql, [...values, id]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }
}

// Singleton instance
let roleRepositoryInstance: RoleRepository | null = null;

export function getRoleRepository(instance?: RoleRepository): RoleRepository {
  if (instance) {
    roleRepositoryInstance = instance;
    return instance;
  }
  if (!roleRepositoryInstance) {
    roleRepositoryInstance = new RoleRepository();
  }
  return roleRepositoryInstance;
}

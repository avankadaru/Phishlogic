/**
 * SCIM Service
 * Business logic for SCIM 2.0 user and group provisioning
 * RFC 7644 compliant
 */

import { getUserRepository, UserRepository } from '../../infrastructure/database/repositories/user.repository.js';
import { getRoleRepository, RoleRepository } from '../../infrastructure/database/repositories/role.repository.js';
import { getAuditLogRepository, AuditLogRepository } from '../../infrastructure/database/repositories/audit-log.repository.js';
import { getOrganizationRepository, OrganizationRepository } from '../../infrastructure/database/repositories/organization.repository.js';
import { UserDomain } from '../models/user.model.js';
import { RoleDomain } from '../models/role.model.js';
import { getLogger } from '../../infrastructure/logging/logger.js';
import type { ScimUser, ScimGroup, ScimPatchOperation, ScimListResponse } from '../../api/schemas/scim.schema.js';
import { createScimListResponse, generateETag } from '../../api/schemas/scim.schema.js';

const logger = getLogger();

export interface IScimService {
  // User operations
  createUser(scimUser: ScimUser, organizationId: string, actorId?: string): Promise<ScimUser>;
  getUser(userId: string, organizationId: string): Promise<ScimUser | null>;
  listUsers(organizationId: string, filter?: string, startIndex?: number, count?: number): Promise<ScimListResponse>;
  updateUser(userId: string, scimUser: ScimUser, organizationId: string, actorId?: string): Promise<ScimUser>;
  patchUser(userId: string, operations: ScimPatchOperation[], organizationId: string, actorId?: string): Promise<ScimUser>;
  deleteUser(userId: string, organizationId: string, actorId?: string): Promise<void>;

  // Group operations
  createGroup(scimGroup: ScimGroup, organizationId: string, actorId?: string): Promise<ScimGroup>;
  getGroup(groupId: string, organizationId: string): Promise<ScimGroup | null>;
  listGroups(organizationId: string, filter?: string, startIndex?: number, count?: number): Promise<ScimListResponse>;
  patchGroup(groupId: string, operations: ScimPatchOperation[], organizationId: string, actorId?: string): Promise<ScimGroup>;
  deleteGroup(groupId: string, organizationId: string, actorId?: string): Promise<void>;
}

export class ScimService implements IScimService {
  constructor(
    private userRepo: UserRepository = getUserRepository(),
    private roleRepo: RoleRepository = getRoleRepository(),
    private auditLogRepo: AuditLogRepository = getAuditLogRepository(),
    private orgRepo: OrganizationRepository = getOrganizationRepository()
  ) {}

  // ========== USER OPERATIONS ==========

  /**
   * Create user via SCIM
   */
  async createUser(scimUser: ScimUser, organizationId: string, actorId?: string): Promise<ScimUser> {
    logger.info({ msg: 'SCIM: Creating user', userName: scimUser.userName, organizationId });

    // Extract email from userName or emails array
    const email = scimUser.emails?.[0]?.value || scimUser.userName;

    // Check if user already exists
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser && !existingUser.deletedAt) {
      throw new Error(`User with email ${email} already exists`);
    }

    // Create user
    const user = await this.userRepo.insert({
      externalId: scimUser.externalId,
      userName: scimUser.userName,
      email,
      givenName: scimUser.name?.givenName,
      familyName: scimUser.name?.familyName,
      displayName: scimUser.displayName || scimUser.name?.formatted || `${scimUser.name?.givenName} ${scimUser.name?.familyName}`,
      active: scimUser.active,
      organizationId,
      userType: 'organization',
      totalAnalyses: 0,
      version: 1,
      userAttributes: {
        provisioned_via: 'scim',
        scim_schemas: scimUser.schemas,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Increment organization user count
    await this.orgRepo.incrementUserCount(organizationId);

    // Log to audit
    await this.auditLogRepo.create({
      eventName: 'user.created',
      eventType: 'scim',
      occurredAt: new Date(),
      entityType: 'user',
      entityId: user.id,
      entityName: user.email,
      actorType: actorId ? 'user' : 'idp',
      actorId,
      actorName: actorId ? 'admin' : 'Identity Provider',
      organizationId,
      source: 'scim_api',
      eventMetadata: {
        external_id: scimUser.externalId,
        user_name: scimUser.userName,
        provisioning_method: 'scim_v2',
      },
      success: true,
    });

    logger.info({ msg: 'SCIM: User created successfully', userId: user.id });

    return this.mapUserToScim(user, organizationId);
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string, organizationId: string): Promise<ScimUser | null> {
    const user = await this.userRepo.findById(userId);

    if (!user || user.deletedAt || user.organizationId !== organizationId) {
      return null;
    }

    return this.mapUserToScim(user, organizationId);
  }

  /**
   * List users with optional filtering
   */
  async listUsers(
    organizationId: string,
    filter?: string,
    startIndex: number = 1,
    count: number = 100
  ): Promise<ScimListResponse> {
    // Calculate offset (SCIM uses 1-based indexing)
    const offset = startIndex - 1;

    let users: UserDomain[];
    let total: number;

    if (filter) {
      // Parse SCIM filter (simple implementation for userName eq "...")
      const emailMatch = filter.match(/userName eq "([^"]+)"/i);
      const externalIdMatch = filter.match(/externalId eq "([^"]+)"/i);

      if (emailMatch && emailMatch[1]) {
        const user = await this.userRepo.findByEmail(emailMatch[1]);
        users = user && user.organizationId === organizationId && !user.deletedAt ? [user] : [];
        total = users.length;
      } else if (externalIdMatch && externalIdMatch[1]) {
        const user = await this.userRepo.findByExternalId(externalIdMatch[1]);
        users = user && user.organizationId === organizationId && !user.deletedAt ? [user] : [];
        total = users.length;
      } else {
        // Filter not supported, return all
        users = await this.userRepo.findByOrganization(organizationId, { limit: count, offset });
        total = await this.userRepo.count({ organization_id: organizationId, deleted_at: null });
      }
    } else {
      // No filter, return all users
      users = await this.userRepo.findByOrganization(organizationId, { limit: count, offset });
      total = await this.userRepo.count({ organization_id: organizationId, deleted_at: null });
    }

    const scimUsers = users.map(user => this.mapUserToScim(user, organizationId));

    return createScimListResponse(scimUsers, total, startIndex, scimUsers.length);
  }

  /**
   * Update user (PUT - full replacement)
   */
  async updateUser(
    userId: string,
    scimUser: ScimUser,
    organizationId: string,
    actorId?: string
  ): Promise<ScimUser> {
    const existingUser = await this.userRepo.findById(userId);

    if (!existingUser || existingUser.deletedAt || existingUser.organizationId !== organizationId) {
      throw new Error('User not found');
    }

    const email = scimUser.emails?.[0]?.value || scimUser.userName;

    const updatedUser = await this.userRepo.updateWithVersionIncrement(userId, {
      externalId: scimUser.externalId,
      userName: scimUser.userName,
      email,
      givenName: scimUser.name?.givenName,
      familyName: scimUser.name?.familyName,
      displayName: scimUser.displayName || scimUser.name?.formatted,
      active: scimUser.active,
    });

    if (!updatedUser) {
      throw new Error('User update failed');
    }

    // Log to audit
    await this.auditLogRepo.create({
      eventName: 'user.updated',
      eventType: 'scim',
      occurredAt: new Date(),
      entityType: 'user',
      entityId: userId,
      entityName: updatedUser.email,
      actorType: actorId ? 'user' : 'idp',
      actorId,
      organizationId,
      source: 'scim_api',
      eventMetadata: {
        operation: 'PUT',
        changes: {
          active: { old: existingUser.active, new: updatedUser.active },
          display_name: { old: existingUser.displayName, new: updatedUser.displayName },
        },
      },
      success: true,
    });

    return this.mapUserToScim(updatedUser, organizationId);
  }

  /**
   * Patch user (PATCH - partial update)
   */
  async patchUser(
    userId: string,
    operations: ScimPatchOperation[],
    organizationId: string,
    actorId?: string
  ): Promise<ScimUser> {
    const existingUser = await this.userRepo.findById(userId);

    if (!existingUser || existingUser.deletedAt || existingUser.organizationId !== organizationId) {
      throw new Error('User not found');
    }

    // Apply patch operations
    const updates: Partial<UserDomain> = {};

    for (const op of operations) {
      if (op.op === 'replace') {
        if (op.path === 'active') {
          updates.active = op.value as boolean;
        } else if (op.path === 'displayName') {
          updates.displayName = op.value as string;
        } else if (!op.path && typeof op.value === 'object') {
          // Replace entire resource
          if ('active' in op.value) updates.active = op.value.active;
          if ('displayName' in op.value) updates.displayName = op.value.displayName;
        }
      }
    }

    const updatedUser = await this.userRepo.updateWithVersionIncrement(userId, updates);

    if (!updatedUser) {
      throw new Error('User patch failed');
    }

    // Log to audit
    await this.auditLogRepo.create({
      eventName: 'user.patched',
      eventType: 'scim',
      occurredAt: new Date(),
      entityType: 'user',
      entityId: userId,
      entityName: updatedUser.email,
      actorType: actorId ? 'user' : 'idp',
      actorId,
      organizationId,
      source: 'scim_api',
      eventMetadata: {
        operation: 'PATCH',
        operations,
      },
      success: true,
    });

    return this.mapUserToScim(updatedUser, organizationId);
  }

  /**
   * Delete user (deactivate)
   */
  async deleteUser(userId: string, organizationId: string, actorId?: string): Promise<void> {
    const user = await this.userRepo.findById(userId);

    if (!user || user.deletedAt || user.organizationId !== organizationId) {
      throw new Error('User not found');
    }

    await this.userRepo.deactivate(userId);

    // Decrement organization user count
    await this.orgRepo.decrementUserCount(organizationId);

    // Log to audit
    await this.auditLogRepo.create({
      eventName: 'user.deleted',
      eventType: 'scim',
      occurredAt: new Date(),
      entityType: 'user',
      entityId: userId,
      entityName: user.email,
      actorType: actorId ? 'user' : 'idp',
      actorId,
      organizationId,
      source: 'scim_api',
      eventMetadata: {
        operation: 'DELETE',
      },
      success: true,
    });

    logger.info({ msg: 'SCIM: User deleted', userId });
  }

  // ========== GROUP OPERATIONS ==========

  /**
   * Create group (role)
   */
  async createGroup(scimGroup: ScimGroup, organizationId: string, actorId?: string): Promise<ScimGroup> {
    logger.info({ msg: 'SCIM: Creating group', displayName: scimGroup.displayName, organizationId });

    // Check if group already exists
    const existing = await this.roleRepo.findByDisplayName(organizationId, scimGroup.displayName);
    if (existing && !existing.deletedAt) {
      throw new Error(`Group with name ${scimGroup.displayName} already exists`);
    }

    // Create role
    const role = await this.roleRepo.insert({
      externalId: scimGroup.externalId,
      displayName: scimGroup.displayName,
      organizationId,
      permissions: {}, // Default empty permissions
      roleAttributes: {
        provisioned_via: 'scim',
        scim_schemas: scimGroup.schemas,
      },
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add members if provided
    if (scimGroup.members && scimGroup.members.length > 0) {
      for (const member of scimGroup.members) {
        await this.roleRepo.addMember(role.id, member.value, 'scim');
      }
    }

    // Log to audit
    await this.auditLogRepo.create({
      eventName: 'group.created',
      eventType: 'scim',
      occurredAt: new Date(),
      entityType: 'role',
      entityId: role.id,
      entityName: role.displayName,
      actorType: actorId ? 'user' : 'idp',
      actorId,
      organizationId,
      source: 'scim_api',
      eventMetadata: {
        external_id: scimGroup.externalId,
        member_count: scimGroup.members?.length || 0,
      },
      success: true,
    });

    logger.info({ msg: 'SCIM: Group created successfully', roleId: role.id });

    return this.mapRoleToScim(role, organizationId);
  }

  /**
   * Get group by ID
   */
  async getGroup(groupId: string, organizationId: string): Promise<ScimGroup | null> {
    const role = await this.roleRepo.findById(groupId);

    if (!role || role.deletedAt || role.organizationId !== organizationId) {
      return null;
    }

    return this.mapRoleToScim(role, organizationId);
  }

  /**
   * List groups with optional filtering
   */
  async listGroups(
    organizationId: string,
    filter?: string,
    startIndex: number = 1,
    count: number = 100
  ): Promise<ScimListResponse> {
    const offset = startIndex - 1;

    let roles: RoleDomain[];
    let total: number;

    if (filter) {
      const displayNameMatch = filter.match(/displayName eq "([^"]+)"/i);
      const externalIdMatch = filter.match(/externalId eq "([^"]+)"/i);

      if (displayNameMatch && displayNameMatch[1]) {
        const role = await this.roleRepo.findByDisplayName(organizationId, displayNameMatch[1]);
        roles = role && !role.deletedAt ? [role] : [];
        total = roles.length;
      } else if (externalIdMatch && externalIdMatch[1]) {
        const role = await this.roleRepo.findByExternalId(externalIdMatch[1]);
        roles = role && role.organizationId === organizationId && !role.deletedAt ? [role] : [];
        total = roles.length;
      } else {
        roles = await this.roleRepo.findByOrganization(organizationId, { limit: count, offset });
        total = await this.roleRepo.count({ organization_id: organizationId, deleted_at: null });
      }
    } else {
      roles = await this.roleRepo.findByOrganization(organizationId, { limit: count, offset });
      total = await this.roleRepo.count({ organization_id: organizationId, deleted_at: null });
    }

    const scimGroups = await Promise.all(
      roles.map(role => this.mapRoleToScim(role, organizationId))
    );

    return createScimListResponse(scimGroups, total, startIndex, scimGroups.length);
  }

  /**
   * Patch group (update membership)
   */
  async patchGroup(
    groupId: string,
    operations: ScimPatchOperation[],
    organizationId: string,
    actorId?: string
  ): Promise<ScimGroup> {
    const role = await this.roleRepo.findById(groupId);

    if (!role || role.deletedAt || role.organizationId !== organizationId) {
      throw new Error('Group not found');
    }

    // Apply patch operations
    for (const op of operations) {
      if (op.path === 'members') {
        if (op.op === 'add') {
          // Add members
          const members = Array.isArray(op.value) ? op.value : [op.value];
          for (const member of members) {
            if (member.value) {
              await this.roleRepo.addMember(groupId, member.value, 'scim');
            }
          }
        } else if (op.op === 'remove') {
          // Remove members
          const members = Array.isArray(op.value) ? op.value : [op.value];
          for (const member of members) {
            if (member.value) {
              await this.roleRepo.removeMember(groupId, member.value);
            }
          }
        } else if (op.op === 'replace') {
          // Replace all members
          const members = Array.isArray(op.value) ? op.value : [op.value];
          const memberIds = members.map(m => m.value).filter(Boolean);
          await this.roleRepo.replaceMembers(groupId, memberIds, 'scim');
        }
      }
    }

    // Increment version
    await this.roleRepo.updateWithVersionIncrement(groupId, {});

    // Log to audit
    await this.auditLogRepo.create({
      eventName: 'group.patched',
      eventType: 'scim',
      occurredAt: new Date(),
      entityType: 'role',
      entityId: groupId,
      entityName: role.displayName,
      actorType: actorId ? 'user' : 'idp',
      actorId,
      organizationId,
      source: 'scim_api',
      eventMetadata: {
        operation: 'PATCH',
        operations,
      },
      success: true,
    });

    return this.mapRoleToScim(role, organizationId);
  }

  /**
   * Delete group
   */
  async deleteGroup(groupId: string, organizationId: string, actorId?: string): Promise<void> {
    const role = await this.roleRepo.findById(groupId);

    if (!role || role.deletedAt || role.organizationId !== organizationId) {
      throw new Error('Group not found');
    }

    await this.roleRepo.delete(groupId);

    // Log to audit
    await this.auditLogRepo.create({
      eventName: 'group.deleted',
      eventType: 'scim',
      occurredAt: new Date(),
      entityType: 'role',
      entityId: groupId,
      entityName: role.displayName,
      actorType: actorId ? 'user' : 'idp',
      actorId,
      organizationId,
      source: 'scim_api',
      eventMetadata: {
        operation: 'DELETE',
      },
      success: true,
    });

    logger.info({ msg: 'SCIM: Group deleted', groupId });
  }

  // ========== MAPPING HELPERS ==========

  private mapUserToScim(user: UserDomain, _organizationId: string): ScimUser {
    const baseUrl = process.env['API_BASE_URL'] || 'http://localhost:3000';

    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id: user.id,
      externalId: user.externalId,
      userName: user.userName,
      name: {
        givenName: user.givenName,
        familyName: user.familyName,
        formatted: user.displayName,
      },
      displayName: user.displayName,
      active: user.active,
      emails: [
        {
          value: user.email,
          primary: true,
        },
      ],
      meta: {
        resourceType: 'User',
        created: user.createdAt.toISOString(),
        lastModified: user.updatedAt.toISOString(),
        location: `${baseUrl}/scim/v2/Users/${user.id}`,
        version: generateETag(user.version),
      },
    };
  }

  private async mapRoleToScim(role: RoleDomain, _organizationId: string): Promise<ScimGroup> {
    const baseUrl = process.env['API_BASE_URL'] || 'http://localhost:3000';

    // Get members
    const memberIds = await this.roleRepo.findMembersByRoleId(role.id);
    const members = await Promise.all(
      memberIds.map(async (userId) => {
        const user = await this.userRepo.findById(userId);
        return {
          value: userId,
          $ref: `${baseUrl}/scim/v2/Users/${userId}`,
          type: 'User' as const,
          display: user?.displayName || user?.email,
        };
      })
    );

    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: role.id,
      externalId: role.externalId,
      displayName: role.displayName,
      members: members.filter(m => m.display !== undefined),
      meta: {
        resourceType: 'Group',
        created: role.createdAt.toISOString(),
        lastModified: role.updatedAt.toISOString(),
        location: `${baseUrl}/scim/v2/Groups/${role.id}`,
        version: generateETag(role.version),
      },
    };
  }
}

// Singleton instance
let scimServiceInstance: ScimService | null = null;

export function getScimService(instance?: ScimService): ScimService {
  if (instance) {
    scimServiceInstance = instance;
    return instance;
  }
  if (!scimServiceInstance) {
    scimServiceInstance = new ScimService();
  }
  return scimServiceInstance;
}

/**
 * Audit Log Repository
 * Single source of truth for audit event data access
 */

import { BaseRepository, QueryOptions } from './base.repository.js';
import {
  AuditEventDomain,
  AuditEventDatabaseModel,
  PaginatedAuditEvents,
} from '../../../core/models/audit-event.model.js';
import { getLogger } from '../../logging/logger.js';

const logger = getLogger();

export class AuditLogRepository extends BaseRepository<
  AuditEventDomain,
  AuditEventDatabaseModel
> {
  constructor() {
    super('audit_log');
  }

  /**
   * Map database row to domain model
   */
  protected mapToDomain(row: AuditEventDatabaseModel): AuditEventDomain {
    return {
      id: row.id,

      eventName: row.event_name,
      eventType: row.event_type as any,

      occurredAt: row.occurred_at,
      loggedAt: row.logged_at,

      entityType: row.entity_type || undefined,
      entityId: row.entity_id || undefined,
      entityName: row.entity_name || undefined,

      actorType: (row.actor_type as any) || undefined,
      actorId: row.actor_id || undefined,
      actorName: row.actor_name || undefined,

      organizationId: row.organization_id || undefined,
      source: row.source || undefined,
      ipAddress: row.ip_address || undefined,
      userAgent: row.user_agent || undefined,

      eventMetadata: row.event_metadata || undefined,

      analysisId: row.analysis_id || undefined,
      verdict: (row.verdict as any) || undefined,
      confidence: row.confidence || undefined,
      processingTimeMs: row.processing_time_ms || undefined,

      success: row.success,
      errorMessage: row.error_message || undefined,
    };
  }

  /**
   * Map domain model to database row
   */
  protected mapToDatabase(domain: Partial<AuditEventDomain>): Partial<AuditEventDatabaseModel> {
    const db: Partial<AuditEventDatabaseModel> = {};

    if (domain.id !== undefined) db.id = domain.id;

    if (domain.eventName !== undefined) db.event_name = domain.eventName;
    if (domain.eventType !== undefined) db.event_type = domain.eventType;

    if (domain.occurredAt !== undefined) db.occurred_at = domain.occurredAt;
    if (domain.loggedAt !== undefined) db.logged_at = domain.loggedAt;

    if (domain.entityType !== undefined) db.entity_type = domain.entityType || null;
    if (domain.entityId !== undefined) db.entity_id = domain.entityId || null;
    if (domain.entityName !== undefined) db.entity_name = domain.entityName || null;

    if (domain.actorType !== undefined) db.actor_type = domain.actorType || null;
    if (domain.actorId !== undefined) db.actor_id = domain.actorId || null;
    if (domain.actorName !== undefined) db.actor_name = domain.actorName || null;

    if (domain.organizationId !== undefined) db.organization_id = domain.organizationId || null;
    if (domain.source !== undefined) db.source = domain.source || null;
    if (domain.ipAddress !== undefined) db.ip_address = domain.ipAddress || null;
    if (domain.userAgent !== undefined) db.user_agent = domain.userAgent || null;

    if (domain.eventMetadata !== undefined) db.event_metadata = domain.eventMetadata;

    if (domain.analysisId !== undefined) db.analysis_id = domain.analysisId || null;
    if (domain.verdict !== undefined) db.verdict = domain.verdict || null;
    if (domain.confidence !== undefined) db.confidence = domain.confidence || null;
    if (domain.processingTimeMs !== undefined)
      db.processing_time_ms = domain.processingTimeMs || null;

    if (domain.success !== undefined) db.success = domain.success;
    if (domain.errorMessage !== undefined) db.error_message = domain.errorMessage || null;

    return db;
  }

  /**
   * Create audit event
   * Sets logged_at to NOW() if not provided
   */
  async create(data: Partial<AuditEventDomain>): Promise<AuditEventDomain> {
    // Set logged_at to now if not provided
    if (!data.loggedAt) {
      data.loggedAt = new Date();
    }
    // Set occurred_at to now if not provided
    if (!data.occurredAt) {
      data.occurredAt = new Date();
    }

    return this.insert(data);
  }

  /**
   * Find audit events by user with pagination
   */
  async findByUser(
    userId: string,
    options?: QueryOptions
  ): Promise<PaginatedAuditEvents> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const orderBy = options?.orderBy || 'occurred_at';
    const orderDirection = options?.orderDirection || 'DESC';

    // Get total count
    const countSQL = `
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE actor_id = $1 OR entity_id = $1
    `;
    const countResult = await this.executeQuery<{ count: string }>(countSQL, [userId]);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get paginated results
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE actor_id = $1 OR entity_id = $1
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeQuery<AuditEventDatabaseModel>(sql, [userId, limit, offset]);
    const items = result.rows.map((row) => this.mapToDomain(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Find audit events by organization with pagination
   */
  async findByOrganization(
    organizationId: string,
    options?: QueryOptions
  ): Promise<PaginatedAuditEvents> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const orderBy = options?.orderBy || 'occurred_at';
    const orderDirection = options?.orderDirection || 'DESC';

    // Get total count
    const countSQL = `
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE organization_id = $1
    `;
    const countResult = await this.executeQuery<{ count: string }>(countSQL, [organizationId]);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get paginated results
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE organization_id = $1
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeQuery<AuditEventDatabaseModel>(sql, [
      organizationId,
      limit,
      offset,
    ]);
    const items = result.rows.map((row) => this.mapToDomain(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Find audit events by event type with pagination
   */
  async findByEventType(
    eventType: string,
    options?: QueryOptions
  ): Promise<PaginatedAuditEvents> {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    const orderBy = options?.orderBy || 'occurred_at';
    const orderDirection = options?.orderDirection || 'DESC';

    // Get total count
    const countSQL = `
      SELECT COUNT(*) as count FROM ${this.tableName}
      WHERE event_type = $1
    `;
    const countResult = await this.executeQuery<{ count: string }>(countSQL, [eventType]);
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    // Get paginated results
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE event_type = $1
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeQuery<AuditEventDatabaseModel>(sql, [
      eventType,
      limit,
      offset,
    ]);
    const items = result.rows.map((row) => this.mapToDomain(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Find audit events by event name
   */
  async findByEventName(
    eventName: string,
    options?: QueryOptions
  ): Promise<AuditEventDomain[]> {
    const orderBy = options?.orderBy || 'occurred_at';
    const orderDirection = options?.orderDirection || 'DESC';
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE event_name = $1
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT $2 OFFSET $3
    `;

    const result = await this.executeQuery<AuditEventDatabaseModel>(sql, [
      eventName,
      limit,
      offset,
    ]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Find recent events (last N hours)
   */
  async findRecent(hours: number = 24, limit: number = 100): Promise<AuditEventDomain[]> {
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE occurred_at >= NOW() - INTERVAL '${hours} hours'
      ORDER BY occurred_at DESC
      LIMIT $1
    `;

    const result = await this.executeQuery<AuditEventDatabaseModel>(sql, [limit]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Find failed events (for troubleshooting)
   */
  async findFailedEvents(
    organizationId?: string,
    limit: number = 100
  ): Promise<AuditEventDomain[]> {
    let sql = `
      SELECT * FROM ${this.tableName}
      WHERE success = FALSE
    `;

    const params: any[] = [];
    if (organizationId) {
      sql += ` AND organization_id = $1`;
      params.push(organizationId);
    }

    sql += ` ORDER BY occurred_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.executeQuery<AuditEventDatabaseModel>(sql, params);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Delete audit logs older than N days (for compliance/retention)
   * Returns number of rows deleted
   */
  async deleteOlderThan(days: number, organizationId?: string): Promise<number> {
    let sql = `
      DELETE FROM ${this.tableName}
      WHERE occurred_at < NOW() - INTERVAL '${days} days'
    `;

    const params: any[] = [];
    if (organizationId) {
      sql += ` AND organization_id = $1`;
      params.push(organizationId);
    }

    const result = await this.executeQuery(sql, params);
    const deletedCount = result.rowCount ?? 0;

    logger.info({
      deletedCount,
      days,
      organizationId,
      msg: 'Deleted old audit logs',
    });

    return deletedCount;
  }

  /**
   * Get audit statistics for organization
   */
  async getStatistics(
    organizationId: string,
    days: number = 30
  ): Promise<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    eventsByType: Record<string, number>;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total_events,
        SUM(CASE WHEN success = TRUE THEN 1 ELSE 0 END) as successful_events,
        SUM(CASE WHEN success = FALSE THEN 1 ELSE 0 END) as failed_events,
        jsonb_object_agg(event_type, event_count) as events_by_type
      FROM (
        SELECT
          event_type,
          COUNT(*) as event_count
        FROM ${this.tableName}
        WHERE organization_id = $1
        AND occurred_at >= NOW() - INTERVAL '${days} days'
        GROUP BY event_type
      ) subquery,
      ${this.tableName}
      WHERE organization_id = $1
      AND occurred_at >= NOW() - INTERVAL '${days} days'
      GROUP BY events_by_type
    `;

    const result = await this.executeQuery<{
      total_events: string;
      successful_events: string;
      failed_events: string;
      events_by_type: any;
    }>(sql, [organizationId]);

    const row = result.rows[0];

    return {
      totalEvents: parseInt(row?.total_events || '0', 10),
      successfulEvents: parseInt(row?.successful_events || '0', 10),
      failedEvents: parseInt(row?.failed_events || '0', 10),
      eventsByType: row?.events_by_type || {},
    };
  }
}

// Singleton instance
let auditLogRepositoryInstance: AuditLogRepository | null = null;

export function getAuditLogRepository(instance?: AuditLogRepository): AuditLogRepository {
  if (instance) {
    auditLogRepositoryInstance = instance;
    return instance;
  }
  if (!auditLogRepositoryInstance) {
    auditLogRepositoryInstance = new AuditLogRepository();
  }
  return auditLogRepositoryInstance;
}

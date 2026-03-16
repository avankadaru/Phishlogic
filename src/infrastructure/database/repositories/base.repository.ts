/**
 * Base Repository Pattern
 *
 * Design Principles:
 * - Single point of database access (no direct DB calls elsewhere)
 * - Schema stability via JSONB (add, not rename)
 * - Views for specific formats (not column changes)
 * - Performance-first column additions (only when critical)
 * - Data Mapper pattern (DB models ≠ Domain models)
 * - Type Converter Pattern for JSONB columns (automatic serialization)
 */

import { query as dbQuery, QueryResult } from '../client.js';
import { getLogger } from '../../logging/logger.js';
import { processValuesForTable } from './jsonb-type-converter.js';

const logger = getLogger();

/**
 * Query options for common operations
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * Base Repository - All repositories extend this
 * Provides common CRUD operations and query utilities
 */
export abstract class BaseRepository<TDomain, TDatabase extends Record<string, any> = any> {
  constructor(protected tableName: string) {}

  /**
   * Execute raw SQL query (internal use only)
   * All external code should use repository methods
   */
  protected async executeQuery<T extends Record<string, any> = any>(
    sql: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    try {
      const result = await dbQuery(sql, params);
      return result as QueryResult<T>;
    } catch (error) {
      logger.error({
        table: this.tableName,
        sql,
        params,
        error: error instanceof Error ? error.message : String(error),
        msg: 'Database query failed',
      });
      throw error;
    }
  }

  /**
   * Find by ID
   * Uses primary key (id column expected)
   */
  async findById(id: string): Promise<TDomain | null> {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = $1`;
    const result = await this.executeQuery<TDatabase>(sql, [id]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Find many with optional filters
   */
  async findMany(
    filters?: Record<string, any>,
    options?: QueryOptions
  ): Promise<TDomain[]> {
    const { whereClause, values } = this.buildWhereClause(filters);
    const orderClause = this.buildOrderClause(options);
    const limitClause = this.buildLimitClause(options);

    const sql = `
      SELECT * FROM ${this.tableName}
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const result = await this.executeQuery<TDatabase>(sql, values);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Count records matching filters
   */
  async count(filters?: Record<string, any>): Promise<number> {
    const { whereClause, values } = this.buildWhereClause(filters);
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;

    const result = await this.executeQuery<{ count: string }>(sql, values);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  /**
   * Insert single record
   */
  async insert(data: Partial<TDomain>): Promise<TDomain> {
    const dbData = this.mapToDatabase(data);
    const { columns, placeholders, values } = this.buildInsertData(dbData);

    const sql = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await this.executeQuery<TDatabase>(sql, values);
    if (!result.rows[0]) {
      throw new Error('Insert failed: no rows returned');
    }
    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Update by ID
   */
  async update(id: string, data: Partial<TDomain>): Promise<TDomain | null> {
    const dbData = this.mapToDatabase(data);
    const { setClause, values } = this.buildUpdateData(dbData);

    const sql = `
      UPDATE ${this.tableName}
      SET ${setClause}
      WHERE id = $${values.length + 1}
      RETURNING *
    `;

    const result = await this.executeQuery<TDatabase>(sql, [...values, id]);

    if (result.rows.length === 0 || !result.rows[0]) {
      return null;
    }

    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Upsert (Insert or Update on conflict)
   * Performs INSERT ... ON CONFLICT DO UPDATE
   */
  async upsert(data: Partial<TDomain>): Promise<TDomain> {
    const dbData = this.mapToDatabase(data);
    const { columns, placeholders, values } = this.buildInsertData(dbData);

    // Build update clause for ON CONFLICT (exclude id column)
    const updateColumns = Object.keys(dbData).filter((col) => col !== 'id');
    const updateClause = updateColumns.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

    const sql = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      ON CONFLICT (id) DO UPDATE SET
        ${updateClause}
      RETURNING *
    `;

    const result = await this.executeQuery<TDatabase>(sql, values);
    if (!result.rows[0]) {
      throw new Error('Upsert failed: no rows returned');
    }
    return this.mapToDomain(result.rows[0]);
  }

  /**
   * Delete by ID (soft delete if deleted_at column exists)
   */
  async delete(id: string): Promise<boolean> {
    // Check if table has deleted_at column (soft delete)
    const hasDeletedAt = await this.hasColumn('deleted_at');

    let sql: string;
    if (hasDeletedAt) {
      // Soft delete
      sql = `UPDATE ${this.tableName} SET deleted_at = NOW() WHERE id = $1`;
    } else {
      // Hard delete
      sql = `DELETE FROM ${this.tableName} WHERE id = $1`;
    }

    const result = await this.executeQuery(sql, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Query JSONB column efficiently
   * Prefer this over adding columns for performance
   */
  protected async queryJsonb(
    jsonbColumn: string,
    path: string,
    value: any,
    options?: QueryOptions
  ): Promise<TDomain[]> {
    const orderClause = this.buildOrderClause(options);
    const limitClause = this.buildLimitClause(options);

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE ${jsonbColumn}->>'${path}' = $1
      ${orderClause}
      ${limitClause}
    `;

    const result = await this.executeQuery<TDatabase>(sql, [value]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Query JSONB with GIN index support
   * Fastest for JSONB queries (uses index)
   */
  protected async queryJsonbContains(
    jsonbColumn: string,
    containsValue: Record<string, any>,
    options?: QueryOptions
  ): Promise<TDomain[]> {
    const orderClause = this.buildOrderClause(options);
    const limitClause = this.buildLimitClause(options);

    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE ${jsonbColumn} @> $1::jsonb
      ${orderClause}
      ${limitClause}
    `;

    const result = await this.executeQuery<TDatabase>(sql, [JSON.stringify(containsValue)]);
    return result.rows.map((row) => this.mapToDomain(row));
  }

  /**
   * Abstract: Map database row to domain model
   * Implement in concrete repositories
   */
  protected abstract mapToDomain(row: TDatabase): TDomain;

  /**
   * Abstract: Map domain model to database row
   * Implement in concrete repositories
   */
  protected abstract mapToDatabase(domain: Partial<TDomain>): Partial<TDatabase>;

  // ========== Private Utility Methods ==========

  private buildWhereClause(filters?: Record<string, any>): {
    whereClause: string;
    values: any[];
  } {
    if (!filters || Object.keys(filters).length === 0) {
      return { whereClause: '', values: [] };
    }

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null) {
        conditions.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return { whereClause, values };
  }

  private buildOrderClause(options?: QueryOptions): string {
    if (!options?.orderBy) {
      return '';
    }

    const direction = options.orderDirection || 'DESC';
    return `ORDER BY ${options.orderBy} ${direction}`;
  }

  private buildLimitClause(options?: QueryOptions): string {
    const parts: string[] = [];

    if (options?.limit) {
      parts.push(`LIMIT ${options.limit}`);
    }

    if (options?.offset) {
      parts.push(`OFFSET ${options.offset}`);
    }

    return parts.join(' ');
  }

  private buildInsertData(data: Record<string, any>): {
    columns: string;
    placeholders: string;
    values: any[];
  } {
    // Automatically prepare JSONB columns using Type Converter Pattern
    const processedData = processValuesForTable(this.tableName, data);

    const keys = Object.keys(processedData);
    const columns = keys.join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = keys.map((key) => processedData[key]);

    return { columns, placeholders, values };
  }

  private buildUpdateData(data: Record<string, any>): {
    setClause: string;
    values: any[];
  } {
    // Automatically prepare JSONB columns using Type Converter Pattern
    const processedData = processValuesForTable(this.tableName, data);

    const keys = Object.keys(processedData);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = keys.map((key) => processedData[key]);

    return { setClause, values };
  }

  private async hasColumn(columnName: string): Promise<boolean> {
    const sql = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
    `;

    const result = await this.executeQuery(sql, [this.tableName, columnName]);
    return result.rows.length > 0;
  }
}

/**
 * API Credentials Repository
 * Handles database operations for external API credentials (VirusTotal, Safe Browsing, etc.)
 */

import { BaseRepository } from './base.repository.js';
import { getDatabaseClient } from '../client.js';
import { getLogger } from '../../logging/index.js';

const logger = getLogger();

export interface ApiCredential {
  id: string;
  credentialName: string;
  displayName: string;
  description?: string;
  provider: string;
  apiKey: string; // Encrypted
  apiSecret?: string; // Encrypted (optional)
  endpointUrl?: string;
  rateLimitPerDay?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialParams {
  credentialName: string;
  displayName: string;
  description?: string;
  provider: string;
  apiKey: string; // Will be encrypted before storage
  apiSecret?: string; // Will be encrypted before storage
  endpointUrl?: string;
  rateLimitPerDay?: number;
}

export interface UpdateCredentialParams {
  displayName?: string;
  description?: string;
  apiKey?: string; // Will be re-encrypted if provided
  apiSecret?: string;
  endpointUrl?: string;
  rateLimitPerDay?: number;
  isActive?: boolean;
}

export class CredentialsRepository extends BaseRepository<ApiCredential, any> {
  constructor() {
    super('api_credentials');
  }

  /**
   * Map database row to domain model
   */
  protected mapToDomain(row: any): ApiCredential {
    return {
      id: row.id,
      credentialName: row.credential_name,
      displayName: row.display_name,
      description: row.description,
      provider: row.provider,
      apiKey: row.api_key,
      apiSecret: row.api_secret,
      endpointUrl: row.endpoint_url,
      rateLimitPerDay: row.rate_limit_per_day != null ? parseInt(row.rate_limit_per_day, 10) : undefined,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map domain model to database row
   */
  protected mapToDatabase(domain: Partial<ApiCredential>): Partial<any> {
    const db: any = {};
    if (domain.id !== undefined) db.id = domain.id;
    if (domain.credentialName !== undefined) db.credential_name = domain.credentialName;
    if (domain.displayName !== undefined) db.display_name = domain.displayName;
    if (domain.description !== undefined) db.description = domain.description;
    if (domain.provider !== undefined) db.provider = domain.provider;
    if (domain.apiKey !== undefined) db.api_key = domain.apiKey;
    if (domain.apiSecret !== undefined) db.api_secret = domain.apiSecret;
    if (domain.endpointUrl !== undefined) db.endpoint_url = domain.endpointUrl;
    if (domain.rateLimitPerDay !== undefined) db.rate_limit_per_day = domain.rateLimitPerDay;
    if (domain.isActive !== undefined) db.is_active = domain.isActive;
    return db;
  }

  /**
   * Get all API credentials
   */
  async findAll(): Promise<ApiCredential[]> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query<ApiCredential>(
        `SELECT
          id,
          credential_name AS "credentialName",
          display_name AS "displayName",
          description,
          provider,
          api_key AS "apiKey",
          api_secret AS "apiSecret",
          endpoint_url AS "endpointUrl",
          rate_limit_per_day AS "rateLimitPerDay",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM api_credentials
        ORDER BY created_at DESC`
      );

      logger.debug({
        msg: 'Retrieved all API credentials',
        count: result.rows.length,
      });

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get all active API credentials
   */
  async findActive(): Promise<ApiCredential[]> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query<ApiCredential>(
        `SELECT
          id,
          credential_name AS "credentialName",
          display_name AS "displayName",
          description,
          provider,
          api_key AS "apiKey",
          api_secret AS "apiSecret",
          endpoint_url AS "endpointUrl",
          rate_limit_per_day AS "rateLimitPerDay",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM api_credentials
        WHERE is_active = true
        ORDER BY provider, display_name`
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Get single API credential by ID
   */
  override async findById(id: string): Promise<ApiCredential | null> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query<ApiCredential>(
        `SELECT
          id,
          credential_name AS "credentialName",
          display_name AS "displayName",
          description,
          provider,
          api_key AS "apiKey",
          api_secret AS "apiSecret",
          endpoint_url AS "endpointUrl",
          rate_limit_per_day AS "rateLimitPerDay",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM api_credentials
        WHERE id = $1`,
        [id]
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Get credential by credential name
   */
  async findByCredentialName(credentialName: string): Promise<ApiCredential | null> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query<ApiCredential>(
        `SELECT
          id,
          credential_name AS "credentialName",
          display_name AS "displayName",
          description,
          provider,
          api_key AS "apiKey",
          api_secret AS "apiSecret",
          endpoint_url AS "endpointUrl",
          rate_limit_per_day AS "rateLimitPerDay",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM api_credentials
        WHERE credential_name = $1`,
        [credentialName]
      );

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Get credentials by provider
   */
  async findByProvider(provider: string): Promise<ApiCredential[]> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query<ApiCredential>(
        `SELECT
          id,
          credential_name AS "credentialName",
          display_name AS "displayName",
          description,
          provider,
          api_key AS "apiKey",
          api_secret AS "apiSecret",
          endpoint_url AS "endpointUrl",
          rate_limit_per_day AS "rateLimitPerDay",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM api_credentials
        WHERE provider = $1 AND is_active = true
        ORDER BY display_name`,
        [provider]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Create new API credential
   * NOTE: apiKey and apiSecret should already be encrypted before calling this method
   */
  async create(params: CreateCredentialParams): Promise<ApiCredential> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query<ApiCredential>(
        `INSERT INTO api_credentials (
          credential_name,
          display_name,
          description,
          provider,
          api_key,
          api_secret,
          endpoint_url,
          rate_limit_per_day
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          credential_name AS "credentialName",
          display_name AS "displayName",
          description,
          provider,
          api_key AS "apiKey",
          api_secret AS "apiSecret",
          endpoint_url AS "endpointUrl",
          rate_limit_per_day AS "rateLimitPerDay",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        [
          params.credentialName,
          params.displayName,
          params.description || null,
          params.provider,
          params.apiKey, // Already encrypted
          params.apiSecret || null, // Already encrypted
          params.endpointUrl || null,
          params.rateLimitPerDay || null,
        ]
      );

      logger.info({
        msg: 'API credential created',
        credentialName: params.credentialName,
        provider: params.provider,
      });

      if (!result.rows[0]) {
        throw new Error('Failed to create API credential - no row returned');
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Update existing API credential
   * NOTE: If apiKey or apiSecret is provided, it should already be encrypted
   */
  override async update(id: string, params: UpdateCredentialParams): Promise<ApiCredential | null> {
    const client = await getDatabaseClient().connect();

    try {
      // Build dynamic SET clause based on provided params
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (params.displayName !== undefined) {
        updates.push(`display_name = $${paramIndex++}`);
        values.push(params.displayName);
      }

      if (params.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(params.description);
      }

      if (params.apiKey !== undefined) {
        updates.push(`api_key = $${paramIndex++}`);
        values.push(params.apiKey); // Already encrypted
      }

      if (params.apiSecret !== undefined) {
        updates.push(`api_secret = $${paramIndex++}`);
        values.push(params.apiSecret); // Already encrypted
      }

      if (params.endpointUrl !== undefined) {
        updates.push(`endpoint_url = $${paramIndex++}`);
        values.push(params.endpointUrl);
      }

      if (params.rateLimitPerDay !== undefined) {
        updates.push(`rate_limit_per_day = $${paramIndex++}`);
        values.push(params.rateLimitPerDay);
      }

      if (params.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(params.isActive);
      }

      if (updates.length === 0) {
        // No updates provided
        return await this.findById(id);
      }

      // Always update updated_at
      updates.push(`updated_at = NOW()`);
      values.push(id); // For WHERE clause

      const result = await client.query<ApiCredential>(
        `UPDATE api_credentials
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING
          id,
          credential_name AS "credentialName",
          display_name AS "displayName",
          description,
          provider,
          api_key AS "apiKey",
          api_secret AS "apiSecret",
          endpoint_url AS "endpointUrl",
          rate_limit_per_day AS "rateLimitPerDay",
          is_active AS "isActive",
          created_at AS "createdAt",
          updated_at AS "updatedAt"`,
        values
      );

      if (result.rows[0]) {
        logger.info({
          msg: 'API credential updated',
          credentialId: id,
        });
      }

      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  /**
   * Delete API credential
   */
  override async delete(id: string): Promise<boolean> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query('DELETE FROM api_credentials WHERE id = $1', [id]);

      const deleted = result.rowCount !== null && result.rowCount > 0;

      if (deleted) {
        logger.info({
          msg: 'API credential deleted',
          credentialId: id,
        });
      }

      return deleted;
    } finally {
      client.release();
    }
  }

  /**
   * Check if credential name exists
   */
  async exists(credentialName: string): Promise<boolean> {
    const client = await getDatabaseClient().connect();

    try {
      const result = await client.query(
        'SELECT EXISTS(SELECT 1 FROM api_credentials WHERE credential_name = $1) as exists',
        [credentialName]
      );

      return result.rows[0]?.exists || false;
    } finally {
      client.release();
    }
  }
}

/**
 * Singleton instance
 */
let repositoryInstance: CredentialsRepository | null = null;

/**
 * Get credentials repository instance
 */
export function getCredentialsRepository(): CredentialsRepository {
  if (!repositoryInstance) {
    repositoryInstance = new CredentialsRepository();
  }
  return repositoryInstance!;
}

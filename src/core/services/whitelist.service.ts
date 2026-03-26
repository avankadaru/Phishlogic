/**
 * Whitelist service for managing and checking trusted sources (PostgreSQL version)
 */

import { randomUUID } from 'node:crypto';
import type {
  WhitelistEntry,
  WhitelistCheckResult,
  AddWhitelistEntryOptions,
  WhitelistType,
} from '../models/whitelist.js';
import type { NormalizedInput } from '../models/input.js';
import { isEmailInput, isUrlInput } from '../models/input.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import { query } from '../../infrastructure/database/client.js';

const logger = getLogger();

/**
 * Database row to WhitelistEntry mapper
 */
function mapRowToEntry(row: any): WhitelistEntry {
  return {
    id: row.id,
    type: row.type,
    value: row.value,
    description: row.description,
    addedAt: new Date(row.created_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    active: row.is_active,
    isTrusted: row.is_trusted ?? true,
    scanAttachments: row.scan_attachments ?? true,
    scanRichContent: row.scan_rich_content ?? true,
  };
}

/**
 * Whitelist service implementation with PostgreSQL backend
 */
export class WhitelistService {
  private tenantId: string | null;

  constructor(tenantId?: string) {
    this.tenantId = tenantId || null; // Multi-tenant ready
    logger.debug({ tenantId: this.tenantId }, 'WhitelistService initialized');
  }

  /**
   * Add a new whitelist entry
   */
  async addEntry(options: AddWhitelistEntryOptions): Promise<WhitelistEntry> {
    const id = randomUUID();
    const normalizedValue = this.normalizeValue(options.value, options.type);
    const isTrusted = options.isTrusted ?? true;
    const scanAttachments = options.scanAttachments ?? true;
    const scanRichContent = options.scanRichContent ?? true;

    const result = await query(
      `INSERT INTO whitelist_entries
       (id, tenant_id, type, value, description, expires_at, added_by, is_trusted, scan_attachments, scan_rich_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        id,
        this.tenantId,
        options.type,
        normalizedValue,
        options.description,
        options.expiresAt,
        'system',
        isTrusted,
        scanAttachments,
        scanRichContent,
      ]
    );

    logger.info({
      entryId: id,
      type: options.type,
      value: normalizedValue,
      isTrusted,
      scanAttachments,
      scanRichContent,
      tenantId: this.tenantId,
    }, 'Whitelist entry added');

    return mapRowToEntry(result.rows[0]);
  }

  /**
   * Remove a whitelist entry by ID (soft delete)
   */
  async removeEntry(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE whitelist_entries
       SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );

    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      logger.info({ entryId: id, tenantId: this.tenantId }, 'Whitelist entry removed');
    }
    return deleted;
  }

  /**
   * Deactivate a whitelist entry (soft delete)
   */
  async deactivateEntry(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE whitelist_entries
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );

    const updated = (result.rowCount ?? 0) > 0;
    if (updated) {
      logger.info({ entryId: id, tenantId: this.tenantId }, 'Whitelist entry deactivated');
    }
    return updated;
  }

  /**
   * Activate a whitelist entry
   */
  async activateEntry(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE whitelist_entries
       SET is_active = true, updated_at = NOW()
       WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );

    const updated = (result.rowCount ?? 0) > 0;
    if (updated) {
      logger.info({ entryId: id, tenantId: this.tenantId }, 'Whitelist entry activated');
    }
    return updated;
  }

  /**
   * Get a whitelist entry by ID
   */
  async getEntry(id: string): Promise<WhitelistEntry | undefined> {
    const result = await query(
      `SELECT * FROM whitelist_entries
       WHERE id = $1 AND tenant_id IS NOT DISTINCT FROM $2 AND deleted_at IS NULL`,
      [id, this.tenantId]
    );

    return result.rows.length > 0 ? mapRowToEntry(result.rows[0]) : undefined;
  }

  /**
   * Get all whitelist entries
   */
  async getAllEntries(): Promise<WhitelistEntry[]> {
    const result = await query(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [this.tenantId]
    );

    return result.rows.map(mapRowToEntry);
  }

  /**
   * Get all active whitelist entries
   */
  async getActiveEntries(): Promise<WhitelistEntry[]> {
    const result = await query(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND deleted_at IS NULL
         AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [this.tenantId]
    );

    return result.rows.map(mapRowToEntry);
  }

  /**
   * Get entries by type
   */
  async getEntriesByType(type: WhitelistType): Promise<WhitelistEntry[]> {
    const result = await query(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND type = $2
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [this.tenantId, type]
    );

    return result.rows.map(mapRowToEntry);
  }

  /**
   * Check if an input is whitelisted
   */
  async check(input: NormalizedInput): Promise<WhitelistCheckResult> {
    const startTime = Date.now();

    // Check email whitelist
    if (isEmailInput(input)) {
      const emailAddress = input.data.parsed.from.address;
      const emailResult = await this.checkEmail(emailAddress);
      if (emailResult.isWhitelisted) {
        logger.debug({
          type: 'email',
          value: emailAddress,
          duration: Date.now() - startTime,
        }, 'Whitelist match found');
        return emailResult;
      }

      // Also check domain from email
      const domain = this.extractDomain(emailAddress);
      if (domain) {
        const domainResult = await this.checkDomain(domain);
        if (domainResult.isWhitelisted) {
          logger.debug({
            type: 'domain',
            value: domain,
            duration: Date.now() - startTime,
          }, 'Whitelist match found');
          return domainResult;
        }
      }

      // Check URLs extracted from email body
      if (input.data.parsed.urls && input.data.parsed.urls.length > 0) {
        for (const url of input.data.parsed.urls) {
          const urlResult = await this.checkUrl(url);
          if (urlResult.isWhitelisted) {
            logger.debug({
              type: 'url',
              value: url,
              duration: Date.now() - startTime,
            }, 'Whitelist match found');
            return urlResult;
          }

          // Check domain from URL
          const urlDomain = this.extractDomainFromUrl(url);
          if (urlDomain) {
            const domainResult = await this.checkDomain(urlDomain);
            if (domainResult.isWhitelisted) {
              logger.debug({
                type: 'domain',
                value: urlDomain,
                duration: Date.now() - startTime,
              }, 'Whitelist match found');
              return domainResult;
            }
          }
        }
      }
    }

    // Check URL whitelist
    if (isUrlInput(input)) {
      const url = input.data.url;
      const urlResult = await this.checkUrl(url);
      if (urlResult.isWhitelisted) {
        logger.debug({
          type: 'url',
          value: url,
          duration: Date.now() - startTime,
        }, 'Whitelist match found');
        return urlResult;
      }

      // Also check domain from URL
      const domain = this.extractDomainFromUrl(url);
      if (domain) {
        const domainResult = await this.checkDomain(domain);
        if (domainResult.isWhitelisted) {
          logger.debug({
            type: 'domain',
            value: domain,
            duration: Date.now() - startTime,
          }, 'Whitelist match found');
          return domainResult;
        }
      }
    }

    logger.debug({
      duration: Date.now() - startTime,
    }, 'No whitelist match found');

    return { isWhitelisted: false };
  }

  /**
   * Check if an email address is whitelisted
   */
  private async checkEmail(email: string): Promise<WhitelistCheckResult> {
    const normalizedEmail = this.normalizeValue(email, 'email');

    const result = await query(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND type = 'email'
         AND value = $2
         AND is_active = true
         AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [this.tenantId, normalizedEmail]
    );

    if (result.rows.length > 0) {
      const entry = mapRowToEntry(result.rows[0]);

      // Update match count asynchronously (don't wait)
      this.incrementMatchCount(entry.id).catch((err) => {
        logger.warn({ err, entryId: entry.id }, 'Failed to increment match count');
      });

      return {
        isWhitelisted: true,
        entry,
        matchReason: 'exact email match',
      };
    }

    return { isWhitelisted: false };
  }

  /**
   * Check if a domain is whitelisted
   */
  private async checkDomain(domain: string): Promise<WhitelistCheckResult> {
    const normalizedDomain = this.normalizeValue(domain, 'domain');

    const result = await query(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND type = 'domain'
         AND value = $2
         AND is_active = true
         AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [this.tenantId, normalizedDomain]
    );

    if (result.rows.length > 0) {
      const entry = mapRowToEntry(result.rows[0]);

      // Update match count asynchronously
      this.incrementMatchCount(entry.id).catch((err) => {
        logger.warn({ err, entryId: entry.id }, 'Failed to increment match count');
      });

      return {
        isWhitelisted: true,
        entry,
        matchReason: 'exact domain match',
      };
    }

    return { isWhitelisted: false };
  }

  /**
   * Check if a URL is whitelisted
   */
  private async checkUrl(url: string): Promise<WhitelistCheckResult> {
    const normalizedUrl = this.normalizeValue(url, 'url');

    // Check for exact match or prefix match
    const result = await query(
      `SELECT * FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1
         AND type = 'url'
         AND ($2 = value OR $2 LIKE value || '%')
         AND is_active = true
         AND deleted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [this.tenantId, normalizedUrl]
    );

    if (result.rows.length > 0) {
      const entry = mapRowToEntry(result.rows[0]);
      const isExactMatch = entry.value === normalizedUrl;

      // Update match count asynchronously
      this.incrementMatchCount(entry.id).catch((err) => {
        logger.warn({ err, entryId: entry.id }, 'Failed to increment match count');
      });

      return {
        isWhitelisted: true,
        entry,
        matchReason: isExactMatch ? 'exact URL match' : 'URL prefix match',
      };
    }

    return { isWhitelisted: false };
  }

  /**
   * Increment match count for an entry
   */
  private async incrementMatchCount(id: string): Promise<void> {
    await query(
      `UPDATE whitelist_entries
       SET match_count = match_count + 1,
           last_matched_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Normalize a value based on its type
   */
  private normalizeValue(value: string, type: WhitelistType): string {
    switch (type) {
      case 'email':
        return value.toLowerCase().trim();
      case 'domain':
        return value.toLowerCase().trim().replace(/^www\./, '');
      case 'url':
        return value.toLowerCase().trim().replace(/\/$/, '');
      default:
        return value.trim();
    }
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string | null {
    const match = email.match(/@(.+)$/);
    return match?.[1] ?? null;
  }

  /**
   * Extract domain from URL
   */
  private extractDomainFromUrl(url: string): string | null {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Clear all entries for this tenant (useful for testing)
   */
  async clear(): Promise<void> {
    await query(
      `DELETE FROM whitelist_entries WHERE tenant_id IS NOT DISTINCT FROM $1`,
      [this.tenantId]
    );
    logger.info({ tenantId: this.tenantId }, 'All whitelist entries cleared');
  }

  /**
   * Get statistics about whitelist
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    byType: Record<WhitelistType, number>;
  }> {
    const result = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())) as active,
         type,
         COUNT(*) as type_count
       FROM whitelist_entries
       WHERE tenant_id IS NOT DISTINCT FROM $1 AND deleted_at IS NULL
       GROUP BY type`,
      [this.tenantId]
    );

    const byType: Record<WhitelistType, number> = {
      email: 0,
      domain: 0,
      url: 0,
    };

    let total = 0;
    let active = 0;

    result.rows.forEach((row) => {
      const typeCount = parseInt(row.type_count, 10);
      const activeCount = parseInt(row.active, 10);

      total += typeCount;
      active += activeCount;
      byType[row.type as WhitelistType] = typeCount;
    });

    return { total, active, byType };
  }
}

/**
 * Get or create whitelist service instance (tenant-aware)
 *
 * @param tenantId - Optional tenant ID (null for single-tenant mode in Phase 1)
 * @returns WhitelistService instance
 */
export function getWhitelistService(tenantId?: string): WhitelistService {
  // In Phase 1, we create a new instance each time (request-scoped)
  // This prepares us for multi-tenancy in Phase 2
  return new WhitelistService(tenantId);
}

/**
 * Reset whitelist service (no-op in database version, kept for compatibility)
 */
export function resetWhitelistService(): void {
  // No-op: Database persists across service resets
  logger.debug('resetWhitelistService called (no-op in database version)');
}

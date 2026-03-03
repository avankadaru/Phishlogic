/**
 * Whitelist service for managing and checking trusted sources
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

const logger = getLogger();

/**
 * Whitelist service implementation
 */
export class WhitelistService {
  private entries: Map<string, WhitelistEntry> = new Map();

  constructor() {
    logger.info('WhitelistService initialized');
  }

  /**
   * Add a new whitelist entry
   */
  addEntry(options: AddWhitelistEntryOptions): WhitelistEntry {
    const id = randomUUID();
    const entry: WhitelistEntry = {
      id,
      type: options.type,
      value: this.normalizeValue(options.value, options.type),
      description: options.description,
      addedAt: new Date(),
      expiresAt: options.expiresAt,
      active: true,
    };

    this.entries.set(id, entry);
    logger.info({
      msg: 'Whitelist entry added',
      entryId: id,
      type: entry.type,
      value: entry.value,
    });

    return entry;
  }

  /**
   * Remove a whitelist entry by ID
   */
  removeEntry(id: string): boolean {
    const deleted = this.entries.delete(id);
    if (deleted) {
      logger.info({ msg: 'Whitelist entry removed', entryId: id });
    }
    return deleted;
  }

  /**
   * Deactivate a whitelist entry (soft delete)
   */
  deactivateEntry(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry) {
      entry.active = false;
      logger.info({ msg: 'Whitelist entry deactivated', entryId: id });
      return true;
    }
    return false;
  }

  /**
   * Activate a whitelist entry
   */
  activateEntry(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry) {
      entry.active = true;
      logger.info({ msg: 'Whitelist entry activated', entryId: id });
      return true;
    }
    return false;
  }

  /**
   * Get a whitelist entry by ID
   */
  getEntry(id: string): WhitelistEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all whitelist entries
   */
  getAllEntries(): WhitelistEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get all active whitelist entries
   */
  getActiveEntries(): WhitelistEntry[] {
    return this.getAllEntries().filter((entry) => this.isEntryValid(entry));
  }

  /**
   * Get entries by type
   */
  getEntriesByType(type: WhitelistType): WhitelistEntry[] {
    return this.getAllEntries().filter((entry) => entry.type === type);
  }

  /**
   * Check if an input is whitelisted
   */
  check(input: NormalizedInput): WhitelistCheckResult {
    const startTime = Date.now();

    // Check email whitelist
    if (isEmailInput(input)) {
      const emailAddress = input.data.parsed.from.address;
      const emailResult = this.checkEmail(emailAddress);
      if (emailResult.isWhitelisted) {
        logger.debug({
          msg: 'Whitelist match found',
          type: 'email',
          value: emailAddress,
          duration: Date.now() - startTime,
        });
        return emailResult;
      }

      // Also check domain from email
      const domain = this.extractDomain(emailAddress);
      if (domain) {
        const domainResult = this.checkDomain(domain);
        if (domainResult.isWhitelisted) {
          logger.debug({
            msg: 'Whitelist match found',
            type: 'domain',
            value: domain,
            duration: Date.now() - startTime,
          });
          return domainResult;
        }
      }

      // Check URLs extracted from email body
      if (input.data.parsed.urls && input.data.parsed.urls.length > 0) {
        for (const url of input.data.parsed.urls) {
          const urlResult = this.checkUrl(url);
          if (urlResult.isWhitelisted) {
            logger.debug({
              msg: 'Whitelist match found',
              type: 'url',
              value: url,
              duration: Date.now() - startTime,
            });
            return urlResult;
          }

          // Check domain from URL
          const urlDomain = this.extractDomainFromUrl(url);
          if (urlDomain) {
            const domainResult = this.checkDomain(urlDomain);
            if (domainResult.isWhitelisted) {
              logger.debug({
                msg: 'Whitelist match found',
                type: 'domain',
                value: urlDomain,
                duration: Date.now() - startTime,
              });
              return domainResult;
            }
          }
        }
      }
    }

    // Check URL whitelist
    if (isUrlInput(input)) {
      const url = input.data.url;
      const urlResult = this.checkUrl(url);
      if (urlResult.isWhitelisted) {
        logger.debug({
          msg: 'Whitelist match found',
          type: 'url',
          value: url,
          duration: Date.now() - startTime,
        });
        return urlResult;
      }

      // Also check domain from URL
      const domain = this.extractDomainFromUrl(url);
      if (domain) {
        const domainResult = this.checkDomain(domain);
        if (domainResult.isWhitelisted) {
          logger.debug({
            msg: 'Whitelist match found',
            type: 'domain',
            value: domain,
            duration: Date.now() - startTime,
          });
          return domainResult;
        }
      }
    }

    logger.debug({
      msg: 'No whitelist match found',
      duration: Date.now() - startTime,
    });

    return { isWhitelisted: false };
  }

  /**
   * Check if an email address is whitelisted
   */
  private checkEmail(email: string): WhitelistCheckResult {
    const normalizedEmail = this.normalizeValue(email, 'email');
    const activeEntries = this.getActiveEntries();

    for (const entry of activeEntries) {
      if (entry.type === 'email' && entry.value === normalizedEmail) {
        return {
          isWhitelisted: true,
          matchedEntry: entry,
          matchReason: 'exact email match',
        };
      }
    }

    return { isWhitelisted: false };
  }

  /**
   * Check if a domain is whitelisted
   */
  private checkDomain(domain: string): WhitelistCheckResult {
    const normalizedDomain = this.normalizeValue(domain, 'domain');
    const activeEntries = this.getActiveEntries();

    for (const entry of activeEntries) {
      if (entry.type === 'domain' && entry.value === normalizedDomain) {
        return {
          isWhitelisted: true,
          matchedEntry: entry,
          matchReason: 'exact domain match',
        };
      }
    }

    return { isWhitelisted: false };
  }

  /**
   * Check if a URL is whitelisted
   */
  private checkUrl(url: string): WhitelistCheckResult {
    const normalizedUrl = this.normalizeValue(url, 'url');
    const activeEntries = this.getActiveEntries();

    for (const entry of activeEntries) {
      if (entry.type === 'url') {
        // Exact match
        if (entry.value === normalizedUrl) {
          return {
            isWhitelisted: true,
            matchedEntry: entry,
            matchReason: 'exact URL match',
          };
        }

        // Prefix match (for URLs with query params)
        if (normalizedUrl.startsWith(entry.value)) {
          return {
            isWhitelisted: true,
            matchedEntry: entry,
            matchReason: 'URL prefix match',
          };
        }
      }
    }

    return { isWhitelisted: false };
  }

  /**
   * Check if an entry is valid (active and not expired)
   */
  private isEntryValid(entry: WhitelistEntry): boolean {
    if (!entry.active) {
      return false;
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      return false;
    }

    return true;
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
        // Remove trailing slash and normalize
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
   * Clear all entries (useful for testing)
   */
  clear(): void {
    this.entries.clear();
    logger.info('All whitelist entries cleared');
  }

  /**
   * Get statistics about whitelist
   */
  getStats(): {
    total: number;
    active: number;
    byType: Record<WhitelistType, number>;
  } {
    const entries = this.getAllEntries();
    const active = this.getActiveEntries();

    const byType: Record<WhitelistType, number> = {
      email: 0,
      domain: 0,
      url: 0,
    };

    for (const entry of entries) {
      byType[entry.type]++;
    }

    return {
      total: entries.length,
      active: active.length,
      byType,
    };
  }
}

/**
 * Singleton instance
 */
let whitelistServiceInstance: WhitelistService | null = null;

/**
 * Get or create whitelist service instance
 */
export function getWhitelistService(): WhitelistService {
  if (!whitelistServiceInstance) {
    whitelistServiceInstance = new WhitelistService();
  }
  return whitelistServiceInstance;
}

/**
 * Reset whitelist service (useful for testing)
 */
export function resetWhitelistService(): void {
  whitelistServiceInstance = null;
}

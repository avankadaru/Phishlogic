/**
 * Whitelist/Allowlist models and types
 */

/**
 * Type of whitelist entry
 */
export type WhitelistType = 'email' | 'domain' | 'url';

/**
 * Whitelist entry
 */
export interface WhitelistEntry {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Type of whitelist entry
   */
  type: WhitelistType;

  /**
   * The value to whitelist (email address, domain, or URL)
   */
  value: string;

  /**
   * Optional description/reason for whitelisting
   */
  description?: string;

  /**
   * When this entry was added
   */
  addedAt: Date;

  /**
   * Optional expiration date
   */
  expiresAt?: Date;

  /**
   * Whether this entry is currently active
   */
  active: boolean;
}

/**
 * Result of a whitelist check
 */
export interface WhitelistCheckResult {
  /**
   * Whether the input matches a whitelist entry
   */
  isWhitelisted: boolean;

  /**
   * The matching entry if found
   */
  matchedEntry?: WhitelistEntry;

  /**
   * Reason for the match (e.g., "exact match", "domain match")
   */
  matchReason?: string;
}

/**
 * Options for adding a whitelist entry
 */
export interface AddWhitelistEntryOptions {
  type: WhitelistType;
  value: string;
  description?: string;
  expiresAt?: Date;
}

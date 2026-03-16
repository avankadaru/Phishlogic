/**
 * Whitelist/Allowlist models and types
 */

/**
 * Type of whitelist entry
 */
export type WhitelistType = 'email' | 'domain' | 'url';

/**
 * Trust level for whitelist entries
 * - high: Complete bypass of all analysis (maximum trust)
 * - medium: Skip basic analyzers, but check links, attachments, and high-risk content
 * - low: Skip expensive analyzers only (e.g., dynamic analysis)
 */
export type TrustLevel = 'high' | 'medium' | 'low';

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

  /**
   * Trust level for this whitelist entry (defaults to 'high')
   * - high: Complete bypass of all analysis
   * - medium: Skip basic analyzers, but check links/attachments
   * - low: Skip only expensive analyzers
   */
  trustLevel?: TrustLevel;
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

  /**
   * Trust level of the matched entry
   */
  trustLevel?: TrustLevel;
}

/**
 * Options for adding a whitelist entry
 */
export interface AddWhitelistEntryOptions {
  type: WhitelistType;
  value: string;
  description?: string;
  expiresAt?: Date;
  trustLevel?: TrustLevel;
}

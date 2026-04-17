/**
 * Input models for different analysis types
 */

/**
 * Input type discriminator
 */
export type InputType = 'url' | 'email';

/**
 * Email address structure
 */
export interface EmailAddress {
  address: string;
  name?: string;
}

/**
 * Email attachment structure
 */
export interface Attachment {
  filename: string;
  contentType: string;
  size: number;
  checksum?: string;
}

/**
 * URL input data
 */
export interface UrlInput {
  url: string;
  context?: {
    referrer?: string;
    userAgent?: string;
    /**
     * Optional HTML fragment from a client (e.g. browser extension) for URL prescan only.
     * Parsed with the same structure rules as email HTML (forms, scripts, iframes).
     */
    pageHtmlSnippet?: string;
  };
}

/**
 * Email input data
 */
export interface EmailInput {
  /** Raw email content (MIME format) */
  raw: string;

  /** Parsed email data */
  parsed: {
    /** Email headers */
    headers: Map<string, string>;

    /** Sender information */
    from: EmailAddress;

    /** Recipients */
    to: EmailAddress[];

    /** Email subject */
    subject: string;

    /** Email body */
    body: {
      text?: string;
      html?: string;
    };

    /** Attachments */
    attachments?: Attachment[];

    /** Extracted URLs from email body (navigation links + img srcs) */
    urls?: string[];

    /** Extracted image URLs (img src + CSS background-image, separate from nav links) */
    images?: string[];
  };
}

/**
 * Normalized input after adapter processing
 */
export interface NormalizedInput {
  /** Type of input */
  type: InputType;

  /** Unique identifier for this input */
  id: string;

  /** Timestamp when input was received */
  timestamp: Date;

  /** Input data (URL or Email) */
  data: UrlInput | EmailInput;

  /** Optional analysis ID from UI (for end-to-end tracking) */
  analysisId?: string;

  /** Optional UI timestamp (when user initiated the request) */
  uiTimestamp?: number;

  /** Optional risk profile from pre-scan extractors (for analyzer consumption) */
  riskProfile?: any; // Import type will be added to avoid circular dependency

  /**
   * Optional integration name (e.g. `gmail`, `chrome`, `chrome_task2`).
   * When unset, the engine derives it from the input type.
   * Integration config for this name is the source of truth for pipeline policy.
   */
  integrationName?: string;

  /**
   * Optional override for native/hybrid/ai (e.g. admin URL test page). When unset, integration DB config is used.
   */
  executionModeOverride?: 'native' | 'hybrid' | 'ai';
}

/**
 * Type guard to check if input is URL type
 */
export function isUrlInput(input: NormalizedInput): input is NormalizedInput & { data: UrlInput } {
  return input.type === 'url';
}

/**
 * Type guard to check if input is Email type
 */
export function isEmailInput(
  input: NormalizedInput
): input is NormalizedInput & { data: EmailInput } {
  return input.type === 'email';
}

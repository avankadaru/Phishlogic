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

    /** Extracted URLs from email body */
    urls?: string[];
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

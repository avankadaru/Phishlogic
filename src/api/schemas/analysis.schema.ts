/**
 * API request/response schemas
 */

import { z } from 'zod';

/**
 * URL analysis request schema
 */
export const UrlAnalysisRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  context: z
    .object({
      referrer: z.string().optional(),
      userAgent: z.string().optional(),
    })
    .optional(),
  analysisId: z.string().uuid().optional(),
  uiTimestamp: z.number().int().positive().optional(),
  executionMode: z.enum(['native', 'hybrid', 'ai']).optional(),
  /**
   * Optional integration identifier (e.g. `chrome`, `chrome_task2`).
   * When unset, the server falls back to `chrome` for URL requests.
   */
  integrationName: z.string().min(1).max(100).optional(),
});

export type UrlAnalysisRequest = z.infer<typeof UrlAnalysisRequestSchema>;

/**
 * Email analysis request schema
 */
export const EmailAnalysisRequestSchema = z.object({
  rawEmail: z.string().min(1, 'Email content is required').max(10 * 1024 * 1024, 'Email too large (max 10MB)'),
  analysisId: z.string().uuid().optional(),
  uiTimestamp: z.number().int().positive().optional(),
  executionMode: z.enum(['native', 'hybrid', 'ai']).optional(),
  /**
   * Optional integration identifier (e.g. `gmail`, `gmail_strict`).
   * When unset, the server falls back to `gmail` for email requests.
   */
  integrationName: z.string().min(1).max(100).optional(),
});

export type EmailAnalysisRequest = z.infer<typeof EmailAnalysisRequestSchema>;

/**
 * Whitelist entry request schema
 */
export const AddWhitelistEntryRequestSchema = z.object({
  type: z.enum(['email', 'domain', 'url']),
  value: z.string().min(1, 'Value is required'),
  description: z.string().optional(),
  expiresAt: z.string().datetime().optional().transform((val) => (val ? new Date(val) : undefined)),
  trustLevel: z.enum(['high', 'medium', 'low']).optional(),
});

export type AddWhitelistEntryRequest = z.infer<typeof AddWhitelistEntryRequestSchema>;

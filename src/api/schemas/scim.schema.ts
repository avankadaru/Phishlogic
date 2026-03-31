/**
 * SCIM 2.0 Validation Schemas (Zod)
 * RFC 7643 & RFC 7644 compliant
 */

import { z } from 'zod';

// ============================================================================
// SCIM User Schemas (urn:ietf:params:scim:schemas:core:2.0:User)
// ============================================================================

export const ScimNameSchema = z.object({
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  formatted: z.string().optional(),
  middleName: z.string().optional(),
  honorificPrefix: z.string().optional(),
  honorificSuffix: z.string().optional(),
});

export const ScimEmailSchema = z.object({
  value: z.string().email(),
  type: z.string().optional(),
  primary: z.boolean().optional(),
  display: z.string().optional(),
});

export const ScimUserSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:User']),
  id: z.string().uuid().optional(), // Only in responses
  externalId: z.string().optional(),
  userName: z.string().min(1),
  name: ScimNameSchema.optional(),
  displayName: z.string().optional(),
  nickName: z.string().optional(),
  profileUrl: z.string().url().optional(),
  title: z.string().optional(),
  userType: z.string().optional(),
  preferredLanguage: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  active: z.boolean().default(true),
  password: z.string().optional(), // Not stored, used for initial provisioning
  emails: z.array(ScimEmailSchema).optional(),
  phoneNumbers: z.array(z.object({
    value: z.string(),
    type: z.string().optional(),
    primary: z.boolean().optional(),
  })).optional(),
  meta: z.object({
    resourceType: z.string(),
    created: z.string(),
    lastModified: z.string(),
    location: z.string(),
    version: z.string(),
  }).optional(),
});

export type ScimUser = z.infer<typeof ScimUserSchema>;
export type ScimName = z.infer<typeof ScimNameSchema>;

// ============================================================================
// SCIM Group Schemas (urn:ietf:params:scim:schemas:core:2.0:Group)
// ============================================================================

export const ScimGroupMemberSchema = z.object({
  value: z.string().uuid(), // User ID
  $ref: z.string().optional(), // URL to user resource
  type: z.enum(['User', 'Group']).default('User'),
  display: z.string().optional(), // User's display name
});

export const ScimGroupSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:Group']),
  id: z.string().uuid().optional(), // Only in responses
  externalId: z.string().optional(),
  displayName: z.string().min(1),
  members: z.array(ScimGroupMemberSchema).optional(),
  meta: z.object({
    resourceType: z.string(),
    created: z.string(),
    lastModified: z.string(),
    location: z.string(),
    version: z.string(),
  }).optional(),
});

export type ScimGroup = z.infer<typeof ScimGroupSchema>;
export type ScimGroupMember = z.infer<typeof ScimGroupMemberSchema>;

// ============================================================================
// SCIM Patch Operations (RFC 7644 Section 3.5.2)
// ============================================================================

export const ScimPatchOperationSchema = z.object({
  op: z.enum(['add', 'remove', 'replace']),
  path: z.string().optional(),
  value: z.any().optional(),
});

export const ScimPatchRequestSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:api:messages:2.0:PatchOp']),
  Operations: z.array(ScimPatchOperationSchema).min(1),
});

export type ScimPatchOperation = z.infer<typeof ScimPatchOperationSchema>;
export type ScimPatchRequest = z.infer<typeof ScimPatchRequestSchema>;

// ============================================================================
// SCIM List Response (RFC 7644 Section 3.4.2)
// ============================================================================

export const ScimListResponseSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:api:messages:2.0:ListResponse']),
  totalResults: z.number().int().nonnegative(),
  startIndex: z.number().int().positive().default(1),
  itemsPerPage: z.number().int().nonnegative(),
  Resources: z.array(z.any()),
});

export type ScimListResponse = z.infer<typeof ScimListResponseSchema>;

// ============================================================================
// SCIM Error Response (RFC 7644 Section 3.12)
// ============================================================================

export const ScimErrorSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:api:messages:2.0:Error']),
  status: z.string(), // HTTP status code as string
  scimType: z.enum([
    'invalidFilter',
    'tooMany',
    'uniqueness',
    'mutability',
    'invalidSyntax',
    'invalidPath',
    'noTarget',
    'invalidValue',
    'invalidVers',
    'sensitive',
  ]).optional(),
  detail: z.string().optional(),
});

export type ScimError = z.infer<typeof ScimErrorSchema>;

// ============================================================================
// SCIM Service Provider Config (RFC 7643 Section 5)
// ============================================================================

export const ScimServiceProviderConfigSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig']),
  documentationUri: z.string().url().optional(),
  patch: z.object({
    supported: z.boolean(),
  }),
  bulk: z.object({
    supported: z.boolean(),
    maxOperations: z.number().int().optional(),
    maxPayloadSize: z.number().int().optional(),
  }),
  filter: z.object({
    supported: z.boolean(),
    maxResults: z.number().int().optional(),
  }),
  changePassword: z.object({
    supported: z.boolean(),
  }),
  sort: z.object({
    supported: z.boolean(),
  }),
  etag: z.object({
    supported: z.boolean(),
  }),
  authenticationSchemes: z.array(z.object({
    type: z.string(),
    name: z.string(),
    description: z.string(),
    specUri: z.string().url().optional(),
    documentationUri: z.string().url().optional(),
    primary: z.boolean().optional(),
  })),
  meta: z.object({
    resourceType: z.string(),
    location: z.string(),
  }).optional(),
});

export type ScimServiceProviderConfig = z.infer<typeof ScimServiceProviderConfigSchema>;

// ============================================================================
// SCIM Query Parameters (RFC 7644 Section 3.4.2)
// ============================================================================

export const ScimQueryParamsSchema = z.object({
  filter: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['ascending', 'descending']).optional(),
  startIndex: z.coerce.number().int().positive().default(1),
  count: z.coerce.number().int().nonnegative().max(1000).default(100),
  attributes: z.string().optional(), // Comma-separated list
  excludedAttributes: z.string().optional(), // Comma-separated list
});

export type ScimQueryParams = z.infer<typeof ScimQueryParamsSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create SCIM error response
 */
export function createScimError(
  status: number,
  detail: string,
  scimType?: ScimError['scimType']
): ScimError {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: status.toString(),
    detail,
    scimType,
  };
}

/**
 * Create SCIM list response
 */
export function createScimListResponse<T>(
  resources: T[],
  totalResults: number,
  startIndex: number,
  itemsPerPage: number
): ScimListResponse {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}

/**
 * Generate ETag for SCIM resource (based on version)
 */
export function generateETag(version: number): string {
  return `W/"${version}"`;
}

/**
 * Parse ETag from If-Match header
 */
export function parseETag(etag: string | undefined): number | null {
  if (!etag) return null;
  const match = etag.match(/W\/"(\d+)"/);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

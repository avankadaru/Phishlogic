/**
 * Audit Event Domain Model
 * Comprehensive event logging for compliance and troubleshooting
 */

export interface AuditEventDomain {
  id: string;

  // Event Classification
  eventName: string; // 'user.created', 'user.updated', 'analysis.completed', etc.
  eventType: 'scim' | 'sso' | 'analysis' | 'admin' | 'api' | 'system';

  // Timestamps
  occurredAt: Date; // When the event actually happened
  loggedAt: Date; // When we logged it

  // Entity (what was affected)
  entityType?: string; // 'user', 'organization', 'role', 'analysis', etc.
  entityId?: string;
  entityName?: string;

  // Actor (who performed the action)
  actorType?: 'user' | 'admin' | 'idp' | 'system';
  actorId?: string;
  actorName?: string;

  // Context
  organizationId?: string;
  source?: string; // 'scim_api', 'sso_saml', 'gmail_addon', 'browser_extension', etc.
  ipAddress?: string;
  userAgent?: string;

  // Event-Specific Metadata (JSONB)
  eventMetadata?: Record<string, any>;

  // Analysis-Specific Fields
  analysisId?: string;
  verdict?: 'Safe' | 'Suspicious' | 'Malicious';
  confidence?: number;
  processingTimeMs?: number;

  // Success/Failure
  success: boolean;
  errorMessage?: string;
}

/**
 * Database Model - Matches table structure exactly
 */
export interface AuditEventDatabaseModel {
  id: string;

  event_name: string;
  event_type: string;

  occurred_at: Date;
  logged_at: Date;

  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;

  actor_type: string | null;
  actor_id: string | null;
  actor_name: string | null;

  organization_id: string | null;
  source: string | null;
  ip_address: string | null;
  user_agent: string | null;

  event_metadata: any; // JSONB

  analysis_id: string | null;
  verdict: string | null;
  confidence: number | null;
  processing_time_ms: number | null;

  success: boolean;
  error_message: string | null;
}

/**
 * Paginated response for audit log queries
 */
export interface PaginatedAuditEvents {
  items: AuditEventDomain[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

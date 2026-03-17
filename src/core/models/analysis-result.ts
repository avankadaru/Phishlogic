/**
 * Core domain types for phishing analysis results
 */

/**
 * Verdict types for phishing analysis
 */
export type Verdict = 'Safe' | 'Suspicious' | 'Malicious';

/**
 * Signal types that analyzers can produce
 */
export type SignalType =
  | 'spf_fail'
  | 'spf_pass'
  | 'dkim_fail'
  | 'dkim_pass'
  | 'high_entropy_url'
  | 'suspicious_redirect'
  | 'phishing_keywords'
  | 'form_detected'
  | 'domain_reputation_poor'
  | 'domain_reputation_good'
  | 'header_anomaly'
  | 'sender_mismatch'
  | 'url_shortener'
  | 'suspicious_tld'
  | 'new_domain'
  | 'https_missing'
  | 'certificate_invalid'
  // Sender Reputation Analyzer (Phase 1 - Systematic Validation)
  | 'invalid_email_format'
  | 'disposable_email'
  | 'role_based_email'
  | 'mx_record_missing'
  | 'dns_a_record_missing'
  | 'spf_not_configured'
  | 'dmarc_not_configured'
  | 'dns_lookup_failed'
  | 'domain_recently_registered'
  | 'whois_privacy_protection'
  | 'domain_blacklisted'
  // Header Analyzer additions
  | 'prize_scam'
  | 'sensitive_info_request'
  // Link Reputation Analyzer (Phase 2 - Threat Intelligence)
  | 'url_flagged_malicious'
  | 'url_flagged_suspicious'
  | 'url_in_malware_database'
  | 'url_in_phishing_database'
  // Attachment Analyzer (Phase 3 - File Analysis)
  | 'attachment_dangerous_type'
  | 'attachment_suspicious_type'
  | 'attachment_type_mismatch'
  // Content Analysis Analyzer (Phase 4 - ML/NLP, NO keywords)
  | 'negative_sentiment_high'
  | 'emotional_pressure_detected'
  | 'language_anomaly_detected'
  | 'brand_impersonation_suspected'
  | 'poor_readability'
  // Button/CTA Analyzer (Phase 5 - Button tracking and redirects)
  | 'button_hidden_redirect'
  | 'button_text_mismatch'
  | 'button_tracking_detected'
  // Image Analyzer (Phase 5 - OCR and EXIF analysis)
  | 'image_contains_phishing_text'
  | 'image_metadata_suspicious'
  // QR Code Analyzer (Phase 5 - QR code decoding and URL validation)
  | 'qrcode_malicious_url'
  | 'qrcode_suspicious_url'
  | 'qrcode_url_obfuscated'
  | 'qrcode_suspicious_content'
  // Malicious Behavior Detection (NEW - Drive-by downloads, script execution, installations)
  | 'automatic_download_detected'
  | 'script_execution_detected'
  | 'installation_prompt_detected'
  | 'suspicious_javascript_detected'
  | 'js_scan_skipped';

/**
 * Severity levels for analysis signals
 */
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Alias for SignalSeverity (for backwards compatibility)
 */
export type Severity = SignalSeverity;

/**
 * Individual signal produced by an analyzer
 */
export interface AnalysisSignal {
  /** Name of the analyzer that produced this signal */
  analyzerName: string;

  /** Type of signal */
  signalType: SignalType;

  /** Severity of the signal */
  severity: SignalSeverity;

  /** Confidence score (0-1) in this signal */
  confidence: number;

  /** Human-readable description of the signal */
  description: string;

  /** Optional evidence supporting this signal */
  evidence?: Record<string, unknown>;
}

/**
 * Red flag categories for UI display
 */
export type RedFlagCategory = 'sender' | 'url' | 'content' | 'authentication' | 'suspicious_behavior';

/**
 * Red flag (plain English warning)
 */
export interface RedFlag {
  /** Category for grouping in UI */
  category: RedFlagCategory;

  /** Plain English message for end users */
  message: string;

  /** Severity level */
  severity: SignalSeverity;
}

/**
 * Alert level for email notifications and UI priority
 */
export type AlertLevel = 'none' | 'low' | 'medium' | 'high';

/**
 * Execution step for audit trail
 */
export interface ExecutionStep {
  /** Step name */
  step: string;

  /** Timestamp when step started */
  startedAt?: Date;

  /** Timestamp when step completed */
  completedAt?: Date;

  /** Duration in milliseconds */
  duration?: number;

  /** Status of the step */
  status?: 'started' | 'completed' | 'failed' | 'skipped';

  /** Error message if failed */
  error?: string;

  /** Stack trace if failed */
  stackTrace?: string;

  /** Error context if failed */
  errorContext?: Record<string, unknown>;

  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Metadata about the analysis execution
 */
export interface AnalysisMetadata {
  /** Duration of analysis in milliseconds */
  duration: number;

  /** Timestamp when analysis completed */
  timestamp: Date;

  /** List of analyzers that were executed */
  analyzersRun: string[];

  /** Analysis ID for tracking */
  analysisId?: string;

  /** Execution tracking for audit trail */
  executionSteps?: ExecutionStep[];

  /** Trust level from whitelist (if whitelisted) */
  trustLevel?: 'high' | 'medium' | 'low';

  /** Content risk assessment profile */
  contentRisk?: {
    hasLinks: boolean;
    hasAttachments: boolean;
    hasUrgencyLanguage: boolean;
    overallRiskScore: number;
  };

  /** Risk score (0-10) from content risk analyzer */
  riskScore?: number;

  /** Bypass type for whitelisted entries */
  bypassType?: 'full' | 'selective' | 'none';

  /** Cost summary for operations performed during analysis */
  costSummary?: CostSummary;
}

/**
 * Cost tracking for analysis operations
 */
export interface CostSummary {
  /** Total cost in USD for all operations */
  totalCostUsd: number;

  /** Detailed breakdown of operations and their costs */
  operations: CostOperation[];
}

/**
 * Individual cost operation tracking
 */
export interface CostOperation {
  /** Type of operation performed */
  operationType: 'ai_api_call' | 'whois_lookup' | 'browser_automation' | 'dns_lookup' | 'external_api_call';

  /** Human-readable description of the operation */
  description: string;

  /** Number of times this operation was performed */
  count: number;

  /** Cost in USD (if applicable) */
  costUsd?: number;

  /** Additional metadata about the operation */
  metadata?: {
    /** Service provider (e.g., 'anthropic', 'openai', 'virustotal') */
    provider?: string;
    /** Model used (for AI calls) */
    model?: string;
    /** Tokens used (for AI calls) */
    tokensUsed?: number;
    /** Whether an API key was used */
    apiKeyUsed?: boolean;
  };
}

/**
 * Main analysis result returned to clients
 */
export interface AnalysisResult {
  /** Final verdict */
  verdict: Verdict;

  /** Overall confidence in the verdict (0-1) - internal use */
  confidence: number;

  /** User-facing score (0-10) */
  score: number;

  /** Alert level for notifications and UI priority */
  alertLevel: AlertLevel;

  /** Plain English red flags for UI display */
  redFlags: RedFlag[];

  /** Human-readable explanation of the verdict */
  reasoning: string;

  /** Recommended actions based on verdict */
  actions: string[];

  /** All signals produced during analysis */
  signals: AnalysisSignal[];

  /** Metadata about the analysis */
  metadata: AnalysisMetadata;
}

/**
 * Validation result for inputs
 */
export interface ValidationResult {
  /** Whether the input is valid */
  valid: boolean;

  /** Error messages if invalid */
  errors?: string[];
}

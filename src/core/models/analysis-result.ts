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
  | 'certificate_invalid';

/**
 * Severity levels for analysis signals
 */
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';

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
  startedAt: Date;

  /** Timestamp when step completed */
  completedAt?: Date;

  /** Duration in milliseconds */
  duration?: number;

  /** Status of the step */
  status: 'started' | 'completed' | 'failed' | 'skipped';

  /** Error message if failed */
  error?: string;

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

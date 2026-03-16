/**
 * Signal Configuration Types
 *
 * Defines TypeScript types for the signal configuration JSON schema.
 * Used by VerdictService to process signals in a generic, data-driven way.
 */

import type { Severity, Verdict } from './analysis-result.js';

/**
 * Signal type configuration defining behavior, dependencies, and actions
 */
export interface SignalTypeConfig {
  /** Signal category (for grouping and reporting) */
  category: string;

  /** Base weight multiplier for this signal type */
  baseWeight: number;

  /** Human-readable description of what this signal detects */
  description: string;

  /** Whether this signal can be downgraded based on context */
  canDowngrade: boolean;

  /** Critical override - forces malicious verdict regardless of other signals */
  criticalOverride?: boolean;

  /** Conditions under which this signal should be downgraded */
  downgradeConditions?: DowngradeConditions;
}

/**
 * Downgrade conditions defining when and how to reduce signal severity
 */
export interface DowngradeConditions {
  /** Reputation types that must be clean (e.g., ["link", "sender"]) */
  requireCleanReputation: ('link' | 'sender')[];

  /** Logic operator for combining reputation checks */
  logic: 'AND' | 'OR';

  /** Action to take when downgrade conditions are met */
  action: DowngradeAction;
}

/**
 * Action to perform when downgrading a signal
 */
export interface DowngradeAction {
  /** New severity level after downgrade */
  newSeverity: Severity;

  /** Confidence multiplier (0-1) to apply */
  confidenceMultiplier: number;

  /** Reason for downgrade (for logging and evidence) */
  reason: string;
}

/**
 * Complete signal configuration schema
 */
export interface SignalConfig {
  /** Configuration version for compatibility tracking */
  version: string;

  /** Human-readable description of the config */
  description: string;

  /** Signal type definitions keyed by signal type */
  signalTypes: Record<string, SignalTypeConfig>;

  /** Actions to take for each verdict type */
  verdictActions: Record<Verdict, string[]>;

  /** Verdict thresholds for confidence scores */
  thresholds: {
    malicious: number;
    suspicious: number;
  };

  /** Severity multipliers for weighted confidence calculation */
  severityMultipliers: Record<Severity, number>;
}

/**
 * Reputation context for evaluating downgrade conditions
 */
export interface ReputationContext {
  /** Whether reputation analyzers show clean (no threats) */
  isClean: boolean;

  /** Number of link reputation signals found */
  linkSignalCount: number;

  /** Number of sender reputation signals found */
  senderSignalCount: number;

  /** Whether threat signals were detected */
  hasThreats: boolean;

  /** List of threat signal types found */
  threatSignals: string[];
}

/**
 * Load signal configuration from JSON file
 */
export function loadSignalConfig(): SignalConfig {
  // Dynamic import to load JSON at runtime
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const config = require('../../config/signal-config.json') as SignalConfig;

  // Validate version
  if (!config.version) {
    throw new Error('Signal config missing version field');
  }

  // Validate required fields
  if (!config.signalTypes || !config.verdictActions || !config.thresholds) {
    throw new Error('Signal config missing required fields');
  }

  return config;
}

/**
 * Get signal type configuration by signal type name
 * Returns undefined if signal type not configured (signals without config use defaults)
 */
export function getSignalTypeConfig(
  config: SignalConfig,
  signalType: string
): SignalTypeConfig | undefined {
  return config.signalTypes[signalType];
}

/**
 * Check if signal has critical override
 */
export function hasCriticalOverride(
  config: SignalConfig,
  signalType: string
): boolean {
  const signalConfig = getSignalTypeConfig(config, signalType);
  return signalConfig?.criticalOverride ?? false;
}

/**
 * Check if signal can be downgraded
 */
export function canDowngradeSignal(
  config: SignalConfig,
  signalType: string
): boolean {
  const signalConfig = getSignalTypeConfig(config, signalType);
  return signalConfig?.canDowngrade ?? false;
}

/**
 * Get downgrade conditions for a signal type
 */
export function getDowngradeConditions(
  config: SignalConfig,
  signalType: string
): DowngradeConditions | undefined {
  const signalConfig = getSignalTypeConfig(config, signalType);
  return signalConfig?.downgradeConditions;
}

/**
 * Get base weight for a signal type
 */
export function getBaseWeight(config: SignalConfig, signalType: string): number {
  const signalConfig = getSignalTypeConfig(config, signalType);
  return signalConfig?.baseWeight ?? 1.0; // Default weight if not configured
}

/**
 * Get severity multiplier
 */
export function getSeverityMultiplier(config: SignalConfig, severity: Severity): number {
  return config.severityMultipliers[severity] ?? 1.0;
}

/**
 * Get verdict actions for a verdict type
 */
export function getVerdictActions(config: SignalConfig, verdict: Verdict): string[] {
  return config.verdictActions[verdict] ?? [];
}

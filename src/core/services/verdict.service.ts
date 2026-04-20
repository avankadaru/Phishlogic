/**
 * Verdict Service
 * Calculates final verdict, score, red flags, and alert level from analysis signals
 *
 * DESIGN: JSON-driven, signal-agnostic architecture.
 * All signal-specific logic is defined in signal-config.json.
 */

import type {
  Verdict,
  AnalysisSignal,
  RedFlag,
  RedFlagCategory,
  AlertLevel,
} from '../models/analysis-result.js';
import type { AppConfig } from '../../config/app.config.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../infrastructure/logging/index.js';
import {
  loadSignalConfig,
  hasCriticalOverride,
  canDowngradeSignal,
  getDowngradeConditions,
  getSeverityMultiplier,
  getVerdictActions,
  type SignalConfig,
  type ReputationContext,
} from '../models/signal-config.js';

const logger = getLogger();

/**
 * Verdict calculation result
 */
export interface VerdictResult {
  verdict: Verdict;
  confidence: number;
  score: number;
  alertLevel: AlertLevel;
  redFlags: RedFlag[];
  reasoning: string;
  actions: string[]; // NEW: Action items from signal config
}

/**
 * Verdict Service
 */
export class VerdictService {
  private signalConfig: SignalConfig;

  constructor(private config: AppConfig) {
    // Load signal configuration at initialization
    this.signalConfig = loadSignalConfig();
    logger.info({
      msg: 'Signal configuration loaded',
      version: this.signalConfig.version,
      signalTypes: Object.keys(this.signalConfig.signalTypes).length,
    });
  }

  /**
   * Calculate verdict from analysis signals (Enterprise-grade with multi-stage processing)
   */
  calculateVerdict(signals: AnalysisSignal[], analyzerWeights: Map<string, number>): VerdictResult {
    // Stage 1: Critical Threat Detection (Immediate Override)
    const criticalThreat = this.detectCriticalThreat(signals);
    if (criticalThreat) {
      logger.warn({
        msg: 'Critical threat detected - bypassing weighted calculation',
        reason: criticalThreat.reason,
      });

      const redFlags = this.generateRedFlags(signals);
      const reasoning = this.generateActionGuidance('Malicious', signals, redFlags);
      const actions = getVerdictActions(this.signalConfig, 'Malicious');

      return {
        verdict: 'Malicious',
        confidence: 0.9,
        score: 9.0,
        alertLevel: 'high',
        redFlags,
        reasoning,
        actions,
      };
    }

    // Early check for AI verdict - if present, use it directly and skip native calculations
    const finalVerdictSignal = signals.find(s => (s.signalType as string) === 'final_verdict');

    if (finalVerdictSignal?.description && finalVerdictSignal.confidence !== undefined) {
      // AI MODE - Use AI verdict directly
      logger.info({ msg: 'Using AI verdict directly', signal: finalVerdictSignal });

      // Extract AI verdict from description
      const verdictMatch = finalVerdictSignal.description.match(/^VERDICT:\s*(\w+)/i);
      let verdict: Verdict = 'Safe'; // default

      if (verdictMatch && verdictMatch[1]) {
        const aiVerdictString = verdictMatch[1].toLowerCase();
        if (aiVerdictString === 'malicious') verdict = 'Malicious';
        else if (aiVerdictString === 'suspicious') verdict = 'Suspicious';
        else if (aiVerdictString === 'safe') verdict = 'Safe';
      }

      // Use AI's confidence directly (0-1 range)
      const confidence = Math.max(0, Math.min(1, finalVerdictSignal.confidence));

      // Convert to user score (0-10) and percentage (0-100)
      const score = Math.round(confidence * 100) / 10; // 0-10 with 1 decimal
      const alertLevel = this.calculateAlertLevel(score, verdict);

      // Generate red flags from top AI signals (exclude final_verdict itself)
      const aiSignals = signals
        .filter(s => (s.signalType as string) !== 'final_verdict' && s.analyzerName === 'AI')
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
        .slice(0, 5); // Take top 5 highest confidence signals

      const redFlags: RedFlag[] = aiSignals.map(signal => ({
        message: signal.description || String(signal.signalType),
        category: this.categorizeSignal(signal.signalType),
        severity: signal.severity
      }));

      // Use AI's full description as reasoning
      const reasoning = finalVerdictSignal.description.trim();

      // Get actions for the verdict (same config-based actions)
      const actions = getVerdictActions(this.signalConfig, verdict);

      logger.debug({
        msg: 'AI verdict calculated',
        verdict,
        confidence,
        score,
        alertLevel,
        redFlagsCount: redFlags.length,
        actionsCount: actions.length,
      });

      // Return early with AI-based result
      return {
        verdict,
        confidence,
        score,
        alertLevel,
        redFlags,
        reasoning,
        actions,
      };
    }

    // NATIVE MODE - Continue with existing calculation logic
    // Stage 1.5: Process signals with context (NEW - JSON-driven downgrades)
    const processedSignals = this.processSignalsWithContext(signals);

    // Stage 2: Context-Aware Weighted Calculation (use processedSignals)
    const confidence = this.calculateConfidenceWithContext(processedSignals, analyzerWeights);

    // Stage 3: Convert to 0-10 score
    let score = this.convertToUserScore(confidence);

    // Stage 4: Determine base verdict from thresholds
    let verdict = this.determineVerdict(confidence);

    // Stage 5: Severity Override (high/critical signals never result in Safe)
    const hasHighSeveritySignals = processedSignals.some(
      (s) => s.severity === 'high' || s.severity === 'critical'
    );
    if (hasHighSeveritySignals && verdict === 'Safe') {
      verdict = 'Suspicious';
      score = Math.max(score, this.config.analysis.thresholds.suspicious * 10);

      logger.info({
        msg: 'Verdict overridden due to high-severity signals',
        originalVerdict: 'Safe',
        newVerdict: 'Suspicious',
        originalScore: this.convertToUserScore(confidence),
        adjustedScore: score,
      });
    }

    // Stage 5.5: Auth Page Verdict Cap (NEW - Cap verdict at Suspicious for auth pages)
    const scriptSignalForCap = signals.find(s => s.signalType === 'script_execution_detected');
    const authContext = scriptSignalForCap?.evidence?.['loginPageContext'] as any;
    const hasAuthPageContext = authContext?.isLoginPage && authContext?.score >= 5;

    if (hasAuthPageContext && verdict === 'Malicious') {
      logger.info({
        msg: 'Capping verdict at Suspicious due to auth page context',
        originalVerdict: 'Malicious',
        newVerdict: 'Suspicious',
        authType: authContext.authType || 'LOGIN',
        score: authContext.score,
        reasoning: 'JavaScript on authentication pages is expected behavior'
      });

      verdict = 'Suspicious';
      score = Math.min(score, 6.9); // Cap score below malicious threshold (7.0)
    }

    // Stage 6: Calculate alert level
    const alertLevel = this.calculateAlertLevel(score, verdict);

    // Stage 7: Generate red flags and action-oriented guidance
    const redFlags = this.generateRedFlags(processedSignals);

    // For native mode, generate action guidance
    const reasoning = this.generateActionGuidance(verdict, processedSignals, redFlags);

    // Stage 8: Get actions from signal config (NEW - JSON-driven actions)
    const actions = getVerdictActions(this.signalConfig, verdict);

    logger.debug({
      msg: 'Verdict calculated',
      verdict,
      confidence,
      score,
      alertLevel,
      redFlagsCount: redFlags.length,
      actionsCount: actions.length,
    });

    return {
      verdict,
      confidence,
      score,
      alertLevel,
      redFlags,
      reasoning,
      actions,
    };
  }

  /**
   * Stage 1: Detect critical threats that bypass weighted calculation
   * Uses signal-config.json to determine which signals have critical override.
   *
   * Protected so URL-specific subclasses (UrlVerdictService) can layer on
   * additional rules (e.g. known-host demotion) without duplicating the
   * base email logic.
   */
  protected detectCriticalThreat(signals: AnalysisSignal[]): { reason: string } | null {
    // Check for any signal with criticalOverride flag in config
    for (const signal of signals) {
      if (
        signal.severity === 'critical' &&
        hasCriticalOverride(this.signalConfig, signal.signalType)
      ) {
        return {
          reason: signal.description || `Critical threat detected: ${signal.signalType}`,
        };
      }
    }

    // Defensive fallback: any critical AttachmentAnalyzer signal must trigger
    // bypass even if its signalType is missing from signal-config.json. Malicious
    // attachments are deterministic threats regardless of config coverage.
    for (const signal of signals) {
      if (
        signal.severity === 'critical' &&
        signal.analyzerName === 'AttachmentAnalyzer' &&
        typeof signal.signalType === 'string' &&
        signal.signalType.startsWith('attachment_')
      ) {
        return {
          reason: signal.description || `Critical attachment threat: ${signal.signalType}`,
        };
      }
    }

    // Multiple critical URL threats (2+ sources)
    const criticalUrlThreats = signals.filter(
      (s) =>
        s.severity === 'critical' &&
        hasCriticalOverride(this.signalConfig, s.signalType) &&
        ['url_flagged_malicious', 'domain_blacklisted', 'automatic_download_detected'].includes(
          s.signalType
        )
    );
    if (criticalUrlThreats.length >= 2) {
      return { reason: 'Multiple critical threat indicators detected' };
    }

    // Domain-cohesion + urgency combo: classic phishing pattern where the
    // message impersonates a legitimate context (via link/sender/brand mismatch
    // or typosquatting) AND uses high-pressure urgency language. Neither alone
    // is Malicious, but together they are a reliable phishing signature.
    const DOMAIN_COHESION_SIGNALS = new Set<string>([
      'link_sender_domain_mismatch',
      'brand_impersonation_suspected',
      'sender_mismatch',
      'typosquat_hostname',
      'button_text_mismatch',
    ]);
    const URGENCY_SIGNALS = new Set<string>([
      'urgency_language_detected',
      'emotional_pressure_detected',
    ]);

    const cohesionSignal = signals.find(
      (s) =>
        DOMAIN_COHESION_SIGNALS.has(s.signalType) &&
        (s.severity === 'high' || s.severity === 'critical')
    );
    const urgencySignal = signals.find(
      (s) =>
        URGENCY_SIGNALS.has(s.signalType) &&
        (s.severity === 'high' || s.severity === 'critical')
    );

    if (cohesionSignal && urgencySignal) {
      return {
        reason: `Domain cohesion violation (${cohesionSignal.signalType}) combined with urgency language (${urgencySignal.signalType}) - phishing pattern`,
      };
    }

    return null;
  }

  /**
   * Stage 1.5: Process signals with cross-analyzer context awareness
   * Downgrade signals when reputation analyzers indicate legitimate domain
   * NEVER downgrade malicious behavior signals (downloads, script execution, etc.)
   */
  private processSignalsWithContext(signals: AnalysisSignal[]): AnalysisSignal[] {
    // Check for auth page context in JavaScript threats (NEW - Enhanced Auth Detection)
    const scriptSignal = signals.find(s => s.signalType === 'script_execution_detected');
    let loginContext = scriptSignal?.evidence?.['loginPageContext'] as any;

    // Enhanced check: Require both isLoginPage AND score >= 5
    // APPLIES TO ALL DOMAINS: Even non-legitimate domains benefit from downgrade
    if (loginContext?.isLoginPage && loginContext?.score >= 5) {
      logger.info({
        msg: 'Auth page context detected - applying severity downgrade to JS threats',
        authType: loginContext.authType || 'LOGIN',
        score: loginContext.score,
        confidence: loginContext.confidence,
        detectionMethod: loginContext.detectionMethod,
        reasoning: loginContext.reasoning || 'JavaScript is expected on authentication pages'
      });
    } else if (!loginContext || !loginContext.isLoginPage) {
      // Fallback: Check redirect URL patterns for login pages
      const redirectSignal = signals.find(s => s.signalType === 'suspicious_redirect');
      if (redirectSignal?.evidence?.['finalUrl']) {
        const finalUrl = String(redirectSignal.evidence['finalUrl']);
        const loginPatterns = [
          '/signin', '/login', '/auth', '/authenticate',
          '/account/login', '/session/new', '/sso',
          'login.microsoftonline', 'accounts.google', 'okta.com', 'auth0.com'
        ];

        if (loginPatterns.some(p => finalUrl.toLowerCase().includes(p))) {
          logger.info({
            msg: 'Auth context inferred from redirect pattern (fallback)',
            originalUrl: redirectSignal.evidence['originalUrl'],
            finalUrl,
            reasoning: 'URL pattern indicates authentication page'
          });

          // Create synthetic login context for downgrade logic
          loginContext = {
            isLoginPage: true,
            authType: 'LOGIN',
            confidence: 0.5,
            score: 5,
            reasoning: 'Inferred from URL pattern - JavaScript expected on auth pages'
          };
        }
      }
    }

    // Apply downgrade if we have valid auth context
    if (loginContext?.isLoginPage && loginContext?.score >= 5) {
      // Determine confidence multiplier based on auth type
      // SSO is most trusted (0.5x), followed by OAuth (0.6x), then MFA/LOGIN (0.7x)
      let confidenceMultiplier = 0.7; // Default for LOGIN
      switch (loginContext.authType) {
        case 'SSO':
          confidenceMultiplier = 0.5;
          break;
        case 'OAUTH':
          confidenceMultiplier = 0.6;
          break;
        case 'MFA':
        case 'LOGIN':
          confidenceMultiplier = 0.7;
          break;
      }

      logger.info({
        msg: 'Applying auth-type-specific downgrade multiplier',
        authType: loginContext.authType,
        multiplier: confidenceMultiplier
      });

      // Downgrade JavaScript threat signals
      // Do NOT downgrade critical override threats (automatic_download, domain_blacklisted, etc.)
      const processedSignals = signals.map(signal => {
        // Only downgrade JavaScript-specific threats
        if (signal.signalType !== 'script_execution_detected' &&
            signal.signalType !== 'suspicious_javascript_detected') {
          return signal; // Keep other signals unchanged
        }

        // Apply auth-type-specific confidence reduction
        const newConfidence = Math.max(0.3, signal.confidence * confidenceMultiplier);

        // Downgrade severity if currently high/critical
        let newSeverity = signal.severity;
        if (signal.severity === 'critical' || signal.severity === 'high') {
          newSeverity = 'medium'; // Login pages → suspicious, not malicious
        }

        logger.debug({
          msg: 'Signal downgraded due to login page context',
          signalType: signal.signalType,
          originalSeverity: signal.severity,
          newSeverity,
          originalConfidence: signal.confidence,
          newConfidence
        });

        return {
          ...signal,
          severity: newSeverity,
          confidence: newConfidence,
          description: `${signal.description} (Login page: JS expected for validation)`,
          evidence: {
            ...signal.evidence,
            contextDowngraded: true,
            originalSeverity: signal.severity,
            originalConfidence: signal.confidence,
            downgradeReason: loginContext.reasoning
          }
        };
      });

      // Continue with reputation-based downgrading on the processed signals
      const reputationContext = this.analyzeReputationContext(processedSignals);
      if (reputationContext.isClean) {
        return this.applyReputationDowngrade(processedSignals, reputationContext);
      }

      return processedSignals;
    }

    // No login page context - proceed with reputation-based downgrading
    const reputationContext = this.analyzeReputationContext(signals);

    if (reputationContext.isClean) {
      return this.applyReputationDowngrade(signals, reputationContext);
    }

    logger.debug({
      msg: 'Threat indicators detected - no downgrading',
      threatSignals: reputationContext.threatSignals,
    });

    return signals; // Threats detected - keep original
  }

  /**
   * Apply reputation-based downgrading to signals
   */
  private applyReputationDowngrade(
    signals: AnalysisSignal[],
    reputationContext: ReturnType<typeof this.analyzeReputationContext>
  ): AnalysisSignal[] {
    logger.debug({
      msg: 'Clean reputation detected - checking for downgradeable signals',
      linkSignalCount: reputationContext.linkSignalCount,
      senderSignalCount: reputationContext.senderSignalCount,
    });

    return signals.map((signal) => {
        // Check if signal can be downgraded (from config)
        if (!canDowngradeSignal(this.signalConfig, signal.signalType)) {
          return signal; // No downgrade - keep original
        }

        // Get downgrade conditions from config
        const downgradeConditions = getDowngradeConditions(
          this.signalConfig,
          signal.signalType
        );
        if (!downgradeConditions) {
          return signal; // No conditions defined
        }

        // Check if downgrade conditions are met
        if (this.shouldDowngrade(signal, downgradeConditions, reputationContext)) {
          const action = downgradeConditions.action;

          logger.debug({
            msg: 'Downgrading signal due to clean reputation',
            signalType: signal.signalType,
            originalSeverity: signal.severity,
            newSeverity: action.newSeverity,
            originalConfidence: signal.confidence,
          });

          return {
            ...signal,
            severity: action.newSeverity,
            confidence: signal.confidence * action.confidenceMultiplier,
            description: `${signal.description} (downgraded: ${action.reason})`,
            evidence: {
              ...signal.evidence,
              contextDowngraded: true,
              originalSeverity: signal.severity,
              originalConfidence: signal.confidence,
              downgradeReason: action.reason,
            },
          };
        }

        return signal;
      });
  }

  /**
   * Check if signal should be downgraded based on conditions
   */
  private shouldDowngrade(
    _signal: AnalysisSignal,
    conditions: NonNullable<ReturnType<typeof getDowngradeConditions>>,
    context: ReputationContext
  ): boolean {
    const { requireCleanReputation, logic } = conditions;

    // Build checks array
    const checks: boolean[] = [];

    if (requireCleanReputation.includes('link')) {
      checks.push(context.isClean && context.linkSignalCount === 0);
    }

    if (requireCleanReputation.includes('sender')) {
      checks.push(context.isClean && context.senderSignalCount === 0);
    }

    // Apply logic operator
    if (logic === 'AND') {
      return checks.every((check) => check);
    } else {
      // OR logic
      return checks.some((check) => check);
    }
  }

  /**
   * Analyze reputation signals to determine if domain/sender is clean
   */
  private analyzeReputationContext(signals: AnalysisSignal[]): ReputationContext {
    const linkReputationSignals = signals.filter(
      (s) => s.analyzerName === 'LinkReputationAnalyzer'
    );
    const senderReputationSignals = signals.filter(
      (s) => s.analyzerName === 'SenderReputationAnalyzer'
    );

    // Threat signal types (negative indicators)
    const threatSignalTypes = new Set([
      'url_flagged_malicious',
      'url_flagged_suspicious',
      'url_in_malware_database',
      'url_in_phishing_database',
      'domain_blacklisted',
      'domain_recently_registered',
      'mx_record_missing',
      'dns_a_record_missing',
      'invalid_email_format',
      'disposable_email',
      'spf_fail',
      'dkim_fail',
    ]);

    // Positive signals (NOT threats)
    const positiveSignalTypes = new Set(['spf_pass', 'dkim_pass', 'domain_reputation_good']);

    const threatSignals = signals.filter(
      (s) =>
        (s.analyzerName === 'LinkReputationAnalyzer' ||
          s.analyzerName === 'SenderReputationAnalyzer') &&
        threatSignalTypes.has(s.signalType) &&
        !positiveSignalTypes.has(s.signalType)
    );

    const hasThreats = threatSignals.length > 0;
    const isClean = !hasThreats;

    return {
      isClean,
      linkSignalCount: linkReputationSignals.filter((s) => threatSignalTypes.has(s.signalType))
        .length,
      senderSignalCount: senderReputationSignals.filter((s) =>
        threatSignalTypes.has(s.signalType)
      ).length,
      hasThreats,
      threatSignals: threatSignals.map((s) => s.signalType),
    };
  }

  /**
   * Stage 2: Context-aware weighted calculation with dynamic adjustments
   */
  private calculateConfidenceWithContext(signals: AnalysisSignal[], analyzerWeights: Map<string, number>): number {
    if (signals.length === 0) {
      return 0;
    }

    // Check for content-based threats
    const hasContentThreats = signals.some(s =>
      ['negative_sentiment_high', 'emotional_pressure_detected', 'language_anomaly_detected',
       'brand_impersonation_suspected'].includes(s.signalType) && s.severity !== 'low'
    );

    // Check for threat intelligence confirmations
    const hasThreatIntel = signals.some(s =>
      ['url_flagged_malicious', 'url_flagged_suspicious', 'url_in_malware_database',
       'url_in_phishing_database', 'domain_blacklisted'].includes(s.signalType)
    );

    let weightedSum = 0;
    let totalWeight = 0;

    for (const signal of signals) {
      const weight = analyzerWeights.get(signal.analyzerName) ?? 1.0;
      let signalValue = this.getSignalValue(signal);

      // Context 1: Reduce positive signals when content threats exist
      if (hasContentThreats && signalValue < 0) {
        const reduction = this.config.analysis.signalAdjustments.contextPositiveReduction;
        signalValue = signalValue * (1 - reduction);
      }

      // Context 2: Boost threat intel signals when multiple sources agree
      if (hasThreatIntel && signalValue > 0 &&
          ['LinkReputationAnalyzer', 'SenderReputationAnalyzer'].includes(signal.analyzerName)) {
        const boost = this.config.analysis.signalAdjustments.contextThreatIntelBoost;
        signalValue = signalValue * (1 + boost);
      }

      // Context 3: Amplify critical signals
      if (signal.severity === 'critical') {
        const boost = this.config.analysis.signalAdjustments.contextCriticalBoost;
        signalValue = signalValue * (1 + boost);
      }

      weightedSum += signalValue * signal.confidence * weight;
      totalWeight += weight;
    }

    const avgConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, avgConfidence));
  }

  /**
   * Get signal value (positive or negative)
   * Uses signal-config.json for severity multipliers
   */
  private getSignalValue(signal: AnalysisSignal): number {
    // Positive signals (decrease risk) - configurable impact
    const positiveSignals = ['spf_pass', 'dkim_pass', 'domain_reputation_good'];

    if (positiveSignals.includes(signal.signalType)) {
      return -this.config.analysis.signalAdjustments.positiveSignalValue;
    }

    // Negative signals (increase risk) - weighted by severity from config
    return getSeverityMultiplier(this.signalConfig, signal.severity);
  }

  /**
   * Convert internal confidence (0-1) to user-facing score (0-10)
   */
  private convertToUserScore(confidence: number): number {
    // Scale confidence to 0-10
    const score = confidence * 10;

    // Round to 1 decimal place
    return Math.round(score * 10) / 10;
  }

  /**
   * Determine verdict based on confidence
   */
  private determineVerdict(confidence: number): Verdict {
    if (confidence >= this.config.analysis.thresholds.malicious) {
      return 'Malicious';
    } else if (confidence >= this.config.analysis.thresholds.suspicious) {
      return 'Suspicious';
    } else {
      return 'Safe';
    }
  }

  /**
   * Calculate alert level based on score and verdict
   */
  protected calculateAlertLevel(score: number, verdict: Verdict): AlertLevel {
    if (verdict === 'Malicious' || score >= 7.0) {
      return 'high';
    } else if (verdict === 'Suspicious' || score >= 4.0) {
      return 'medium';
    } else if (score >= 2.0) {
      return 'low';
    } else {
      return 'none';
    }
  }

  /**
   * Generate plain English red flags from signals
   */
  protected generateRedFlags(signals: AnalysisSignal[]): RedFlag[] {
    const redFlags: RedFlag[] = [];
    const seenCategories = new Set<string>();

    for (const signal of signals) {
      // Skip positive signals
      if (['spf_pass', 'dkim_pass', 'domain_reputation_good'].includes(signal.signalType)) {
        continue;
      }

      // Convert signal to red flag
      const redFlag = this.signalToRedFlag(signal);

      // Avoid duplicate categories for similar signals
      const categoryKey = `${redFlag.category}-${signal.signalType}-${redFlag.severity}`;
      if (!seenCategories.has(categoryKey)) {
        redFlags.push(redFlag);
        seenCategories.add(categoryKey);
      }
    }

    // Sort by severity (critical > high > medium > low)
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    redFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return redFlags;
  }

  /**
   * Convert technical signal to plain English red flag
   */
  private signalToRedFlag(signal: AnalysisSignal): RedFlag {
    const category = this.categorizeSignal(signal.signalType);
    const message = this.simplifyMessage(signal.description);

    return {
      category,
      message,
      severity: signal.severity,
    };
  }

  /**
   * Categorize signal type
   * Uses signal-config.json categories when available, falls back to heuristics
   */
  protected categorizeSignal(signalType: string): RedFlagCategory {
    // Try to get category from signal config
    const signalTypeConfig = this.signalConfig.signalTypes[signalType];
    if (signalTypeConfig) {
      const category = signalTypeConfig.category;
      // Map config categories to RedFlagCategory
      if (category === 'email_authentication') return 'authentication';
      if (category === 'sender_validation') return 'sender';
      if (category === 'reputation' || category === 'url_pattern' || category === 'redirect_chain')
        return 'url';
      if (category === 'credential_harvesting' || category === 'content_analysis') return 'content';
      if (
        category === 'malicious_behavior' ||
        category === 'attachment' ||
        category === 'dns_validation'
      )
        return 'suspicious_behavior';
    }

    // Fallback heuristics for unknown signals
    if (['spf_fail', 'dkim_fail', 'header_anomaly'].includes(signalType)) {
      return 'authentication';
    }
    if (['sender_mismatch'].includes(signalType)) {
      return 'sender';
    }
    if (
      [
        'high_entropy_url',
        'suspicious_tld',
        'url_shortener',
        'https_missing',
        'suspicious_redirect',
        'typosquat_hostname',
        'numeric_ip_hostname',
        'suspicious_hostname_structure',
      ].includes(signalType)
    ) {
      return 'url';
    }
    if (['phishing_keywords', 'form_detected'].includes(signalType)) {
      return 'content';
    }
    return 'suspicious_behavior';
  }

  /**
   * Simplify technical message to plain English
   */
  private simplifyMessage(technicalMessage: string): string {
    // Already written in plain English by analyzers, but we can simplify further if needed
    return technicalMessage;
  }

  /**
   * Generate action-oriented plain English guidance for end users
   */
  private generateActionGuidance(verdict: Verdict, signals: AnalysisSignal[], redFlags: RedFlag[]): string {
    const parts: string[] = [];

    // Verdict statement with immediate action
    if (verdict === 'Malicious') {
      parts.push('⚠️ DANGER: This is a phishing attempt or malware.');
      parts.push('ACTION REQUIRED: Delete this email immediately. Do not click any links or open attachments.');

      // Specific threats
      const hasMalware = signals.some((s) => s.signalType.includes('malware'));
      const hasPhishingUrl = signals.some((s) => s.signalType.includes('phishing_database'));
      const hasAutomaticDownload = signals.some((s) =>
        s.signalType.includes('automatic_download_detected')
      );
      const hasScriptExecution = signals.some((s) =>
        s.signalType.includes('script_execution_detected')
      );
      const hasInstallationPrompt = signals.some((s) =>
        s.signalType.includes('installation_prompt_detected')
      );

      if (hasMalware) {
        parts.push('⚠️ Malware detected in attachment - do not download or open.');
      }
      if (hasPhishingUrl) {
        parts.push('⚠️ Known phishing link detected - clicking could compromise your account.');
      }
      if (hasAutomaticDownload) {
        parts.push('⚠️ Automatic download attempt detected - do not proceed to this website.');
      }
      if (hasScriptExecution) {
        parts.push('⚠️ Malicious script execution detected - close browser immediately.');
      }
      if (hasInstallationPrompt) {
        parts.push(
          '⚠️ Software installation prompt detected - do not install anything from this source.'
        );
      }

      parts.push('Report this email to your IT security team immediately.');

    } else if (verdict === 'Suspicious') {
      parts.push('⚠️ CAUTION: This email shows suspicious characteristics.');
      parts.push('RECOMMENDED ACTION: Do not interact with this email until verified.');

      // Categorize red flags
      const categories = this.categorizeRedFlags(redFlags);

      if (categories.authentication.length > 0) {
        parts.push('• Sender verification failed - email may be spoofed.');
      }
      if (categories.url.length > 0) {
        parts.push('• Suspicious or unverified links detected - do not click.');
      }
      if (categories.content.length > 0) {
        parts.push('• Email uses pressure tactics or suspicious language.');
      }
      if (categories.sender.length > 0) {
        parts.push('• Sender domain or email address appears suspicious.');
      }

      parts.push('If you were expecting this email, verify with sender through alternate channel (phone/in-person).');

    } else {
      // Safe
      parts.push('✅ No significant security concerns detected.');

      // Positive indicators
      const positiveSignals = signals.filter(s =>
        ['spf_pass', 'dkim_pass', 'domain_reputation_good'].includes(s.signalType)
      );

      if (positiveSignals.length > 0) {
        parts.push('Sender authentication passed. This appears to be legitimate.');
      }

      parts.push('BEST PRACTICE: Still verify unexpected requests for sensitive information or urgent actions.');
    }

    return parts.join(' ');
  }

  /**
   * Helper to categorize red flags for better guidance
   */
  private categorizeRedFlags(redFlags: RedFlag[]): Record<RedFlagCategory, RedFlag[]> {
    return {
      authentication: redFlags.filter(f => f.category === 'authentication'),
      url: redFlags.filter(f => f.category === 'url'),
      content: redFlags.filter(f => f.category === 'content'),
      sender: redFlags.filter(f => f.category === 'sender'),
      suspicious_behavior: redFlags.filter(f => f.category === 'suspicious_behavior'),
    };
  }

}

/**
 * Singleton instance
 */
let verdictServiceInstance: VerdictService | null = null;

/**
 * Get or create verdict service instance
 */
export function getVerdictService(): VerdictService {
  if (!verdictServiceInstance) {
    const config = getConfig();
    verdictServiceInstance = new VerdictService(config);
  }
  return verdictServiceInstance;
}

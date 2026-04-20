/**
 * FormUrlAnalyzer — URL-task specialization of FormAnalyzer.
 *
 * Differences from the base (email) behavior:
 *   1. KNOWN_AUTH_ORIGINS suppression: a `credential_form` on a legitimate
 *      OAuth/SSO origin (accounts.google.com, login.microsoftonline.com,
 *      github.com, etc.) is expected and MUST NOT drive Malicious.
 *   2. Escalation on young / non-Tranco hosts: a `credential_form` on a
 *      host NOT in the Tranco top-1M, OR with a WHOIS age < 30 days, is
 *      escalated from 'high' to 'critical'.
 */
import { getLogger } from '../../../infrastructure/logging/index.js';
import { getDomainAgeService } from '../../../infrastructure/reputation/whois.client.js';
import { getTrancoService } from '../../../infrastructure/reputation/tranco.service.js';
import type { AnalysisSignal, SignalSeverity } from '../../models/analysis-result.js';
import type { ContentPrescanMode } from '../../models/content-prescan.js';
import type { NormalizedInput } from '../../models/input.js';
import { isUrlInput } from '../../models/input.js';
import { getKnownDomainPolicy, KNOWN_AUTH_ORIGINS } from '../../policies/known-domain.policy.js';
import { FormAnalyzer } from './form.analyzer.js';

const logger = getLogger();

function downgrade(severity: SignalSeverity): SignalSeverity {
  switch (severity) {
    case 'critical': return 'medium';
    case 'high': return 'low';
    case 'medium': return 'low';
    default: return severity;
  }
}

export class FormUrlAnalyzer extends FormAnalyzer {
  override getName(): string {
    return 'FormAnalyzer';
  }

  getSupportedPrescanModes(): ContentPrescanMode[] {
    return ['url'];
  }

  override async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    if (!isUrlInput(input)) return super.analyze(input);

    // Skip browser navigation when prescan already failed (domain unreachable)
    const fetchError = (input.riskProfile as any)?.urlFetch?.fetchError;
    if (fetchError) {
      logger.info({
        msg: 'FormUrlAnalyzer: skipping — prescan navigation already failed',
        url: input.data.url,
        fetchError,
      });
      return [];
    }

    const signals = await super.analyze(input);

    const url = input.data.url;
    const policy = getKnownDomainPolicy();
    const host = policy.extractHostname(url);
    const registrable = host ? policy.extractRegistrableDomain(host) : null;

    const isKnownAuthOrigin = host !== null && KNOWN_AUTH_ORIGINS.has(host);
    const isInTranco = registrable !== null && getTrancoService().has(registrable);

    let ageDays: number | null = null;
    if (!isKnownAuthOrigin && !isInTranco && registrable) {
      try {
        ageDays = await getDomainAgeService().getAgeDays(registrable);
      } catch (err) {
        logger.debug({
          msg: 'FormUrlAnalyzer: WHOIS age lookup failed',
          host,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const out: AnalysisSignal[] = [];
    for (const signal of signals) {
      // The base FormAnalyzer emits every form finding as `form_detected`;
      // we key off `evidence.sensitiveFields` to decide if it is a
      // credential form and therefore subject to URL-specific adjustment.
      if (signal.signalType === 'form_detected') {
        const evidence = (signal.evidence ?? {}) as Record<string, unknown>;
        const sensitiveFields = Array.isArray(evidence['sensitiveFields'])
          ? (evidence['sensitiveFields'] as Array<{ type?: string }>)
          : [];
        const hasPasswordField = sensitiveFields.some((f) => f?.type === 'password');

        if (hasPasswordField && isKnownAuthOrigin) {
          logger.info({
            msg: 'FormUrlAnalyzer: suppressing credential form on KNOWN_AUTH_ORIGIN',
            host,
          });
          const newSev = downgrade(signal.severity);
          out.push({
            ...signal,
            severity: newSev,
            description: `${signal.description} (downgraded: host is a recognized authentication origin)`,
            evidence: {
              ...signal.evidence,
              contextDowngraded: true,
              originalSeverity: signal.severity,
              downgradeReason: 'host is a recognized authentication origin',
            },
          });
          continue;
        }

        const shouldEscalate =
          hasPasswordField && (!isInTranco || (ageDays !== null && ageDays < 30));
        if (shouldEscalate && signal.severity !== 'critical') {
          logger.warn({
            msg: 'FormUrlAnalyzer: escalating credential form on young / non-Tranco host',
            host,
            ageDays,
            isInTranco,
          });
          out.push({
            ...signal,
            severity: 'critical',
            confidence: Math.max(signal.confidence, 0.9),
            evidence: {
              ...evidence,
              escalationReason: !isInTranco ? 'non_tranco_host' : 'young_domain',
              ageDays,
              isInTranco,
            },
          });
          continue;
        }
      }

      out.push(signal);
    }

    logger.info({
      msg: 'FormUrlAnalyzer completed',
      url,
      host,
      isKnownAuthOrigin,
      isInTranco,
      ageDays,
      baseSignalCount: signals.length,
      finalSignalCount: out.length,
    });

    return out;
  }
}

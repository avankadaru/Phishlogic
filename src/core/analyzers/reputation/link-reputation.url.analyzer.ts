/**
 * LinkReputationUrlAnalyzer — URL-task specialization of LinkReputationAnalyzer.
 *
 * Differences from the base (email) behavior:
 *   - Single-URL mode: only the target URL is checked against TI sources;
 *     there is no "body links vs sender" cohort.
 *   - Sender-mismatch branch is skipped entirely (no sender concept).
 *   - Known-safe hosts: all reputation signals are severity-downgraded so
 *     a transient TI misclassification on e.g. google.com never becomes a
 *     Malicious verdict.
 *
 * The base class still performs all URLhaus / PhishTank lookups and
 * caching. We wrap it, filter out the sender-mismatch output (defensive
 * even though the base is guarded by isEmailInput), and apply the
 * known-domain downgrade.
 */
import { getLogger } from '../../../infrastructure/logging/index.js';
import type { AnalysisSignal, SignalSeverity } from '../../models/analysis-result.js';
import type { ContentPrescanMode } from '../../models/content-prescan.js';
import type { NormalizedInput } from '../../models/input.js';
import { isUrlInput } from '../../models/input.js';
import { getKnownDomainPolicy } from '../../policies/known-domain.policy.js';
import { LinkReputationAnalyzer } from './link-reputation.analyzer.js';

const logger = getLogger();

function downgrade(severity: SignalSeverity): SignalSeverity {
  switch (severity) {
    case 'critical': return 'medium';
    case 'high': return 'low';
    case 'medium': return 'low';
    default: return severity;
  }
}

export class LinkReputationUrlAnalyzer extends LinkReputationAnalyzer {
  override getName(): string {
    return 'LinkReputationAnalyzer';
  }

  getSupportedPrescanModes(): ContentPrescanMode[] {
    return ['url'];
  }

  override async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    const signals = await super.analyze(input);
    if (!isUrlInput(input)) return signals;

    const url = input.data.url;
    const policy = getKnownDomainPolicy();
    const isKnownSafe = policy.isKnownSafeHost(url);

    const out: AnalysisSignal[] = [];
    for (const signal of signals) {
      // Defensive: sender-mismatch is email-only — drop if it somehow leaks.
      if (signal.signalType === 'link_sender_domain_mismatch') {
        logger.debug({
          msg: 'LinkReputationUrlAnalyzer: dropping email-only signal in URL path',
          signalType: signal.signalType,
        });
        continue;
      }

      if (
        isKnownSafe &&
        (signal.signalType === 'url_flagged_malicious' ||
          signal.signalType === 'url_flagged_suspicious' ||
          signal.signalType === 'url_in_phishing_database' ||
          signal.signalType === 'url_in_malware_database')
      ) {
        logger.info({
          msg: 'LinkReputationUrlAnalyzer: downgrading TI signal for known-safe host',
          url,
          signalType: signal.signalType,
          originalSeverity: signal.severity,
        });
        out.push({ ...signal, severity: downgrade(signal.severity) });
        continue;
      }

      out.push(signal);
    }

    logger.info({
      msg: 'LinkReputationUrlAnalyzer completed',
      url,
      isKnownSafe,
      baseSignalCount: signals.length,
      finalSignalCount: out.length,
    });

    return out;
  }
}

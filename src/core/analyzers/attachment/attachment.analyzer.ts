/**
 * Attachment Analyzer
 * Analyzes email attachments for malicious content
 *
 * Phase 3 Implementation:
 * - File type detection and validation
 * - Suspicious file type detection (executables, macros, etc.)
 * - File type spoofing detection
 * - Archive content analysis
 *
 * Future enhancements (when infrastructure available):
 * - ClamAV malware scanning
 * - YARA rule matching
 * - Cuckoo Sandbox dynamic analysis
 *
 * Graceful degradation: Works without external infrastructure
 */

import { BaseAnalyzer } from '../base/index.js';
import type { AnalysisSignal } from '../../models/analysis-result.js';
import type { NormalizedInput } from '../../models/input.js';
import { isEmailInput } from '../../models/input.js';
import { getLogger } from '../../../infrastructure/logging/index.js';

const logger = getLogger();

interface FileAnalysisResult {
  filename: string;
  declaredType: string;
  actualType: string | null;
  size: number;
  suspicious: boolean;
  reasons: string[];
  threatLevel: 'clean' | 'suspicious' | 'dangerous';
}

/**
 * Attachment Analyzer
 * Analyzes email attachments using file type detection and heuristics
 */
export class AttachmentAnalyzer extends BaseAnalyzer {
  // Dangerous file extensions (executables, scripts, macros, rising-threat droppers)
  private readonly dangerousExtensions = new Set([
    '.exe', '.dll', '.scr', '.com', '.bat', '.cmd', '.ps1',
    '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh',
    '.msi', '.msp', '.pif', '.cpl',
    '.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm',
    '.jar', '.app', '.deb', '.rpm',
    // Rising-threat malware droppers (2023-2026)
    '.lnk', '.hta', '.chm',
  ]);

  // High-risk suspicious extensions — credential harvesters and script-in-image carriers.
  // These push verdict toward Suspicious via weighted calc; they do NOT auto-Malicious.
  private readonly highRiskSuspiciousExtensions = new Set([
    '.html', '.htm', '.xhtml', // HTML phishing pages as attachments
    '.svg',                     // SVG can embed JavaScript
    '.one',                     // OneNote - used in malspam
    '.vhd', '.vhdx',            // disk images
  ]);

  // Phishing-impersonation filename heuristics. Matching is done against a
  // normalized filename where `_` and `-` are converted to spaces so that
  // word-boundary matching works across attacker-favored separators (e.g.
  // `invoice_amazon_secure`). Single-word matches are detected explicitly.
  private readonly phishingFilenameKeywords: Array<{ label: string; words: string[] }> = [
    {
      label: 'financial',
      words: ['invoice', 'remittance', 'receipt', 'purchase order', 'wire', 'payment'],
    },
    { label: 'e-signature brand', words: ['docusign', 'adobe sign', 'adobesign', 'hellosign'] },
    {
      label: 'microsoft brand',
      words: ['microsoft', 'office365', 'outlook', 'onedrive', 'sharepoint', 'teams'],
    },
    {
      label: 'cloud brand alert',
      words: [
        'amazon security',
        'amazon account',
        'amazon alert',
        'amazon notice',
        'paypal security',
        'paypal account',
        'paypal alert',
        'paypal notice',
        'apple security',
        'apple account',
        'apple alert',
        'apple notice',
        'google security',
        'google account',
        'google alert',
        'google notice',
      ],
    },
    {
      label: 'legal threat',
      words: ['court', 'legal', 'subpoena', 'lawsuit'],
    },
    {
      label: 'urgency wrapper',
      words: [
        'secure document',
        'secure file',
        'secure message',
        'urgent document',
        'urgent file',
        'urgent message',
        'confidential document',
        'confidential file',
        'confidential message',
        'important document',
        'important file',
        'important message',
      ],
    },
    { label: 'voicemail/fax lure', words: ['voicemail', 'fax', 'scan'] },
    // Brand-only matches (single token) — narrower than broad brand lists to
    // avoid false positives in legitimate filenames.
    { label: 'brand bare', words: ['amazon', 'paypal', 'docusign'] },
  ];

  getName(): string {
    return 'AttachmentAnalyzer';
  }

  getWeight(): number {
    return this.config.analysis.analyzerWeights.attachment; // Configurable from env (default: 2.3)
  }

  getType(): 'static' | 'dynamic' {
    return 'static';
  }

  override isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  async analyze(input: NormalizedInput): Promise<AnalysisSignal[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const signals: AnalysisSignal[] = [];

    // NEW: Check if attachment metadata already extracted by risk profile
    if (input.riskProfile?.attachmentMetadata && input.riskProfile.attachmentMetadata.length > 0) {
      logger.debug({
        msg: 'Using pre-extracted attachment metadata from risk profile',
        attachmentCount: input.riskProfile.attachmentMetadata.length,
      });

      // Generate signals directly from pre-extracted metadata
      for (const metadata of input.riskProfile.attachmentMetadata) {
        // Generate signals based on suspicious flag
        if (metadata.isSuspicious && metadata.suspicionReasons.length > 0) {
          // Determine severity based on reasons
          const hasDangerousExt = metadata.suspicionReasons.some(
            (reason: string) =>
              reason.includes('Executable') ||
              reason.includes('Macro-enabled') ||
              reason.includes('Double extension')
          );

          if (hasDangerousExt) {
            signals.push(
              this.createSignal({
                signalType: 'attachment_dangerous_type',
                severity: 'critical',
                confidence: 0.95,
                description: `Dangerous attachment detected: ${metadata.filename} (${metadata.suspicionReasons.join(', ')})`,
                evidence: {
                  filename: metadata.filename,
                  mimeType: metadata.mimeType,
                  extension: metadata.extension,
                  size: metadata.sizeBytes,
                  reasons: metadata.suspicionReasons,
                },
              })
            );
          } else {
            signals.push(
              this.createSignal({
                signalType: 'attachment_suspicious_type',
                severity: 'high',
                confidence: 0.8,
                description: `Suspicious attachment: ${metadata.filename} (${metadata.suspicionReasons.join(', ')})`,
                evidence: {
                  filename: metadata.filename,
                  mimeType: metadata.mimeType,
                  extension: metadata.extension,
                  size: metadata.sizeBytes,
                  reasons: metadata.suspicionReasons,
                },
              })
            );
          }
        }

        // Brand/urgency filename heuristic — fires regardless of extension severity
        const phishingMatches = this.matchPhishingPatterns(metadata.filename);
        if (phishingMatches.length > 0) {
          signals.push(
            this.createSignal({
              signalType: 'attachment_phishing_pattern',
              severity: 'high',
              confidence: 0.85,
              description: `Attachment filename matches phishing impersonation patterns: ${metadata.filename} (${phishingMatches.map((m) => m.label).join(', ')})`,
              evidence: {
                filename: metadata.filename,
                patterns: phishingMatches.map((m) => m.label),
                matchedTerms: phishingMatches.map((m) => m.matched),
              },
            })
          );
        }
      }

      logger.debug({
        msg: 'Attachment analysis complete (using risk profile)',
        signalsGenerated: signals.length,
      });

      return signals;
    }

    // Fallback: Full analysis from input.data.parsed.attachments
    const attachments = input.data.parsed.attachments || [];

    if (attachments.length === 0) {
      logger.debug('No attachments to analyze');
      return signals;
    }

    logger.debug({
      msg: 'Starting attachment analysis (fallback mode)',
      attachmentCount: attachments.length,
    });

    // Analyze all attachments in parallel
    const analysisResults = await Promise.allSettled(
      attachments.map((att) => this.analyzeAttachment(att))
    );

    // Process results
    for (let i = 0; i < analysisResults.length; i++) {
      const result = analysisResults[i];

      if (result?.status === 'fulfilled') {
        const analysis = result.value;

        // Generate signals based on threat level
        if (analysis.threatLevel === 'dangerous') {
          signals.push(
            this.createSignal({
              signalType: 'attachment_dangerous_type',
              severity: 'critical',
              confidence: 0.95,
              description: `Dangerous attachment detected: ${analysis.filename} (${analysis.reasons.join(', ')})`,
              evidence: {
                filename: analysis.filename,
                declaredType: analysis.declaredType,
                actualType: analysis.actualType,
                size: analysis.size,
                reasons: analysis.reasons,
              },
            })
          );
        } else if (analysis.threatLevel === 'suspicious') {
          signals.push(
            this.createSignal({
              signalType: 'attachment_suspicious_type',
              severity: 'high',
              confidence: 0.8,
              description: `Suspicious attachment: ${analysis.filename} (${analysis.reasons.join(', ')})`,
              evidence: {
                filename: analysis.filename,
                declaredType: analysis.declaredType,
                actualType: analysis.actualType,
                size: analysis.size,
                reasons: analysis.reasons,
              },
            })
          );
        }

        // Check for file type spoofing
        if (analysis.actualType && analysis.declaredType !== analysis.actualType) {
          signals.push(
            this.createSignal({
              signalType: 'attachment_type_mismatch',
              severity: 'high',
              confidence: 0.9,
              description: `File type spoofing detected: ${analysis.filename} (declared: ${analysis.declaredType}, actual: ${analysis.actualType})`,
              evidence: {
                filename: analysis.filename,
                declaredType: analysis.declaredType,
                actualType: analysis.actualType,
              },
            })
          );
        }

        // Brand/urgency filename heuristic (independent of extension)
        const phishingMatches = this.matchPhishingPatterns(analysis.filename);
        if (phishingMatches.length > 0) {
          signals.push(
            this.createSignal({
              signalType: 'attachment_phishing_pattern',
              severity: 'high',
              confidence: 0.85,
              description: `Attachment filename matches phishing impersonation patterns: ${analysis.filename} (${phishingMatches.map((m) => m.label).join(', ')})`,
              evidence: {
                filename: analysis.filename,
                patterns: phishingMatches.map((m) => m.label),
                matchedTerms: phishingMatches.map((m) => m.matched),
              },
            })
          );
        }
      }
    }

    logger.debug({
      msg: 'Attachment analysis complete',
      signalsGenerated: signals.length,
    });

    return signals;
  }

  /**
   * Match a filename against the phishing-impersonation keyword list. We
   * normalize `_`/`-`/`.` to spaces so `\b` matches across attacker separators,
   * then look for each phrase as a whole word. Brand-bare keywords are only
   * flagged when combined with an action/urgency token in the filename.
   */
  private matchPhishingPatterns(
    filename: string
  ): Array<{ label: string; matched: string }> {
    const matches: Array<{ label: string; matched: string }> = [];
    const normalized = filename
      .toLowerCase()
      .replace(/[_\-.]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const hasActionContext =
      /\b(secure|urgent|confidential|important|alert|notice|invoice|document|file|message|update|verify|login|account)\b/.test(
        normalized
      );

    for (const { label, words } of this.phishingFilenameKeywords) {
      for (const word of words) {
        const pattern = new RegExp(
          `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
          'i'
        );
        if (pattern.test(normalized)) {
          if (label === 'brand bare' && !hasActionContext) {
            continue;
          }
          matches.push({ label, matched: word });
          break; // one match per label is enough
        }
      }
    }
    return matches;
  }

  /**
   * Analyze a single attachment
   */
  private async analyzeAttachment(attachment: {
    filename: string;
    contentType: string;
    size: number;
  }): Promise<FileAnalysisResult> {
    const filename = attachment.filename.toLowerCase();
    const declaredExt = this.getFileExtension(filename);
    const declaredType = attachment.contentType;
    const size = attachment.size;

    const result: FileAnalysisResult = {
      filename: attachment.filename,
      declaredType,
      actualType: null,
      size,
      suspicious: false,
      reasons: [],
      threatLevel: 'clean',
    };

    // Note: File type detection from buffer requires attachment content
    // Current implementation works with metadata only
    // For deep analysis, attachment content would need to be added to Attachment interface
    result.actualType = declaredType; // Use declared type as proxy

    // Check for dangerous file types
    if (this.dangerousExtensions.has(declaredExt)) {
      result.threatLevel = 'dangerous';
      result.suspicious = true;
      result.reasons.push('Executable or script file');
    }

    // Check for macro-enabled office documents
    if (['.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm'].includes(declaredExt)) {
      result.threatLevel = 'dangerous';
      result.suspicious = true;
      result.reasons.push('Macro-enabled office document');
    }

    // Check for suspicious archives
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(declaredExt)) {
      result.threatLevel = 'suspicious';
      result.suspicious = true;
      result.reasons.push('Archive file (may contain hidden threats)');
    }

    // Check for ISO/disk images (often used to bypass security)
    if (['.iso', '.img', '.dmg'].includes(declaredExt)) {
      result.threatLevel = 'suspicious';
      result.suspicious = true;
      result.reasons.push('Disk image file');
    }

    // High-risk suspicious extensions: HTML credential harvesters, SVG-with-JS, OneNote, VHD
    if (this.highRiskSuspiciousExtensions.has(declaredExt)) {
      if (result.threatLevel === 'clean') {
        result.threatLevel = 'suspicious';
      }
      result.suspicious = true;
      result.reasons.push(`High-risk attachment type (${declaredExt})`);
    }

    // Check for double extensions (e.g., invoice.pdf.exe)
    const doubleExt = filename.match(/\.[a-z0-9]+\.[a-z0-9]+$/);
    if (doubleExt) {
      result.threatLevel = 'dangerous';
      result.suspicious = true;
      result.reasons.push('Double file extension (likely malware)');
    }

    // Check for very large files (potential DoS or data exfiltration)
    if (size > 50 * 1024 * 1024) {
      // 50MB
      result.suspicious = true;
      result.reasons.push('Unusually large file');
      if (result.threatLevel === 'clean') {
        result.threatLevel = 'suspicious';
      }
    }

    // Check for file type mismatch
    if (result.actualType && result.actualType !== declaredType) {
      result.suspicious = true;
      result.reasons.push('File type mismatch (spoofing)');
      if (result.threatLevel === 'clean') {
        result.threatLevel = 'suspicious';
      }
    }

    return result;
  }

  /**
   * Extract file extension from filename
   */
  private getFileExtension(filename: string): string {
    const match = filename.match(/(\.[a-z0-9]+)$/i);
    return match ? match[1]?.toLowerCase() || '' : '';
  }
}

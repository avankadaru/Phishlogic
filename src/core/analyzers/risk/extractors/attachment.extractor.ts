/**
 * Attachment Extractor
 *
 * Extracts attachment metadata and checks for suspicious file extensions.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isEmailInput } from '../../../models/input.js';

export interface AttachmentMetadata {
  filename: string;
  mimeType?: string;
  sizeBytes?: number;
  extension: string;
  isSuspicious: boolean;              // Based on extension check
  suspicionReasons: string[];
}

/**
 * Dangerous attachment extensions — executables, scripts, malware droppers.
 * Reason strings include "Executable" so the downstream AttachmentAnalyzer
 * risk-profile path classifies these as `attachment_dangerous_type` (critical).
 */
const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.scr',
  '.bat',
  '.cmd',
  '.com',
  '.pif',
  '.vbs',
  '.js',
  '.jar',
  '.lnk',
  '.hta',
  '.chm',
];

/**
 * Macro-enabled Office documents — also classified dangerous (critical) via the
 * "Macro-enabled" marker substring.
 */
const MACRO_ENABLED_EXTENSIONS = ['.docm', '.xlsm', '.pptm', '.dotm', '.xltm', '.potm'];

/**
 * High-risk suspicious extensions — archives, disk images, HTML/SVG/OneNote.
 * These contribute to Suspicious via weighted calc but do not auto-Malicious.
 */
const HIGH_RISK_SUSPICIOUS_EXTENSIONS = [
  '.zip',
  '.rar',
  '.7z',
  '.iso',
  '.img',
  '.dmg',
  '.vhd',
  '.vhdx',
  '.html',
  '.htm',
  '.xhtml',
  '.svg',
  '.one',
];

/**
 * Explicit double-extension markers (retained for deterministic matching).
 */
const DOUBLE_EXTENSION_MARKERS = ['.pdf.exe', '.doc.exe', '.jpg.exe'];

/**
 * Phishing-impersonation filename keywords — brand/urgency lures in attachment
 * filenames. We normalize `_`/`-`/`.` to spaces before matching so attacker
 * separators (e.g. `invoice_amazon_secure`) don't break word boundaries.
 */
const PHISHING_FILENAME_KEYWORDS: Array<{ label: string; words: string[] }> = [
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
  { label: 'legal threat', words: ['court', 'legal', 'subpoena', 'lawsuit'] },
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
];

function matchFilenameKeywords(
  filename: string
): Array<{ label: string; matched: string }> {
  const normalized = filename
    .toLowerCase()
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const matches: Array<{ label: string; matched: string }> = [];
  for (const { label, words } of PHISHING_FILENAME_KEYWORDS) {
    for (const word of words) {
      const pattern = new RegExp(
        `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
        'i'
      );
      if (pattern.test(normalized)) {
        matches.push({ label, matched: word });
        break;
      }
    }
  }
  return matches;
}

export class AttachmentExtractor extends BaseExtractor<AttachmentMetadata[]> {
  getName(): string {
    return 'AttachmentExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isEmailInput(input);
  }

  protected async extractData(input: NormalizedInput): Promise<AttachmentMetadata[]> {
    if (!isEmailInput(input)) {
      return [];
    }

    const attachments = input.data.parsed.attachments || [];
    const metadata: AttachmentMetadata[] = [];

    for (const attachment of attachments) {
      const filename = attachment.filename;
      const extension = this.extractExtension(filename);
      const suspicionResults = this.checkSuspiciousExtension(filename, extension);

      metadata.push({
        filename,
        mimeType: attachment.contentType,
        sizeBytes: attachment.size,
        extension,
        isSuspicious: suspicionResults.length > 0,
        suspicionReasons: suspicionResults,
      });
    }

    return metadata;
  }

  getEmptyData(): AttachmentMetadata[] {
    return [];
  }

  /**
   * Extract file extension from filename
   */
  private extractExtension(filename: string): string {
    const match = filename.match(/(\.[^.]+)$/);
    return match?.[1] ?? '';
  }

  /**
   * Check if attachment has suspicious extension. Reason strings are categorized
   * so the downstream AttachmentAnalyzer (risk-profile path) can classify them:
   *   - "Executable" / "Macro-enabled" / "Double extension" -> dangerous (critical)
   *   - everything else -> suspicious (high)
   */
  private checkSuspiciousExtension(filename: string, _extension: string): string[] {
    const reasons: string[] = [];
    const lowerFilename = filename.toLowerCase();

    // Dangerous extensions: emit "Executable or script file" so analyzer marks as dangerous
    for (const ext of DANGEROUS_EXTENSIONS) {
      if (lowerFilename.endsWith(ext)) {
        reasons.push(`Executable or script file: ${ext}`);
        break;
      }
    }

    // Macro-enabled Office documents
    for (const ext of MACRO_ENABLED_EXTENSIONS) {
      if (lowerFilename.endsWith(ext)) {
        reasons.push(`Macro-enabled office document: ${ext}`);
        break;
      }
    }

    // High-risk suspicious extensions (archives, disk images, HTML, SVG, OneNote)
    if (reasons.length === 0) {
      for (const ext of HIGH_RISK_SUSPICIOUS_EXTENSIONS) {
        if (lowerFilename.endsWith(ext)) {
          reasons.push(`High-risk attachment type: ${ext}`);
          break;
        }
      }
    }

    // Explicit double-extension markers (e.g., .pdf.exe)
    for (const marker of DOUBLE_EXTENSION_MARKERS) {
      if (lowerFilename.endsWith(marker)) {
        reasons.push(`Double extension detected: ${marker}`);
        break;
      }
    }

    // Generic double-extension pattern terminating with an executable ext
    const doubleExtensionPattern = /\.[a-z]{2,4}\.[a-z]{2,4}$/i;
    if (doubleExtensionPattern.test(lowerFilename)) {
      const parts = lowerFilename.split('.');
      if (parts.length >= 3) {
        const secondToLast = `.${parts[parts.length - 2]}`;
        const last = `.${parts[parts.length - 1]}`;
        const executableExts = ['.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.js', '.hta', '.lnk'];
        if (executableExts.includes(last)) {
          const marker = `Double extension detected: ${secondToLast}${last}`;
          if (!reasons.includes(marker)) {
            reasons.push(marker);
          }
        }
      }
    }

    // Brand/urgency filename impersonation — uses space-normalized matching
    for (const { label, matched } of matchFilenameKeywords(filename)) {
      reasons.push(`Phishing filename pattern (${label}): ${matched}`);
    }

    // Hidden extension (spaces before extension)
    if (filename.includes('  .') || filename.includes('\t.')) {
      reasons.push('Hidden extension with whitespace');
    }

    // Very long filename (possible obfuscation)
    if (filename.length > 100) {
      reasons.push('Unusually long filename');
    }

    return reasons;
  }
}

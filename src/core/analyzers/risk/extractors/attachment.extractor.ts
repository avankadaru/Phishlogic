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
 * Suspicious attachment extensions
 */
const SUSPICIOUS_EXTENSIONS = [
  '.exe',
  '.scr',
  '.bat',
  '.cmd',
  '.com',
  '.pif',
  '.vbs',
  '.js',
  '.jar',
  '.zip',
  '.rar',
  '.7z',
  '.iso',
  '.dmg',
  '.docm', // Macro-enabled Office files
  '.xlsm',
  '.pptm',
  '.pdf.exe', // Double extensions
  '.doc.exe',
  '.jpg.exe',
];

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
   * Check if attachment has suspicious extension
   */
  private checkSuspiciousExtension(filename: string, _extension: string): string[] {
    const reasons: string[] = [];
    const lowerFilename = filename.toLowerCase();

    // Check against known suspicious extensions
    for (const suspiciousExt of SUSPICIOUS_EXTENSIONS) {
      if (lowerFilename.endsWith(suspiciousExt)) {
        reasons.push(`Suspicious extension: ${suspiciousExt}`);
        break; // Only report once
      }
    }

    // Check for double extensions (e.g., .pdf.exe)
    const doubleExtensionPattern = /\.[a-z]{2,4}\.[a-z]{2,4}$/i;
    if (doubleExtensionPattern.test(lowerFilename)) {
      const parts = lowerFilename.split('.');
      if (parts.length >= 3) {
        const secondToLast = `.${parts[parts.length - 2]}`;
        const last = `.${parts[parts.length - 1]}`;

        // Check if the last extension is executable
        const executableExts = ['.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.vbs', '.js'];
        if (executableExts.includes(last)) {
          reasons.push(`Double extension detected: ${secondToLast}${last}`);
        }
      }
    }

    // Check for hidden extension (spaces before extension)
    if (filename.includes('  .') || filename.includes('\t.')) {
      reasons.push('Hidden extension with whitespace');
    }

    // Check for very long filename (possible obfuscation)
    if (filename.length > 100) {
      reasons.push('Unusually long filename');
    }

    return reasons;
  }
}

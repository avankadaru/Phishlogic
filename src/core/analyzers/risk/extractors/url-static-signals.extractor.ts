/**
 * URL-only static signals (scheme, download-like path, query keys, port) without fetching remote content.
 */

import { BaseExtractor } from './base.extractor.js';
import type { NormalizedInput } from '../../../models/input.js';
import { isUrlInput } from '../../../models/input.js';

export interface UrlStaticRiskSignals {
  dangerousScheme: boolean;
  schemeReasons: string[];
  downloadLikePath: boolean;
  downloadExtensionsMatched: string[];
  suspiciousQueryKeys: string[];
  nonDefaultPort: boolean;
  port: number | null;
  encodedPayloadHints: string[];
}

const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:'];

const DOWNLOAD_EXTENSIONS = [
  '.exe',
  '.msi',
  '.dmg',
  '.pkg',
  '.deb',
  '.rpm',
  '.apk',
  '.zip',
  '.rar',
  '.7z',
  '.tar',
  '.gz',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.scr',
  '.com',
  '.dll',
  '.jar',
  '.iso',
];

const SUSPICIOUS_QUERY_KEYS = [
  'download',
  'file',
  'attachment',
  'exec',
  'token',
  'redirect',
  'url',
  'target',
  'next',
  'goto',
];

export class UrlStaticSignalsExtractor extends BaseExtractor<UrlStaticRiskSignals> {
  getName(): string {
    return 'UrlStaticSignalsExtractor';
  }

  isApplicable(input: NormalizedInput): boolean {
    return isUrlInput(input);
  }

  getEmptyData(): UrlStaticRiskSignals {
    return {
      dangerousScheme: false,
      schemeReasons: [],
      downloadLikePath: false,
      downloadExtensionsMatched: [],
      suspiciousQueryKeys: [],
      nonDefaultPort: false,
      port: null,
      encodedPayloadHints: [],
    };
  }

  protected async extractData(input: NormalizedInput): Promise<UrlStaticRiskSignals> {
    if (!isUrlInput(input)) {
      return this.getEmptyData();
    }

    const raw = input.data.url.trim();
    const lower = raw.toLowerCase();
    const empty = this.getEmptyData();

    for (const scheme of DANGEROUS_SCHEMES) {
      if (lower.startsWith(scheme)) {
        return {
          ...empty,
          dangerousScheme: true,
          schemeReasons: [`Blocked scheme: ${scheme}`],
        };
      }
    }

    let urlObj: URL;
    try {
      urlObj = new URL(raw);
    } catch {
      return {
        ...empty,
        dangerousScheme: true,
        schemeReasons: ['Unparseable URL'],
      };
    }

    const schemeReasons: string[] = [];
    const protocol = urlObj.protocol.replace(':', '').toLowerCase();
    if (protocol && !['http', 'https'].includes(protocol)) {
      schemeReasons.push(`Non-http(s) protocol: ${protocol}`);
    }

    const pathLower = urlObj.pathname.toLowerCase();
    const downloadExtensionsMatched = matchDownloadExtensionsInPath(pathLower);

    const suspiciousQueryKeys: string[] = [];
    for (const key of urlObj.searchParams.keys()) {
      const k = key.toLowerCase();
      if (SUSPICIOUS_QUERY_KEYS.some((s) => k.includes(s))) {
        suspiciousQueryKeys.push(key);
      }
    }

    const defaultPort = protocol === 'https' ? 443 : protocol === 'http' ? 80 : null;
    const port = urlObj.port ? parseInt(urlObj.port, 10) : null;
    const nonDefaultPort =
      port !== null &&
      port > 0 &&
      defaultPort !== null &&
      port !== defaultPort &&
      !((protocol === 'http' && port === 80) || (protocol === 'https' && port === 443));

    const encodedPayloadHints: string[] = [];
    if (/%[0-9a-f]{2}/i.test(raw) && raw.length > 200) {
      encodedPayloadHints.push('Long URL with percent-encoding');
    }
    if (raw.includes('%00') || raw.includes('\0')) {
      encodedPayloadHints.push('Null byte in URL');
    }

    return {
      dangerousScheme: schemeReasons.length > 0 && protocol !== 'http' && protocol !== 'https',
      schemeReasons,
      downloadLikePath: downloadExtensionsMatched.length > 0,
      downloadExtensionsMatched,
      suspiciousQueryKeys,
      nonDefaultPort,
      port: port ?? null,
      encodedPayloadHints,
    };
  }
}

function matchDownloadExtensionsInPath(pathLower: string): string[] {
  const matched: string[] = [];
  for (const ext of DOWNLOAD_EXTENSIONS) {
    if (pathLower.endsWith(ext) || pathLower.includes(`${ext}?`) || pathLower.includes(`${ext}/`)) {
      matched.push(ext);
    }
  }
  return matched;
}

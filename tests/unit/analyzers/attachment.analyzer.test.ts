/**
 * Attachment Analyzer tests — verify dangerous-extension coverage, high-risk
 * suspicious extensions, and phishing filename pattern detection.
 */

import { AttachmentAnalyzer } from '../../../src/core/analyzers/attachment/attachment.analyzer.js';
import type { NormalizedInput } from '../../../src/core/models/input.js';
import type { Attachment } from '../../../src/core/models/input.js';

function makeEmailInput(attachments: Attachment[]): NormalizedInput {
  return {
    type: 'email',
    id: 'test-id',
    timestamp: new Date(),
    data: {
      raw: '',
      parsed: {
        headers: new Map(),
        from: { address: 'attacker@example.com' },
        to: [{ address: 'victim@example.com' }],
        subject: 'Test',
        body: { text: 'body' },
        attachments,
      },
    },
  };
}

describe('AttachmentAnalyzer - phishing pattern coverage', () => {
  let analyzer: AttachmentAnalyzer;

  beforeEach(() => {
    analyzer = new AttachmentAnalyzer();
  });

  it('emits attachment_dangerous_type for .lnk malware-dropper files', async () => {
    const input = makeEmailInput([
      { filename: 'Order_details.lnk', contentType: 'application/octet-stream', size: 1 },
    ]);

    const signals = await analyzer.analyze(input);

    const dangerous = signals.find((s) => s.signalType === 'attachment_dangerous_type');
    expect(dangerous).toBeDefined();
    expect(dangerous?.severity).toBe('critical');
  });

  it('emits attachment_dangerous_type for .hta files', async () => {
    const input = makeEmailInput([
      { filename: 'invoice.hta', contentType: 'application/octet-stream', size: 1 },
    ]);
    const signals = await analyzer.analyze(input);
    const dangerous = signals.find((s) => s.signalType === 'attachment_dangerous_type');
    expect(dangerous).toBeDefined();
    expect(dangerous?.severity).toBe('critical');
  });

  it('emits attachment_suspicious_type for .html credential-harvester attachments', async () => {
    const input = makeEmailInput([
      { filename: 'account_update.html', contentType: 'text/html', size: 1 },
    ]);
    const signals = await analyzer.analyze(input);
    const suspicious = signals.find((s) => s.signalType === 'attachment_suspicious_type');
    expect(suspicious).toBeDefined();
    expect(suspicious?.severity).toBe('high');
    // Must NOT auto-escalate to dangerous
    expect(signals.some((s) => s.signalType === 'attachment_dangerous_type')).toBe(false);
  });

  it('emits attachment_phishing_pattern for brand-impersonation filenames', async () => {
    const input = makeEmailInput([
      { filename: 'invoice_amazon_secure.html', contentType: 'text/html', size: 1 },
    ]);

    const signals = await analyzer.analyze(input);

    const phishing = signals.find((s) => s.signalType === 'attachment_phishing_pattern');
    expect(phishing).toBeDefined();
    expect(phishing?.severity).toBe('high');
    // HTML extension should also produce an attachment_suspicious_type signal
    expect(signals.some((s) => s.signalType === 'attachment_suspicious_type')).toBe(true);
  });

  it('emits BOTH dangerous + phishing pattern signals for court_document_2026.pdf.exe', async () => {
    const input = makeEmailInput([
      {
        filename: 'court_document_2026.pdf.exe',
        contentType: 'application/octet-stream',
        size: 1,
      },
    ]);

    const signals = await analyzer.analyze(input);

    expect(signals.find((s) => s.signalType === 'attachment_dangerous_type')).toBeDefined();
    expect(signals.find((s) => s.signalType === 'attachment_phishing_pattern')).toBeDefined();
  });

  it('returns zero signals when there are no attachments', async () => {
    const input = makeEmailInput([]);
    const signals = await analyzer.analyze(input);
    expect(signals).toHaveLength(0);
  });
});

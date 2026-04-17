/**
 * Simulated authentication override for test emails.
 *
 * Real-world attackers rarely produce SPF/DKIM/DMARC=fail — modern bulk
 * senders (and most attackers) inject Authentication-Results=pass lines. Our
 * AI prompt explicitly states that auth failure alone must not escalate to
 * Malicious. So by default every scenario sends auth=pass and relies on
 * content/URL/domain signals (typosquatting, urgency, credential forms,
 * suspicious attachments, etc.) to drive verdicts — exactly how our real
 * analyzers see production traffic.
 *
 * One dedicated scenario uses 'fail' to verify the auth-only path
 * consistently yields Suspicious (never Malicious).
 */
export type AuthOverride = 'pass' | 'softfail' | 'fail' | 'none';

export interface ScenarioAttachment {
  filename: string;
  /** Defaults to 'application/octet-stream' if omitted. */
  contentType?: string;
}

export interface EmailScenario {
  id: string;
  label: string;
  category: 'safe' | 'suspicious' | 'malicious';
  description: string;
  /** Defaults to 'pass' if omitted. */
  authOverride?: AuthOverride;
  data: {
    from: string;
    to: string;
    subject: string;
    body: string;
    attachments?: ScenarioAttachment[];
  };
}

export function buildAuthenticationResultsHeader(
  override: AuthOverride,
  fromDomain: string
): string | null {
  if (override === 'none') return null;
  const mx = 'mx.example.com';
  switch (override) {
    case 'pass':
      return `Authentication-Results: ${mx}; spf=pass smtp.mailfrom=${fromDomain}; dkim=pass header.d=${fromDomain}; dmarc=pass action=none header.from=${fromDomain}`;
    case 'softfail':
      return `Authentication-Results: ${mx}; spf=softfail smtp.mailfrom=${fromDomain}; dkim=pass header.d=${fromDomain}; dmarc=pass action=none header.from=${fromDomain}`;
    case 'fail':
      return `Authentication-Results: ${mx}; spf=fail smtp.mailfrom=${fromDomain}; dkim=fail header.d=${fromDomain}; dmarc=fail action=quarantine header.from=${fromDomain}`;
  }
}

export function extractDomainFromAddress(from: string): string {
  const match = from.match(/@([^>\s]+)/);
  return match?.[1] ?? 'example.com';
}

export function buildRawEmail(
  data: EmailScenario['data'],
  override: AuthOverride
): string {
  const domain = extractDomainFromAddress(data.from);
  const authHeader = buildAuthenticationResultsHeader(override, domain);
  const headerLines: string[] = [];
  if (authHeader) headerLines.push(authHeader);
  headerLines.push(`From: ${data.from}`);
  headerLines.push(`To: ${data.to}`);
  headerLines.push(`Subject: ${data.subject}`);
  headerLines.push('MIME-Version: 1.0');

  const attachments = data.attachments ?? [];

  if (attachments.length === 0) {
    headerLines.push('Content-Type: text/plain; charset=UTF-8');
    headerLines.push('');
    headerLines.push(data.body);
    return headerLines.join('\n');
  }

  const boundary = `----=_PhishLogicTest_${Date.now()}`;
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  headerLines.push('');

  const parts: string[] = [];

  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/plain; charset=UTF-8');
  parts.push('Content-Transfer-Encoding: 7bit');
  parts.push('');
  parts.push(data.body);

  for (const att of attachments) {
    const contentType = att.contentType ?? 'application/octet-stream';
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${contentType}; name="${att.filename}"`);
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    parts.push('Content-Transfer-Encoding: base64');
    parts.push('');
    // 1-byte stub; AttachmentExtractor/AttachmentAnalyzer key off filename extension.
    parts.push('AA==');
  }

  parts.push(`--${boundary}--`);

  return [...headerLines, ...parts].join('\n');
}

export const emailScenarios: EmailScenario[] = [
  // Safe Emails
  {
    id: 'safe-amazon',
    label: 'Legitimate Amazon',
    category: 'safe',
    description: 'Real Amazon shipping confirmation with valid SPF/DKIM',
    data: {
      from: 'auto-confirm@amazon.com',
      to: 'customer@example.com',
      subject: 'Your Amazon.com order #123-4567890 has shipped',
      body: 'Hello,\n\nYour order has been shipped and should arrive by Friday, March 15.\n\nTracking: 1Z999AA10123456784\n\nThank you for shopping with Amazon!\n\nAmazon.com\nhttps://www.amazon.com/your-orders'
    }
  },
  {
    id: 'safe-paypal',
    label: 'Legitimate PayPal',
    category: 'safe',
    description: 'Real PayPal payment confirmation',
    data: {
      from: 'service@paypal.com',
      to: 'user@example.com',
      subject: 'You sent a payment of $25.00 USD to John Doe',
      body: 'Hello,\n\nYou sent a payment of $25.00 USD to John Doe (johndoe@example.com).\n\nTransaction ID: 1AB23456CD789012E\nDate: March 9, 2026\n\nView transaction details:\nhttps://www.paypal.com/activity\n\nPayPal'
    }
  },
  {
    id: 'safe-bank',
    label: 'Legitimate Bank',
    category: 'safe',
    description: 'Real bank statement notification',
    data: {
      from: 'notifications@bankofamerica.com',
      to: 'customer@example.com',
      subject: 'Your Bank of America statement is ready',
      body: 'Dear Customer,\n\nYour monthly statement for account ending in 1234 is now available.\n\nTo view your statement, please log in to Online Banking at:\nhttps://www.bankofamerica.com\n\nBank of America'
    }
  },
  {
    id: 'safe-github',
    label: 'Legitimate GitHub',
    category: 'safe',
    description: 'Real GitHub pull request notification',
    data: {
      from: 'notifications@github.com',
      to: 'developer@example.com',
      subject: '[PhishLogic] Pull request #42 opened',
      body: 'View pull request:\nhttps://github.com/user/PhishLogic/pull/42\n\nAdd email testing screen\n\n@user opened this pull request and requested your review.\n\nReply to this email directly or view it on GitHub.'
    }
  },

  // Suspicious Emails
  {
    id: 'suspicious-grammar',
    label: 'Poor Grammar',
    category: 'suspicious',
    description: 'Grammar errors and unusual phrasing',
    data: {
      from: 'support@bank-secure-verify.com',
      to: 'user@example.com',
      subject: 'Important Update Required',
      body: 'Dear valued customer,\n\nWe needs you to update your informations for security purpose. Please login to your account and complete verification process within 48 hours.\n\nYour account may be limited if you not complete this action.\n\nThank you for your cooperation.\n\nBank Security Team'
    }
  },
  {
    id: 'suspicious-hyphens',
    label: 'Many Hyphens',
    category: 'suspicious',
    description: 'Unusual number of hyphens in domain',
    data: {
      from: 'noreply@account-verify-security-update.com',
      to: 'user@example.com',
      subject: 'Security Update Required',
      body: 'Dear User,\n\nA security update is required for your account. Please click the link below to complete the verification.\n\nhttp://account-verify-security-update.com/login\n\nThank you,\nSecurity Team'
    }
  },
  {
    id: 'suspicious-prize',
    label: 'Prize Scam',
    category: 'suspicious',
    description: 'Fake prize notification, too good to be true',
    data: {
      from: 'winner@prize-notification.net',
      to: 'lucky@example.com',
      subject: 'CONGRATULATIONS! You Won $1,000,000',
      body: 'CONGRATULATIONS!!!\n\nYou have been selected as the winner of our $1,000,000 Grand Prize!\n\nTo claim your prize, click here and enter your banking information:\nhttp://claim-prize-now.net/winner\n\nYou must claim within 24 hours or the prize will be forfeited to another winner.\n\nPrize Commission International'
    }
  },
  {
    id: 'suspicious-auth-fail',
    label: 'Auth Fail (SPF/DKIM/DMARC)',
    category: 'suspicious',
    description:
      'Benign-looking content but SPF/DKIM/DMARC all fail. Should yield Suspicious — NEVER Malicious — per auth_guidance policy.',
    authOverride: 'fail',
    data: {
      from: 'billing@acme.com',
      to: 'customer@example.com',
      subject: 'Your monthly Acme statement is ready',
      body: 'Hello,\n\nYour monthly Acme statement is now available in your account dashboard.\n\nLog in at https://www.acme.com/account to view details.\n\nThanks,\nAcme Billing'
    }
  },

  // Malicious Emails
  {
    id: 'malicious-generic',
    label: 'Generic Greeting',
    category: 'malicious',
    description:
      'Generic greeting with credential-harvesting link on look-alike support domain — classic phishing pattern',
    data: {
      from: 'support@customerservice.info',
      to: 'user@example.com',
      subject: 'Your account needs attention',
      body: 'Dear Customer,\n\nWe have detected suspicious activity on your account. Please verify your information by clicking the link below.\n\nhttp://verify-info.com\n\nCustomer Support Team'
    }
  },
  {
    id: 'malicious-paypal',
    label: 'PayPal Phishing',
    category: 'malicious',
    description: 'Typosquatting domain (paypa1.com) with urgency',
    data: {
      from: 'security@paypa1.com',
      to: 'victim@example.com',
      subject: 'URGENT: Verify your PayPal account NOW',
      body: 'Dear valued customer,\n\nYour account will be locked in 24 hours due to suspicious activity. Click here to verify immediately:\n\nhttp://paypa1-verify.com/login\n\nEnter your email and password to restore full access.\n\nFailure to verify will result in permanent account suspension.'
    }
  },
  {
    id: 'malicious-urgency',
    label: 'Urgency Tactics',
    category: 'malicious',
    description:
      'Account-closure urgency with credential-harvesting link — classic phishing pattern',
    data: {
      from: 'security@account-services.net',
      to: 'user@example.com',
      subject: 'URGENT: Account will be closed in 24 hours',
      body: 'IMMEDIATE ACTION REQUIRED\n\nYour account shows unusual activity and will be permanently closed in 24 hours unless you verify your identity.\n\nClick here to verify now:\nhttp://verify-account-now.com/login\n\nDo not ignore this message or you will lose access to your account forever.'
    }
  },
  {
    id: 'malicious-attachment',
    label: 'Malicious Attachment',
    category: 'malicious',
    description: 'Threatens with attachment, creates urgency',
    data: {
      from: 'legal@law-firm-notice.com',
      to: 'user@example.com',
      subject: 'LEGAL NOTICE - Court Document Attached',
      body: 'IMPORTANT LEGAL NOTICE\n\nYou have been named in a lawsuit. Please review the attached court document immediately.\n\nATTACHMENT: court_document_2026.pdf.exe\n\nFailure to respond within 48 hours may result in default judgment against you.\n\nLaw Firm LLC',
      attachments: [
        { filename: 'court_document_2026.pdf.exe', contentType: 'application/octet-stream' },
      ],
    }
  },
  {
    id: 'malicious-google',
    label: 'Google Typosquatting',
    category: 'malicious',
    description: 'Typosquatting (g00gle.com) credential harvesting',
    data: {
      from: 'no-reply@g00gle.com',
      to: 'user@example.com',
      subject: 'Security Alert: New sign-in from unknown device',
      body: 'Google detected a new sign-in to your account from an unknown device.\n\nLocation: Russia\nDevice: Windows PC\nTime: March 9, 2026 at 3:42 AM\n\nIf this was not you, secure your account immediately:\nhttp://g00gle.com/security/signin\n\nEnter your email and password to review this activity.\n\nGoogle Security Team'
    }
  },
];

export interface UrlScenario {
  id: string;
  label: string;
  category: 'safe' | 'suspicious' | 'malicious';
  description: string;
  data: {
    url: string;
  };
  /**
   * Optional narrative hint - which signals the native engine is expected to
   * emit for this scenario. Not enforced; helps testers see why a URL lands
   * in its category.
   */
  expectedSignals?: string[];
}

/**
 * Curated URL test scenarios that mirror what the native PhishLogic engine
 * actually produces today (Native, Hybrid, AI modes). Scenarios that the
 * native engine cannot reliably classify (e.g. live URL shorteners, RFC1918
 * IPs that get explicitly demoted, "many subdomains" with no detector) have
 * been removed so each bucket below stays deterministic.
 *
 * Buckets: 6 Safe / 6 Suspicious / 6 Malicious.
 */
export const urlScenarios: UrlScenario[] = [
  // ---------------------------------------------------------------------------
  // Safe (bare known brands or KNOWN_AUTH_ORIGINS with expected paths)
  // ---------------------------------------------------------------------------
  {
    id: 'safe-google',
    label: 'Google',
    category: 'safe',
    description: 'Bare known brand (Tranco top-1M); known-host floor pins to Safe.',
    data: { url: 'https://www.google.com' },
    expectedSignals: ['domain_reputation_good']
  },
  {
    id: 'safe-amazon',
    label: 'Amazon',
    category: 'safe',
    description: 'Bare known brand (Tranco top-1M); known-host floor pins to Safe.',
    data: { url: 'https://www.amazon.com' },
    expectedSignals: ['domain_reputation_good']
  },
  {
    id: 'safe-github-repo',
    label: 'GitHub Repo',
    category: 'safe',
    description: 'KNOWN_AUTH_ORIGINS host; path is a normal repo URL.',
    data: { url: 'https://github.com/anthropics/claude-code' },
    expectedSignals: ['domain_reputation_good']
  },
  {
    id: 'safe-microsoft-login',
    label: 'Microsoft Login',
    category: 'safe',
    description: 'KNOWN_AUTH_ORIGINS host; legitimate auth surface.',
    data: { url: 'https://login.microsoftonline.com' },
    expectedSignals: ['domain_reputation_good']
  },
  {
    id: 'safe-google-accounts-signin',
    label: 'Google Accounts Sign-in',
    category: 'safe',
    description: 'KNOWN_AUTH_ORIGINS; FormUrlAnalyzer suppresses credential_form noise.',
    data: { url: 'https://accounts.google.com/signin' },
    expectedSignals: ['domain_reputation_good', 'form_detected (suppressed)']
  },
  {
    id: 'safe-whitelisted-example',
    label: 'Whitelisted URL',
    category: 'safe',
    description: 'Demonstrates the URL whitelist short-circuit (analysis bypassed).',
    data: { url: 'https://www.example.com/' },
    expectedSignals: ['(whitelist short-circuit, no analyzers run)']
  },

  // ---------------------------------------------------------------------------
  // Suspicious (heuristic medium signals, no critical NEVER_DOWNGRADE)
  // ---------------------------------------------------------------------------
  {
    id: 'suspicious-hyphens',
    label: 'Many Hyphens',
    category: 'suspicious',
    description: 'Hyphen-stuffed hostname (≥4 hyphens) triggers suspicious_hostname_structure (medium).',
    data: { url: 'https://account-verify-security-update-now.com' },
    expectedSignals: ['suspicious_hostname_structure']
  },
  {
    id: 'suspicious-tld',
    label: 'Unusual TLD + Port',
    category: 'suspicious',
    description: 'Suspicious TLD on a non-standard port triggers suspicious_hostname_structure (medium).',
    data: { url: 'https://secure-banking.xyz:8443/login' },
    expectedSignals: ['suspicious_hostname_structure', 'suspicious_tld']
  },
  {
    id: 'suspicious-port',
    label: 'Non-Standard Port',
    category: 'suspicious',
    description: 'Non-default HTTPS port + hostname structure heuristic.',
    data: { url: 'https://login-verify.com:8443/account' },
    expectedSignals: ['nonDefaultPort', 'suspicious_hostname_structure']
  },
  {
    id: 'suspicious-http',
    label: 'HTTP (No HTTPS)',
    category: 'suspicious',
    description: 'Cleartext HTTP triggers https_missing (medium) on a non-Tranco host.',
    data: { url: 'http://acme-corp.net/about' },
    expectedSignals: ['https_missing']
  },
  {
    id: 'suspicious-brand-lookalike-paypal',
    label: 'PayPal Lookalike',
    category: 'suspicious',
    description: 'Domain label "paypal-verify" triggers brand_lookalike_domain (high) via Jaro-Winkler.',
    data: { url: 'https://paypal-verify.com/secure-login' },
    expectedSignals: ['brand_lookalike_domain']
  },
  {
    id: 'suspicious-amazon-lookalike',
    label: 'Amazon Lookalike',
    category: 'suspicious',
    description: 'Domain label "amazon-login-verify" triggers brand_lookalike_domain (high) via Jaro-Winkler.',
    data: { url: 'https://amazon-login-verify.com' },
    expectedSignals: ['brand_lookalike_domain']
  },

  // ---------------------------------------------------------------------------
  // Malicious (typosquat / IDN / public IP credential page)
  // ---------------------------------------------------------------------------
  {
    id: 'malicious-paypal-typo',
    label: 'PayPal Typosquat',
    category: 'malicious',
    description: 'paypa1.com (1 instead of l) is in BRAND_TYPOSQUAT_HOSTNAMES.',
    data: { url: 'https://www.paypa1.com/webapps/mpp/home' },
    expectedSignals: ['typosquat_hostname (critical)']
  },
  {
    id: 'malicious-google-typo',
    label: 'Google Typosquat',
    category: 'malicious',
    description: 'g00gle.com is in the typosquat blocklist.',
    data: { url: 'https://www.g00gle.com' },
    expectedSignals: ['typosquat_hostname (critical)']
  },
  {
    id: 'malicious-amazon-typo',
    label: 'Amazon Typosquat',
    category: 'malicious',
    description: 'amaz0n.com is in the typosquat blocklist.',
    data: { url: 'https://www.amaz0n.com' },
    expectedSignals: ['typosquat_hostname (critical)']
  },
  {
    id: 'malicious-microsoft-idn',
    label: 'Microsoft IDN Lookalike',
    category: 'malicious',
    description: 'rnicrosoft.com (rn looks like m) is in the typosquat blocklist.',
    data: { url: 'https://www.rnicrosoft.com' },
    expectedSignals: ['typosquat_hostname (critical)']
  },
  {
    id: 'malicious-apple-idn',
    label: 'Apple Punycode',
    category: 'malicious',
    description: 'αpple.com (Greek alpha) is escalated to critical by UrlEntropyUrlAnalyzer.',
    data: { url: 'https://www.xn--pple-43d.com' },
    expectedSignals: ['typosquat_hostname (critical)', 'idn_lookalike']
  },
  {
    id: 'malicious-public-ip-credential',
    label: 'Public IP Credential Page',
    category: 'malicious',
    description: 'Public IP host serving a credential-style path (no RFC1918 demotion).',
    data: { url: 'http://45.33.32.156/login' },
    expectedSignals: ['numeric_ip_hostname (critical)', 'https_missing']
  },
];

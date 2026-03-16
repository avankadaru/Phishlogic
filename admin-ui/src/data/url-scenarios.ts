export interface UrlScenario {
  id: string;
  label: string;
  category: 'safe' | 'suspicious' | 'malicious';
  description: string;
  data: {
    url: string;
  };
}

export const urlScenarios: UrlScenario[] = [
  // Safe URLs
  {
    id: 'safe-google',
    label: 'Google',
    category: 'safe',
    description: 'Legitimate Google homepage',
    data: { url: 'https://www.google.com' }
  },
  {
    id: 'safe-amazon',
    label: 'Amazon',
    category: 'safe',
    description: 'Legitimate Amazon website',
    data: { url: 'https://www.amazon.com' }
  },
  {
    id: 'safe-github',
    label: 'GitHub',
    category: 'safe',
    description: 'Legitimate GitHub repository',
    data: { url: 'https://github.com/anthropics/claude-code' }
  },
  {
    id: 'safe-microsoft',
    label: 'Microsoft',
    category: 'safe',
    description: 'Legitimate Microsoft login page',
    data: { url: 'https://login.microsoftonline.com' }
  },

  // Suspicious URLs
  {
    id: 'suspicious-hyphens',
    label: 'Many Hyphens',
    category: 'suspicious',
    description: 'Unusual number of hyphens in domain',
    data: { url: 'https://account-verify-security-update.com' }
  },
  {
    id: 'suspicious-subdomain',
    label: 'Subdomain Overload',
    category: 'suspicious',
    description: 'Excessive subdomains',
    data: { url: 'https://verify.account.security.login.update.com' }
  },
  {
    id: 'suspicious-tld',
    label: 'Unusual TLD',
    category: 'suspicious',
    description: 'Uncommon top-level domain',
    data: { url: 'https://secure-banking.xyz' }
  },
  {
    id: 'suspicious-port',
    label: 'Non-Standard Port',
    category: 'suspicious',
    description: 'HTTPS on unusual port',
    data: { url: 'https://login-verify.com:8443/account' }
  },

  // Malicious URLs
  {
    id: 'malicious-paypal-typo',
    label: 'PayPal Typosquatting',
    category: 'malicious',
    description: '1 instead of l in paypal',
    data: { url: 'https://www.paypa1.com/webapps/mpp/home' }
  },
  {
    id: 'malicious-google-typo',
    label: 'Google Typosquatting',
    category: 'malicious',
    description: '0 instead of o in google',
    data: { url: 'https://www.g00gle.com' }
  },
  {
    id: 'malicious-apple-typo',
    label: 'Apple Typosquatting',
    category: 'malicious',
    description: 'Homoglyph attack with similar characters',
    data: { url: 'https://www.αpple.com' }
  },
  {
    id: 'malicious-ip-address',
    label: 'IP Address',
    category: 'malicious',
    description: 'Direct IP instead of domain name',
    data: { url: 'http://192.168.1.100/login' }
  },
  {
    id: 'malicious-shortened',
    label: 'Bit.ly Shortened',
    category: 'malicious',
    description: 'URL shortener hiding destination',
    data: { url: 'https://bit.ly/3xYz9Ab' }
  },
  {
    id: 'malicious-amazon-fake',
    label: 'Amazon Fake Domain',
    category: 'malicious',
    description: 'Amazon-like domain with extra words',
    data: { url: 'https://amazon-login-verify.com' }
  },
  {
    id: 'malicious-paypal-subdomain',
    label: 'PayPal Subdomain Trick',
    category: 'malicious',
    description: 'Legitimate name in subdomain to trick users',
    data: { url: 'https://paypal.secure-verify-account.com' }
  },
  {
    id: 'malicious-unicode',
    label: 'Unicode IDN Attack',
    category: 'malicious',
    description: 'Uses unicode characters to mimic legitimate site',
    data: { url: 'https://www.rnicrosoft.com' }
  },
];

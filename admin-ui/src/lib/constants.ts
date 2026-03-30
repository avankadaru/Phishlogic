/**
 * Standard JSON output format for AI responses
 * Ensures consistent parseable structure
 * This will be enforced at the UI level when creating/editing templates
 *
 * NOTE: This is duplicated from backend (src/core/services/ai-execution.service.ts)
 * to avoid cross-boundary imports (Vite frontend cannot import Node.js backend code)
 */
export const STANDARD_JSON_OUTPUT_FORMAT = `

═══════════════════════════════════════════════════════════
CRITICAL: OUTPUT FORMAT REQUIREMENT
═══════════════════════════════════════════════════════════

You MUST respond with ONLY a valid JSON array. No text before or after.

Required JSON structure:
[
  {
    "signalType": "suspicious_sender|phishing_keywords|suspicious_url|typosquatting|credential_harvesting|urgent_language|brand_impersonation|attachment_malicious|qrcode_suspicious|...",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "Plain English explanation of this signal"
  },
  {
    "signalType": "final_verdict",
    "severity": "low|medium|high|critical",
    "confidence": 0.0-1.0,
    "description": "VERDICT: [Safe|Suspicious|Malicious]\\n\\nTHREAT SUMMARY:\\n[2-3 sentences]\\n\\nPRIMARY INDICATORS:\\n- Indicator 1\\n- Indicator 2\\n\\nRECOMMENDED ACTION:\\n[Specific action]"
  }
]

IMPORTANT:
- Response must START with [ and END with ]
- All strings must be properly escaped
- Use \\n for line breaks in descriptions
- Confidence must be between 0.0 and 1.0
- Include at least one signal (can be just final_verdict if clean)
- Last signal should always be "final_verdict" with comprehensive description
`;

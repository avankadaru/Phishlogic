/**
 * Threat Metadata Registry
 *
 * Provides comprehensive metadata for JavaScript threat patterns detected during analysis.
 * Includes display names, risk levels, explanations, and risk reasons for each threat type.
 *
 * Follows SOLID principles:
 * - SRP: Single responsibility = Provide threat metadata
 * - OCP: Open for extension (add new threats), closed for modification
 * - LSP: All threats implement ThreatMetadata interface
 */

/**
 * Metadata for a single threat pattern
 */
export interface ThreatMetadata {
  /** Pattern identifier (e.g., "eval_execution") */
  patternId: string;

  /** Human-readable display name for UI */
  displayName: string;

  /** Risk classification */
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'benign';

  /** Plain English explanation of what this threat does */
  explanation: string;

  /** Why this is dangerous (or benign) */
  riskReason: string;

  /** Category for grouping threats */
  category: 'code_execution' | 'dom_manipulation' | 'network_activity' | 'obfuscation';

  /** Optional example code snippet for documentation */
  exampleCode?: string;
}

/**
 * Enriched threat pattern with metadata for UI display
 */
export interface EnrichedThreatPattern {
  patternId: string;
  displayName: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'benign';
  explanation: string;
  riskReason: string;
  category: string;
  detectedIn?: 'inline' | 'external' | 'runtime';
  detail?: string;
  timestamp?: number;
}

/**
 * Complete threat pattern registry with all 14 defined threats
 *
 * Threat levels:
 * - CRITICAL: 3 patterns (eval, Function constructor, runtime script injection)
 * - HIGH: 3 patterns (document.write, innerHTML, dynamic script injection)
 * - MEDIUM: 5 patterns (obfuscation and delayed execution)
 * - BENIGN: 4 patterns (normal HTTP/network activity)
 */
export const THREAT_METADATA_REGISTRY: Record<string, ThreatMetadata> = {
  // ===================
  // CRITICAL THREATS (3 patterns)
  // ===================

  eval_execution: {
    patternId: 'eval_execution',
    displayName: 'Dynamic Code Execution (eval)',
    riskLevel: 'critical',
    explanation: 'Allows execution of arbitrary JavaScript code from strings at runtime',
    riskReason: 'Attackers can inject malicious code that bypasses static analysis and executes with full page privileges',
    category: 'code_execution',
    exampleCode: 'eval("malicious code here")'
  },

  function_constructor: {
    patternId: 'function_constructor',
    displayName: 'Function Constructor Abuse',
    riskLevel: 'critical',
    explanation: 'Creates executable functions from strings at runtime, similar to eval',
    riskReason: 'Bypasses Content Security Policy (CSP) and enables code injection attacks',
    category: 'code_execution',
    exampleCode: 'new Function("code")()'
  },

  runtime_script_injection: {
    patternId: 'runtime_script_injection',
    displayName: 'Runtime Script Injection',
    riskLevel: 'critical',
    explanation: 'Dynamically creates and injects <script> tags into the page',
    riskReason: 'Allows loading and executing external malicious scripts after page load',
    category: 'dom_manipulation',
    exampleCode: 'document.body.appendChild(script)'
  },

  // ===================
  // HIGH-SEVERITY THREATS (3 patterns)
  // ===================

  document_write: {
    patternId: 'document_write',
    displayName: 'Document.write Manipulation',
    riskLevel: 'high',
    explanation: 'Directly writes content to the document, potentially overwriting existing content',
    riskReason: 'Can inject malicious HTML/scripts and is often used in drive-by attacks',
    category: 'dom_manipulation',
    exampleCode: 'document.write("<script>...")'
  },

  innerHTML_injection: {
    patternId: 'innerHTML_injection',
    displayName: 'innerHTML Injection',
    riskLevel: 'high',
    explanation: 'Directly sets HTML content, which can execute embedded scripts',
    riskReason: 'Classic XSS vector that can inject malicious scripts and steal credentials',
    category: 'dom_manipulation',
    exampleCode: 'element.innerHTML = userInput'
  },

  dynamic_script_injection: {
    patternId: 'dynamic_script_injection',
    displayName: 'Dynamic Script Tag Creation',
    riskLevel: 'high',
    explanation: 'Creates <script> elements programmatically to load external code',
    riskReason: 'Used to load malicious payloads from attacker-controlled domains',
    category: 'dom_manipulation',
    exampleCode: 'document.createElement("script")'
  },

  // ===================
  // MEDIUM-SEVERITY THREATS (5 patterns)
  // ===================

  string_settimeout_execution: {
    patternId: 'string_settimeout_execution',
    displayName: 'String-based setTimeout',
    riskLevel: 'medium',
    explanation: 'Uses setTimeout with string argument (acts like eval with delay)',
    riskReason: 'Delayed code execution can evade initial security scans',
    category: 'code_execution',
    exampleCode: 'setTimeout("malicious()", 1000)'
  },

  string_setinterval_execution: {
    patternId: 'string_setinterval_execution',
    displayName: 'String-based setInterval',
    riskLevel: 'medium',
    explanation: 'Uses setInterval with string argument (repeated eval)',
    riskReason: 'Enables persistent malicious code execution at intervals',
    category: 'code_execution',
    exampleCode: 'setInterval("code", 1000)'
  },

  base64_decode: {
    patternId: 'base64_decode',
    displayName: 'Base64 Decoding (atob)',
    riskLevel: 'medium',
    explanation: 'Decodes base64-encoded strings, often used for code obfuscation',
    riskReason: 'Hides malicious payload from static analysis and human review',
    category: 'obfuscation',
    exampleCode: 'atob("ZXZhbCgiY29kZSIp")'
  },

  unescape_obfuscation: {
    patternId: 'unescape_obfuscation',
    displayName: 'URL Unescape Obfuscation',
    riskLevel: 'medium',
    explanation: 'Decodes URL-encoded strings, used to hide malicious code',
    riskReason: 'Obfuscates attack patterns from detection systems',
    category: 'obfuscation',
    exampleCode: 'unescape("%65%76%61%6C")'
  },

  base64_obfuscation: {
    patternId: 'base64_obfuscation',
    displayName: 'Base64 Obfuscation Pattern',
    riskLevel: 'medium',
    explanation: 'Uses base64 encoding to hide code intent',
    riskReason: 'Common technique in exploit kits and malware droppers',
    category: 'obfuscation',
    exampleCode: 'btoa("malicious")'
  },

  // ===================
  // BENIGN PATTERNS (4 patterns - informational only)
  // ===================

  fetch_network_request: {
    patternId: 'fetch_network_request',
    displayName: 'Fetch API Network Request',
    riskLevel: 'benign',
    explanation: 'Modern API for making HTTP requests',
    riskReason: 'Standard web functionality - not inherently dangerous',
    category: 'network_activity',
    exampleCode: 'fetch("/api/data")'
  },

  xhr_network_request: {
    patternId: 'xhr_network_request',
    displayName: 'XMLHttpRequest (AJAX)',
    riskLevel: 'benign',
    explanation: 'Traditional method for making asynchronous HTTP requests',
    riskReason: 'Standard web functionality - not inherently dangerous',
    category: 'network_activity',
    exampleCode: 'new XMLHttpRequest()'
  },

  fetch_request: {
    patternId: 'fetch_request',
    displayName: 'Fetch Request (Runtime)',
    riskLevel: 'benign',
    explanation: 'Network request made during page execution',
    riskReason: 'Normal behavior for modern web applications (analytics, APIs, CDN)',
    category: 'network_activity',
    exampleCode: 'window.fetch(url)'
  },

  xhr_request: {
    patternId: 'xhr_request',
    displayName: 'XHR Request (Runtime)',
    riskLevel: 'benign',
    explanation: 'AJAX request made during page execution',
    riskReason: 'Normal behavior for interactive web applications (analytics, APIs)',
    category: 'network_activity',
    exampleCode: 'xhr.open("GET", url)'
  }
};

/**
 * Get threat metadata by pattern ID
 *
 * @param patternId - The threat pattern identifier
 * @returns Threat metadata or null if not found
 *
 * Performance: O(1) hash map lookup
 */
export function getThreatMetadata(patternId: string): ThreatMetadata | null {
  return THREAT_METADATA_REGISTRY[patternId] || null;
}

/**
 * Get all threat patterns by risk level
 *
 * @param riskLevel - The risk level to filter by
 * @returns Array of threat metadata matching the risk level
 */
export function getThreatsByRiskLevel(
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'benign'
): ThreatMetadata[] {
  return Object.values(THREAT_METADATA_REGISTRY).filter(
    threat => threat.riskLevel === riskLevel
  );
}

/**
 * Get all threat patterns by category
 *
 * @param category - The category to filter by
 * @returns Array of threat metadata matching the category
 */
export function getThreatsByCategory(
  category: 'code_execution' | 'dom_manipulation' | 'network_activity' | 'obfuscation'
): ThreatMetadata[] {
  return Object.values(THREAT_METADATA_REGISTRY).filter(
    threat => threat.category === category
  );
}

/**
 * Check if a pattern ID is defined in the registry
 *
 * @param patternId - The threat pattern identifier
 * @returns True if the pattern is defined, false otherwise
 */
export function isThreatDefined(patternId: string): boolean {
  return patternId in THREAT_METADATA_REGISTRY;
}

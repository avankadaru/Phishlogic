/**
 * Pure, dependency-free helpers for the deterministic urgency-language detector.
 *
 * Extracted from ContentAnalysisAnalyzer so unit tests can exercise the
 * keyword matching without transitively importing the `natural` NLP module
 * (which pulls in ESM-only dependencies like afinn-165 / uuid that don't play
 * well with the default ts-jest config).
 */

export interface UrgencyDetectionResult {
  firesBySubject: boolean;
  firesByBody: boolean;
  subjectMatches: string[];
  bodyUrgencyMatches: string[];
  bodyActionMatches: string[];
}

/** Hard-urgency phrases typically seen in attacker subject lines. */
export const SUBJECT_URGENCY_PHRASES: RegExp[] = [
  /\burgent\b/i,
  /\bimmediate(ly)?\b/i,
  /\bfinal notice\b/i,
  /\bact now\b/i,
  /\bwithin\s+24\s+hours?\b/i,
  /\b24\s*(?:-|\s)?\s*hour(s)?\b/i,
  /\blast chance\b/i,
  /\baction required\b/i,
  /\baccount (will be )?suspend(ed)?\b/i,
  /\baccount (will be )?closed?\b/i,
  /\baccount (will be )?terminat(ed|ion)\b/i,
  /\bverify (your )?account\b/i,
];

/** Body urgency tokens (any one). */
export const BODY_URGENCY_TOKENS: RegExp[] = [
  /\burgent(ly)?\b/i,
  /\bimmediate(ly)?\b/i,
  /\bright away\b/i,
  /\bwithin\s+24\s+hours?\b/i,
  /\b24\s*hours?\b/i,
  /\b48\s*hours?\b/i,
  /\bas soon as possible\b/i,
  /\bdo not ignore\b/i,
  /\bfinal notice\b/i,
  /\blast chance\b/i,
];

/** Body action tokens (any one). */
export const BODY_ACTION_TOKENS: RegExp[] = [
  /\bverify\b/i,
  /\bconfirm\b/i,
  /\breset\b/i,
  /\bclick (here|below)\b/i,
  /\blog[\s-]?in\b/i,
  /\bsign[\s-]?in\b/i,
  /\bupdate (your|account|payment)\b/i,
  /\bavoid (losing|suspension|closure)\b/i,
  /\bdo not ignore\b/i,
  /\breview (your )?(account|payment|activity)\b/i,
  /\b(re)?activate (your )?account\b/i,
];

/**
 * Detect medium-scope urgency language across subject + body.
 *
 * Fires when either:
 *  - The subject contains a hard-urgency phrase, OR
 *  - The body contains at least one urgency token AND one action token.
 */
export function detectUrgencyLanguage(
  subject: string,
  body: string
): UrgencyDetectionResult {
  const subjectMatches = SUBJECT_URGENCY_PHRASES.filter((re) =>
    re.test(subject)
  ).map((re) => re.source);
  const bodyUrgencyMatches = BODY_URGENCY_TOKENS.filter((re) =>
    re.test(body)
  ).map((re) => re.source);
  const bodyActionMatches = BODY_ACTION_TOKENS.filter((re) => re.test(body)).map(
    (re) => re.source
  );

  return {
    firesBySubject: subjectMatches.length > 0,
    firesByBody: bodyUrgencyMatches.length > 0 && bodyActionMatches.length > 0,
    subjectMatches,
    bodyUrgencyMatches,
    bodyActionMatches,
  };
}

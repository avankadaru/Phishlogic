/**
 * ThreatDisplay Component
 *
 * Displays JavaScript security threats with:
 * - Color-coded risk levels (Critical/High/Medium/Benign)
 * - Display names and explanations
 * - Collapsible sections for better UX
 * - Risk badges and icons
 */

import { useState } from 'react';
import { AlertTriangle, Shield, Info, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

interface ThreatInfo {
  patternId: string;
  displayName: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'benign';
  explanation: string;
  riskReason: string;
  category?: string;
  detectedIn?: 'inline' | 'external' | 'runtime';
  detail?: string;
  timestamp?: number;
}

interface ThreatDisplayProps {
  threats: ThreatInfo[];
  title: string;
  collapsible?: boolean;
}

interface ThreatWithCount extends ThreatInfo {
  count: number;
}

/**
 * Deduplicate threats by patternId and count occurrences
 */
function deduplicateThreats(threats: ThreatInfo[]): ThreatWithCount[] {
  const threatMap = new Map<string, ThreatWithCount>();

  threats.forEach(threat => {
    const existing = threatMap.get(threat.patternId);
    if (existing) {
      existing.count += 1;
    } else {
      threatMap.set(threat.patternId, { ...threat, count: 1 });
    }
  });

  return Array.from(threatMap.values());
}

function getRiskIcon(riskLevel: string) {
  switch (riskLevel) {
    case 'critical':
      return <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />;
    case 'high':
      return <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
    case 'medium':
      return <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />;
    case 'benign':
      return <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />;
    default:
      return <Info className="w-4 h-4 text-gray-600 dark:text-gray-400" />;
  }
}

function getRiskColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'benign':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

function getRiskBgColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'critical':
      return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800';
    case 'high':
      return 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800';
    case 'medium':
      return 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800';
    case 'benign':
      return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800';
    default:
      return 'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800';
  }
}

function ThreatItem({ threat, compact = false }: { threat: ThreatWithCount; compact?: boolean }) {
  const textColor =
    threat.riskLevel === 'critical'
      ? 'text-red-900 dark:text-red-200'
      : threat.riskLevel === 'high'
      ? 'text-orange-900 dark:text-orange-200'
      : threat.riskLevel === 'medium'
      ? 'text-yellow-900 dark:text-yellow-200'
      : threat.riskLevel === 'benign'
      ? 'text-green-900 dark:text-green-200'
      : 'text-gray-900 dark:text-gray-200';

  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-start gap-2">
        {getRiskIcon(threat.riskLevel)}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm ${compact ? 'font-normal' : 'font-medium'} ${textColor}`}>
              {threat.displayName}
            </span>
            {threat.count > 1 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                × {threat.count}
              </span>
            )}
            {!compact && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getRiskColor(
                  threat.riskLevel
                )}`}
              >
                {threat.riskLevel.toUpperCase()}
              </span>
            )}
          </div>
          {!compact && (
            <>
              <p className="text-xs text-muted-foreground mt-1">{threat.explanation}</p>
              <p className="text-xs text-muted-foreground mt-1 italic">
                <strong>Risk:</strong> {threat.riskReason}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThreatDisplay({ threats, title, collapsible = false }: ThreatDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(!collapsible);

  // Deduplicate threats by patternId
  const deduplicatedThreats = deduplicateThreats(threats);

  // Group deduplicated threats by risk level
  const grouped = {
    critical: deduplicatedThreats.filter((t) => t.riskLevel === 'critical'),
    high: deduplicatedThreats.filter((t) => t.riskLevel === 'high'),
    medium: deduplicatedThreats.filter((t) => t.riskLevel === 'medium'),
    benign: deduplicatedThreats.filter((t) => t.riskLevel === 'benign'),
  };

  const seriousCount = grouped.critical.length + grouped.high.length + grouped.medium.length;

  if (threats.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {collapsible && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
          <h4 className="text-sm font-medium">{title}</h4>
        </div>
        <div className="flex items-center gap-2">
          {seriousCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              {seriousCount} serious
            </span>
          )}
          {grouped.benign.length > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {grouped.benign.length} benign
            </span>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="space-y-2">
          {/* Critical Threats */}
          {grouped.critical.length > 0 && (
            <div className={`p-3 rounded-lg border ${getRiskBgColor('critical')}`}>
              <p className="text-xs font-semibold text-red-900 dark:text-red-200 mb-2">
                🚨 CRITICAL THREATS
              </p>
              {grouped.critical.map((threat, idx) => (
                <ThreatItem key={idx} threat={threat} />
              ))}
            </div>
          )}

          {/* High Severity Threats */}
          {grouped.high.length > 0 && (
            <div className={`p-3 rounded-lg border ${getRiskBgColor('high')}`}>
              <p className="text-xs font-semibold text-orange-900 dark:text-orange-200 mb-2">
                ⚠️ HIGH SEVERITY
              </p>
              {grouped.high.map((threat, idx) => (
                <ThreatItem key={idx} threat={threat} />
              ))}
            </div>
          )}

          {/* Medium Severity Threats */}
          {grouped.medium.length > 0 && (
            <div className={`p-3 rounded-lg border ${getRiskBgColor('medium')}`}>
              <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
                ⚡ MEDIUM SEVERITY
              </p>
              {grouped.medium.map((threat, idx) => (
                <ThreatItem key={idx} threat={threat} />
              ))}
            </div>
          )}

          {/* Benign Activity (Collapsible) */}
          {grouped.benign.length > 0 && (
            <details className={`p-3 rounded-lg border ${getRiskBgColor('benign')}`}>
              <summary className="text-xs font-semibold text-green-900 dark:text-green-200 cursor-pointer">
                ✅ BENIGN ACTIVITY ({grouped.benign.length} patterns)
              </summary>
              <div className="mt-2 space-y-2">
                {grouped.benign.map((threat, idx) => (
                  <ThreatItem key={idx} threat={threat} compact />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

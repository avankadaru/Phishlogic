import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import { ThreatDisplay } from './ThreatDisplay';
import type { AnalysisSignal, EnrichedThreat } from '@/types';

interface Props {
  result: {
    verdict: 'Safe' | 'Suspicious' | 'Malicious';
    confidence: number;
    redFlags: string[];
    actionItems?: string[];
    reasoning?: string;
    executionMode?: string;
    aiProvider?: string;
    processingTimeMs?: number;
    signals?: AnalysisSignal[];
  };
}

function extractThreatsFromSignals(signals?: AnalysisSignal[]): EnrichedThreat[] | null {
  const scriptSignal = signals?.find(s => s.signalType === 'script_execution_detected');

  if (!scriptSignal?.evidence?.enrichedThreats) {
    return null;
  }

  const { inline, external, runtime, dom } = scriptSignal.evidence.enrichedThreats;

  return [
    ...inline,
    ...external.flatMap(ext => ext.threats),
    ...runtime,
    ...dom
  ];
}

export function ResultDisplay({ result }: Props) {
  const verdictConfig = {
    Safe: {
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
      icon: CheckCircle,
    },
    Suspicious: {
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      borderColor: 'border-yellow-200 dark:border-yellow-800',
      icon: AlertTriangle,
    },
    Malicious: {
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      borderColor: 'border-red-200 dark:border-red-800',
      icon: AlertCircle,
    },
  }[result.verdict];

  const VerdictIcon = verdictConfig.icon;

  return (
    <div className="space-y-4">
      {/* Verdict Badge */}
      <div className={cn(
        'p-4 rounded-lg border-2',
        verdictConfig.bgColor,
        verdictConfig.borderColor
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <VerdictIcon className={cn('w-8 h-8', verdictConfig.color)} />
            <div>
              <p className="text-sm text-muted-foreground">Verdict</p>
              <p className={cn('text-2xl font-bold', verdictConfig.color)}>
                {result.verdict}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Confidence</p>
            <p className="text-2xl font-bold">
              {(result.confidence * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      </div>

      {/* Verdict Summary */}
      {result.reasoning && (
        <div className={cn(
          'rounded-lg p-3 border',
          result.verdict === 'Safe' && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800',
          result.verdict === 'Suspicious' && 'bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800',
          result.verdict === 'Malicious' && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
        )}>
          <p className="text-sm font-medium mb-1">Verdict Summary</p>
          <p className={cn(
            'text-sm',
            result.verdict === 'Safe' && 'text-green-800 dark:text-green-300',
            result.verdict === 'Suspicious' && 'text-yellow-800 dark:text-yellow-300',
            result.verdict === 'Malicious' && 'text-red-800 dark:text-red-300',
          )}>
            {result.reasoning}
          </p>
        </div>
      )}

      {/* Signals */}
      <div>
        <p className="text-sm font-medium mb-2">Signals</p>
        {result.redFlags && result.redFlags.length > 0 ? (
          <ul className="space-y-1 bg-muted/50 rounded-md p-3">
            {result.redFlags.map((flag, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start">
                <span className="mr-2 text-destructive">•</span>
                <span>{flag}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            No signals detected
          </p>
        )}
      </div>

      {/* JavaScript Scan Status */}
      {(() => {
        const skipSignal = result.signals?.find(s => s.signalType === 'js_scan_skipped');
        if (skipSignal) {
          return (
            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                ⚡ JavaScript Scan Optimized
              </p>
              <p className="text-xs text-blue-800 dark:text-blue-300">
                {skipSignal.description}
              </p>
              {skipSignal.evidence?.explanation && (
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-2">
                  {String(skipSignal.evidence.explanation)}
                </p>
              )}
            </div>
          );
        }

        const threats = extractThreatsFromSignals(result.signals);
        if (!threats || threats.length === 0) return null;

        return (
          <div>
            <p className="text-sm font-medium mb-2">JavaScript Threats Detected</p>
            <ThreatDisplay threats={threats} title="" collapsible={false} />
          </div>
        );
      })()}

      {/* Recommended Actions */}
      {result.actionItems && result.actionItems.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Recommended Actions</p>
          <ul className="space-y-1 bg-blue-50 dark:bg-blue-950/30 rounded-md p-3">
            {result.actionItems.map((action, i) => (
              <li key={i} className="text-sm text-blue-900 dark:text-blue-200 flex items-start">
                <span className="mr-2 text-blue-600 dark:text-blue-400">→</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata */}
      {(result.executionMode || result.processingTimeMs) && (
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            {result.executionMode && (
              <>
                Mode: <span className="font-medium">{result.executionMode}</span>
                {result.aiProvider && ` (${result.aiProvider})`}
              </>
            )}
            {result.executionMode && result.processingTimeMs && ' • '}
            {result.processingTimeMs && (
              <>
                Processing: <span className="font-medium">{result.processingTimeMs}ms</span>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

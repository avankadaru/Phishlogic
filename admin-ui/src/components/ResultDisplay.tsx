import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface Props {
  result: {
    verdict: 'Safe' | 'Suspicious' | 'Malicious';
    confidence: number;
    redFlags: string[];
    executionMode?: string;
    aiProvider?: string;
    processingTimeMs?: number;
  };
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

      {/* Risk Factors */}
      <div>
        <p className="text-sm font-medium mb-2">Risk Factors</p>
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
            No risk factors detected
          </p>
        )}
      </div>

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

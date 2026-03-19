import { useState } from 'react';
import { ChevronDown, ChevronRight, Info, AlertTriangle, XCircle, Bug } from 'lucide-react';
import type { LogEntry } from '@/types';

/**
 * Get log level color classes
 */
function getLogLevelColor(level: string): string {
  switch (level) {
    case 'error':
      return 'text-red-600 dark:text-red-400';
    case 'warn':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'info':
      return 'text-blue-600 dark:text-blue-400';
    case 'debug':
      return 'text-gray-600 dark:text-gray-400';
    default:
      return 'text-gray-800 dark:text-gray-200';
  }
}

/**
 * Get log level icon
 */
function getLogLevelIcon(level: string) {
  switch (level) {
    case 'error':
      return <XCircle className="w-3 h-3" />;
    case 'warn':
      return <AlertTriangle className="w-3 h-3" />;
    case 'info':
      return <Info className="w-3 h-3" />;
    case 'debug':
      return <Bug className="w-3 h-3" />;
    default:
      return <Info className="w-3 h-3" />;
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

interface LogViewerProps {
  logs: LogEntry[];
  compact?: boolean;
}

export function LogViewer({ logs, compact = false }: LogViewerProps) {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [filterLevel, setFilterLevel] = useState<string | null>(null);

  const toggleLog = (index: number) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const filteredLogs = filterLevel
    ? logs.filter((log) => log.level === filterLevel)
    : logs;

  if (logs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No logs captured
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Filter buttons */}
      {!compact && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">Filter:</span>
          <button
            onClick={() => setFilterLevel(null)}
            className={`text-xs px-2 py-1 rounded ${
              filterLevel === null
                ? 'bg-gray-200 dark:bg-gray-700'
                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All ({logs.length})
          </button>
          {['error', 'warn', 'info', 'debug'].map((level) => {
            const count = logs.filter((log) => log.level === level).length;
            if (count === 0) return null;
            return (
              <button
                key={level}
                onClick={() => setFilterLevel(level)}
                className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                  filterLevel === level
                    ? 'bg-gray-200 dark:bg-gray-700'
                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <span className={getLogLevelColor(level)}>
                  {level.toUpperCase()}
                </span>
                <span>({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Log entries */}
      <div className="space-y-1">
        {filteredLogs.map((log, index) => {
          const isExpanded = expandedLogs.has(index);
          const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

          return (
            <div
              key={index}
              className="text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-800"
            >
              <div className="flex items-start gap-2">
                {/* Timestamp */}
                <span className="text-muted-foreground shrink-0">
                  {formatTimestamp(log.timestamp)}
                </span>

                {/* Level icon and badge */}
                <span className={`flex items-center gap-1 shrink-0 ${getLogLevelColor(log.level)}`}>
                  {getLogLevelIcon(log.level)}
                  <span className="font-semibold">{log.level.toUpperCase()}</span>
                </span>

                {/* Message */}
                <span className="flex-1 break-words">{log.message}</span>

                {/* Source file */}
                {log.source?.file && (
                  <span className="text-muted-foreground text-xs shrink-0">
                    {log.source.file}
                    {log.source.line && `:${log.source.line}`}
                  </span>
                )}

                {/* Expand button for metadata */}
                {hasMetadata && (
                  <button
                    onClick={() => toggleLog(index)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                  </button>
                )}
              </div>

              {/* Expanded metadata */}
              {isExpanded && hasMetadata && (
                <div className="mt-2 pt-2 border-t border-gray-300 dark:border-gray-700">
                  <div className="text-muted-foreground mb-1">Metadata:</div>
                  <pre className="overflow-x-auto text-xs bg-gray-100 dark:bg-gray-950 p-2 rounded">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredLogs.length === 0 && (
        <div className="text-xs text-muted-foreground italic">
          No logs match the selected filter
        </div>
      )}
    </div>
  );
}

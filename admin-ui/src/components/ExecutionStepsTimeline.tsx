import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import type { ExecutionStep } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { LogViewer } from '@/components/LogViewer';
import { formatDuration } from '@/lib/utils';

/**
 * Step tree node for hierarchical rendering
 */
interface StepNode {
  step: ExecutionStep;
  children: StepNode[];
}

/**
 * Build hierarchical tree structure from flat step array
 */
function buildStepTree(steps: ExecutionStep[]): StepNode[] {
  const nodeMap = new Map<string, StepNode>();
  const roots: StepNode[] = [];

  // Create nodes for all steps
  steps.forEach((step) => {
    nodeMap.set(step.stepId, { step, children: [] });
  });

  // Build parent-child relationships
  steps.forEach((step) => {
    const node = nodeMap.get(step.stepId);
    if (!node) return;

    if (step.parentStepId) {
      const parent = nodeMap.get(step.parentStepId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphaned step - add to root
        roots.push(node);
      }
    } else {
      // Root step
      roots.push(node);
    }
  });

  // Sort children by sequence number
  const sortChildren = (node: StepNode) => {
    node.children.sort((a, b) => a.step.sequence - b.step.sequence);
    node.children.forEach(sortChildren);
  };

  roots.forEach(sortChildren);

  // Sort roots by sequence number as well
  roots.sort((a, b) => a.step.sequence - b.step.sequence);

  return roots;
}

/**
 * Get status icon
 */
function getStatusIcon(status?: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-600" />;
    case 'skipped':
      return <Clock className="w-4 h-4 text-gray-400" />;
    case 'started':
      return <Clock className="w-4 h-4 text-yellow-600" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

/**
 * Get status color classes
 */
function getStatusColor(status?: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'skipped':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    case 'started':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

/**
 * Format step name for display
 */
function formatStepName(stepName: string): string {
  return stepName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

interface ExecutionStepsTimelineProps {
  steps: ExecutionStep[];
}

export function ExecutionStepsTimeline({ steps }: ExecutionStepsTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [showLogs, setShowLogs] = useState<Set<string>>(new Set());

  const stepTree = useMemo(() => buildStepTree(steps), [steps]);

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  const toggleLogs = (stepId: string) => {
    setShowLogs((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

  /**
   * Recursively render step node with children
   */
  const renderStepNode = (node: StepNode, depth: number = 0): JSX.Element => {
    const { step } = node;
    const isExpanded = expandedSteps.has(step.stepId);
    const showingLogs = showLogs.has(step.stepId);
    const hasChildren = node.children.length > 0;
    const hasLogs = step.logs && step.logs.length > 0;
    const isParallel = step.isParallel;

    const indentPx = depth * 24;

    return (
      <div key={step.stepId} style={{ marginLeft: `${indentPx}px` }}>
        {/* Step header */}
        <div className={`border-l-2 pl-3 py-2 ${
          step.status === 'failed'
            ? 'border-red-400 bg-red-50 dark:bg-red-950'
            : step.status === 'completed'
            ? 'border-green-400 bg-green-50 dark:bg-green-950'
            : 'border-gray-300 dark:border-gray-700'
        }`}>
          <div className="flex items-start gap-2">
            {/* Expand button for children */}
            {hasChildren && (
              <button
                onClick={() => toggleStep(step.stepId)}
                className="mt-0.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded p-0.5"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            )}

            {/* Status icon */}
            <div className="mt-0.5">{getStatusIcon(step.status)}</div>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{formatStepName(step.step)}</span>

                {/* Status badge */}
                {step.status && (
                  <Badge className={`text-xs ${getStatusColor(step.status)}`}>
                    {step.status}
                  </Badge>
                )}

                {/* Parallel indicator */}
                {isParallel && (
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 text-xs">
                    <Zap className="w-3 h-3 mr-1" />
                    Parallel
                  </Badge>
                )}

                {/* Source component */}
                {step.source?.component && (
                  <Badge variant="outline" className="text-xs">
                    {step.source.component}
                  </Badge>
                )}

                {/* Duration */}
                {step.duration !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(step.duration)}
                  </span>
                )}

                {/* Logs indicator */}
                {hasLogs && (
                  <button
                    onClick={() => toggleLogs(step.stepId)}
                    className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                  >
                    {showingLogs ? 'Hide' : 'View'} Logs ({step.logs.length})
                  </button>
                )}
              </div>

              {/* Source file */}
              {step.source?.file && (
                <div className="text-xs text-muted-foreground mt-1">
                  {step.source.file}
                  {step.source.method && ` → ${step.source.method}()`}
                  {step.source.line && `:${step.source.line}`}
                </div>
              )}

              {/* Error message */}
              {step.error && (
                <div className="mt-2 p-2 bg-red-100 dark:bg-red-950 rounded text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-red-900 dark:text-red-200">Error:</div>
                      <div className="text-red-800 dark:text-red-300 mt-1">{step.error}</div>
                    </div>
                  </div>

                  {step.stackTrace && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-red-700 dark:text-red-400">
                        Stack Trace
                      </summary>
                      <pre className="mt-1 text-xs overflow-x-auto bg-red-50 dark:bg-red-900 p-2 rounded">
                        {step.stackTrace}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Context metadata */}
              {step.context && Object.keys(step.context).length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Context ({Object.keys(step.context).length} fields)
                  </summary>
                  <pre className="mt-1 text-xs overflow-x-auto bg-gray-100 dark:bg-gray-900 p-2 rounded">
                    {JSON.stringify(step.context, null, 2)}
                  </pre>
                </details>
              )}

              {/* Logs viewer */}
              {showingLogs && hasLogs && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800">
                  <LogViewer logs={step.logs} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Render children */}
        {isExpanded && hasChildren && (
          <div className={isParallel ? 'parallel-group' : ''}>
            {isParallel && (
              <div className="ml-6 mt-2 mb-2 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-3 bg-blue-50 dark:bg-blue-950">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    Parallel Execution Group ({node.children.length} concurrent operations)
                  </span>
                </div>
                <div className="space-y-2">
                  {node.children.map((child) => renderStepNode(child, 0))}
                </div>
              </div>
            )}

            {!isParallel && (
              <div className="space-y-1 mt-1">
                {node.children.map((child) => renderStepNode(child, depth + 1))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (stepTree.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No execution steps available
      </div>
    );
  }

  // Total duration is the root "analysis_start" step duration (encompasses entire analysis)
  const analysisRoot = stepTree.find((node) => node.step.step === 'analysis_start');
  const totalDuration = analysisRoot?.step.duration || 0;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-2">
          {stepTree.map((node) => renderStepNode(node, 0))}
        </div>
      </Card>

      {/* Total execution time */}
      {totalDuration > 0 && (
        <div className="text-sm text-muted-foreground text-right">
          Total Execution Time: <span className="font-medium">{formatDuration(totalDuration)}</span>
        </div>
      )}
    </div>
  );
}

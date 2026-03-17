import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, Clock, ArrowDown, Zap, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import type { ExecutionStep } from '@/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatDuration, calculateTotalTime } from '@/lib/utils';

type PhaseStatus = 'completed' | 'failed' | 'skipped' | 'in_progress';

interface TimelinePhase {
  id: string;
  name: string;
  status: PhaseStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  cumulativeTime?: number;
  steps: EnrichedStep[];
  isParallel: boolean;
  requiresExpand: boolean;
  expandReason?: 'failed' | 'slow' | 'top_slowest';
}

interface EnrichedStep extends ExecutionStep {
  cumulativeTime: number;
  requiresExpand: boolean;
  expandReason?: 'failed' | 'slow' | 'top_slowest';
  isTopSlowest?: boolean;
  slowestRank?: number;
}

/**
 * Determine phase status based on its steps
 */
function determinePhaseStatus(steps: ExecutionStep[]): PhaseStatus {
  if (steps.some(s => s.status === 'failed')) return 'failed';
  if (steps.every(s => s.status === 'completed')) return 'completed';
  if (steps.some(s => s.status === 'skipped')) return 'skipped';
  return 'in_progress';
}

/**
 * Calculate phase timing from its steps
 */
function calculatePhaseTiming(steps: ExecutionStep[]) {
  const completedSteps = steps.filter(s => s.completedAt && s.startedAt);
  if (completedSteps.length === 0) return {};

  const startTime = new Date(Math.min(...completedSteps.map(s =>
    new Date(s.startedAt!).getTime()
  )));
  const endTime = new Date(Math.max(...completedSteps.map(s =>
    new Date(s.completedAt!).getTime()
  )));
  const duration = endTime.getTime() - startTime.getTime();

  return { startTime, endTime, duration };
}

/**
 * Create a phase object
 */
function createPhase(id: string, name: string, steps: EnrichedStep[]): TimelinePhase {
  const status = determinePhaseStatus(steps);
  const timing = calculatePhaseTiming(steps);
  const requiresExpand = steps.some(s => s.requiresExpand);
  const expandReason = steps.find(s => s.requiresExpand)?.expandReason;

  // Calculate cumulative time as the max cumulative from steps in this phase
  const cumulativeTime = steps.length > 0
    ? Math.max(...steps.map(s => s.cumulativeTime))
    : 0;

  return {
    id,
    name,
    status,
    steps,
    isParallel: false,
    requiresExpand,
    expandReason,
    cumulativeTime,
    ...timing,
  };
}

/**
 * Enrich steps with cumulative time
 */
function enrichStepsWithCumulativeTime(steps: ExecutionStep[]): EnrichedStep[] {
  if (steps.length === 0) return [];

  const allStarts = steps
    .filter(s => s.startedAt)
    .map(s => new Date(s.startedAt!).getTime());

  if (allStarts.length === 0) return steps.map(s => ({ ...s, cumulativeTime: 0, requiresExpand: false }));

  const analysisStart = Math.min(...allStarts);

  return steps.map(step => {
    let cumulativeTime = 0;

    if (step.completedAt) {
      cumulativeTime = new Date(step.completedAt).getTime() - analysisStart;
    } else if (step.startedAt) {
      cumulativeTime = new Date(step.startedAt).getTime() - analysisStart;
    }

    return {
      ...step,
      cumulativeTime,
      requiresExpand: false,
    };
  });
}

/**
 * Identify slow steps and mark those requiring expand
 */
function identifySlowSteps(steps: EnrichedStep[]): EnrichedStep[] {
  const slowThreshold = 10000;

  const sortedByDuration = [...steps]
    .filter(s => s.duration !== undefined && s.duration > 0)
    .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
    .slice(0, 3);

  return steps.map(step => {
    const isFailed = step.status === 'failed';
    const isSlow = (step.duration ?? 0) > slowThreshold;
    const slowestIndex = sortedByDuration.findIndex(s => s.step === step.step);
    const isTopSlowest = slowestIndex !== -1;

    let expandReason: 'failed' | 'slow' | 'top_slowest' | undefined;
    if (isFailed) expandReason = 'failed';
    else if (isSlow) expandReason = 'slow';
    else if (isTopSlowest) expandReason = 'top_slowest';

    return {
      ...step,
      requiresExpand: isFailed || isSlow || isTopSlowest,
      expandReason,
      isTopSlowest,
      slowestRank: isTopSlowest ? slowestIndex + 1 : undefined,
    };
  });
}

/**
 * Parse execution steps into timeline phases
 */
function parseExecutionSteps(steps: ExecutionStep[]): TimelinePhase[] {
  const enrichedSteps = identifySlowSteps(enrichStepsWithCumulativeTime(steps));
  const phases: TimelinePhase[] = [];

  // Phase 1: Request Received
  const requestStep = enrichedSteps.find(s => s.step === 'request_received');
  if (requestStep) {
    phases.push(createPhase('request', 'Request Received', [requestStep]));
  }

  // Phase 2: Whitelist Check
  const whitelistSteps = enrichedSteps.filter(s =>
    s.step.includes('whitelist_check')
  );
  if (whitelistSteps.length > 0) {
    phases.push(createPhase('whitelist', 'Whitelist Check', whitelistSteps));
  }

  // Phase 3: Content Risk Analysis
  const contentRiskSteps = enrichedSteps.filter(s =>
    s.step.includes('content_risk_analysis')
  );
  if (contentRiskSteps.length > 0) {
    phases.push(createPhase('content_risk', 'Content Risk Analysis', contentRiskSteps));
  }

  // Phase 4: Config Loading
  const configSteps = enrichedSteps.filter(s =>
    s.step.includes('config_loading')
  );
  if (configSteps.length > 0) {
    phases.push(createPhase('config', 'Configuration Loading', configSteps));
  }

  // Phase 5: Strategy Execution (PARALLEL - contains analyzers)
  const analyzerSteps = enrichedSteps.filter(s => s.step.startsWith('analyzer_'));
  const strategySteps = enrichedSteps.filter(s =>
    s.step.includes('strategy_execution') ||
    s.step.includes('native_execution') ||
    s.step.includes('hybrid_execution') ||
    s.step.includes('ai_execution')
  );

  if (strategySteps.length > 0 || analyzerSteps.length > 0) {
    const allStrategySteps = [...strategySteps, ...analyzerSteps];
    const phase = createPhase('strategy', 'Strategy Execution', allStrategySteps);
    phase.isParallel = analyzerSteps.length > 0;
    phases.push(phase);
  }

  // Phase 6: Email Alert Check
  const emailAlertSteps = enrichedSteps.filter(s =>
    s.step.includes('email_alert')
  );
  if (emailAlertSteps.length > 0) {
    phases.push(createPhase('email_alert', 'Email Alert Check', emailAlertSteps));
  }

  // Phase 7: Response Sent
  const responseStep = enrichedSteps.find(s => s.step === 'response_sent');
  if (responseStep) {
    phases.push(createPhase('response', 'Response Sent', [responseStep]));
  }

  return phases;
}

/**
 * Get status icon based on status
 */
function getStatusIcon(status: PhaseStatus) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-600" />;
    case 'skipped':
      return <Clock className="w-4 h-4 text-gray-400" />;
    case 'in_progress':
      return <Clock className="w-4 h-4 text-yellow-600" />;
    default:
      return <Clock className="w-4 h-4 text-gray-400" />;
  }
}

/**
 * Get status color classes
 */
function getStatusColor(status: PhaseStatus): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'skipped':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    case 'in_progress':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

/**
 * Get expand button label
 */
function getExpandButtonLabel(isExpanded: boolean): string {
  if (isExpanded) return 'Collapse';
  return 'Expand';
}

/**
 * Get expand button color
 */
function getExpandButtonColor(step: EnrichedStep): string {
  if (step.expandReason === 'failed') return 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-200';
  if (step.expandReason === 'slow') return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-200';
  if (step.expandReason === 'top_slowest') return 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200';

  return 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300';
}

/**
 * Format step name for display
 */
function formatStepName(stepName: string): string {
  return stepName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/^Analyzer /, '');
}

/**
 * Render context tooltip content
 */
function renderContextTooltip(context?: Record<string, unknown>): string | null {
  if (!context || Object.keys(context).length === 0) return null;

  const entries = Object.entries(context)
    .filter(([_, value]) => value !== undefined && value !== null)
    .slice(0, 5);

  if (entries.length === 0) return null;

  return entries
    .map(([key, value]) => {
      const displayValue = typeof value === 'object'
        ? JSON.stringify(value).substring(0, 30) + '...'
        : String(value).substring(0, 30);
      return `${key}: ${displayValue}`;
    })
    .join(' | ');
}

interface ExecutionStepsTimelineProps {
  steps: ExecutionStep[];
}

export function ExecutionStepsTimeline({ steps }: ExecutionStepsTimelineProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const phases = useMemo(() => parseExecutionSteps(steps), [steps]);
  const totalTime = useMemo(() => calculateTotalTime(steps), [steps]);

  const togglePhase = (phaseId: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phaseId)) {
        next.delete(phaseId);
      } else {
        next.add(phaseId);
      }
      return next;
    });
  };

  const toggleStep = (stepName: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepName)) {
        next.delete(stepName);
      } else {
        next.add(stepName);
      }
      return next;
    });
  };

  if (phases.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No execution steps available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {phases.map((phase, phaseIndex) => {
        const isExpanded = expandedPhases.has(phase.id);

        return (
          <div key={phase.id} className="relative">
            {/* Vertical connector line */}
            {phaseIndex < phases.length - 1 && (
              <div className="absolute left-3 top-12 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-700" />
            )}

            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5">{getStatusIcon(phase.status)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm">{phase.name}</h4>
                      <Badge className={getStatusColor(phase.status)}>
                        {phase.status}
                      </Badge>
                      {phase.requiresExpand && (
                        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Review Required
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {phase.duration !== undefined && (
                        <>
                          Duration: {formatDuration(phase.duration)}
                          {phase.cumulativeTime !== undefined && (
                            <> | Cumulative: {formatDuration(phase.cumulativeTime)}</>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {phase.steps.length > 1 && (
                  <button
                    onClick={() => togglePhase(phase.id)}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        Collapse
                      </>
                    ) : (
                      <>
                        <ChevronRight className="w-3 h-3" />
                        Expand
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Expanded phase details */}
              {isExpanded && (
                <div className="mt-4 space-y-3">
                  {/* Sort all steps by startedAt timestamp, then group consecutive analyzer steps */}
                  {(() => {
                    const allSteps = [...phase.steps];
                    allSteps.sort((a, b) => {
                      const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
                      const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
                      return timeA - timeB;
                    });

                    // Group consecutive analyzer steps for parallel box
                    const grouped: Array<EnrichedStep | EnrichedStep[]> = [];
                    let currentAnalyzerGroup: EnrichedStep[] = [];

                    allSteps.forEach(step => {
                      if (step.step.startsWith('analyzer_')) {
                        currentAnalyzerGroup.push(step);
                      } else {
                        if (currentAnalyzerGroup.length > 0) {
                          grouped.push(currentAnalyzerGroup);
                          currentAnalyzerGroup = [];
                        }
                        grouped.push(step);
                      }
                    });

                    if (currentAnalyzerGroup.length > 0) {
                      grouped.push(currentAnalyzerGroup);
                    }

                    return grouped.map((item, idx) => {
                      if (Array.isArray(item)) {
                        // Render parallel analyzer box
                        return (
                          <div key={`parallel-${idx}`} className="ml-7 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-3 bg-blue-50 dark:bg-blue-950">
                            <div className="flex items-center gap-2 mb-3">
                              <Zap className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
                                Parallel Execution
                              </span>
                            </div>

                            <div className="space-y-3">
                              {item.map(step => (
                                <div key={step.step} className="bg-white dark:bg-gray-900 rounded p-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1">
                                      <Tooltip content={renderContextTooltip(step.context)}>
                                        <div className="flex items-center gap-2">
                                          {getStatusIcon(step.status as PhaseStatus)}
                                          <span className="text-sm">{formatStepName(step.step)}</span>
                                          {step.status && (
                                            <Badge className={`text-xs ${getStatusColor(step.status as PhaseStatus)}`}>
                                              {step.status}
                                            </Badge>
                                          )}
                                        </div>
                                      </Tooltip>
                                      <div className="text-xs text-muted-foreground mt-1">
                                        {step.duration !== undefined && (
                                          <>
                                            Duration: {formatDuration(step.duration)}
                                            {' | '}
                                            Cumulative: {formatDuration(step.cumulativeTime)}
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {step.requiresExpand && (
                                      <button
                                        onClick={() => toggleStep(step.step)}
                                        className={`text-xs px-2 py-1 rounded ${getExpandButtonColor(step)}`}
                                      >
                                        {getExpandButtonLabel(expandedSteps.has(step.step))}
                                      </button>
                                    )}
                                  </div>

                                  {/* Expanded step details */}
                                  {expandedSteps.has(step.step) && (
                                    <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs">
                                      {step.error && (
                                        <div className="mb-2">
                                          <span className="font-medium text-red-600">Error:</span>
                                          <p className="mt-1">{step.error}</p>
                                        </div>
                                      )}
                                      {step.stackTrace && (
                                        <div className="mb-2">
                                          <span className="font-medium">Stack Trace:</span>
                                          <pre className="mt-1 overflow-x-auto text-xs">{step.stackTrace}</pre>
                                        </div>
                                      )}
                                      {step.context && Object.keys(step.context).length > 0 && (
                                        <div>
                                          <span className="font-medium">Context:</span>
                                          <pre className="mt-1 overflow-x-auto">{JSON.stringify(step.context, null, 2)}</pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      } else {
                        // Render regular non-analyzer step
                        const step = item;
                        return (
                          <div key={step.step} className="ml-7 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <Tooltip content={renderContextTooltip(step.context)}>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">{formatStepName(step.step)}</span>
                                    {step.status && (
                                      <Badge className={`text-xs ${getStatusColor(step.status as PhaseStatus)}`}>
                                        {step.status}
                                      </Badge>
                                    )}
                                  </div>
                                </Tooltip>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {step.duration !== undefined && (
                                    <>
                                      Duration: {formatDuration(step.duration)}
                                      {' | '}
                                      Cumulative: {formatDuration(step.cumulativeTime)}
                                    </>
                                  )}
                                </div>
                              </div>

                              {step.requiresExpand && (
                                <button
                                  onClick={() => toggleStep(step.step)}
                                  className={`text-xs px-2 py-1 rounded ${getExpandButtonColor(step)}`}
                                >
                                  {getExpandButtonLabel(expandedSteps.has(step.step))}
                                </button>
                              )}
                            </div>

                            {/* Expanded step details */}
                            {expandedSteps.has(step.step) && (
                              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs">
                                {step.error && (
                                  <div className="mb-2">
                                    <span className="font-medium text-red-600">Error:</span>
                                    <p className="mt-1">{step.error}</p>
                                  </div>
                                )}
                                {step.stackTrace && (
                                  <div className="mb-2">
                                    <span className="font-medium">Stack Trace:</span>
                                    <pre className="mt-1 overflow-x-auto text-xs">{step.stackTrace}</pre>
                                  </div>
                                )}
                                {step.context && Object.keys(step.context).length > 0 && (
                                  <div>
                                    <span className="font-medium">Context:</span>
                                    <pre className="mt-1 overflow-x-auto">{JSON.stringify(step.context, null, 2)}</pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                    });
                  })()}
                </div>
              )}
            </Card>

            {/* Arrow connector */}
            {phaseIndex < phases.length - 1 && (
              <div className="flex justify-center my-1">
                <ArrowDown className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        );
      })}

      {/* Total time */}
      <div className="text-sm text-muted-foreground text-right mt-4">
        Total Execution Time: <span className="font-medium">{formatDuration(totalTime)}</span>
      </div>
    </div>
  );
}

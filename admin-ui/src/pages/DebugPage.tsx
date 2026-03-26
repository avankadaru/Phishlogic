import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatRelativeTime } from '@/lib/utils';
import type { Analysis, EnrichedThreat } from '@/types';
import { Bug, CheckCircle, AlertTriangle, XCircle, Search } from 'lucide-react';
import { ExecutionStepsTimeline } from '@/components/ExecutionStepsTimeline';
import { ThreatDisplay } from '@/components/ThreatDisplay';

export default function DebugPage() {
  const [searchParams] = useSearchParams();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisIdSearch, setAnalysisIdSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  // Check if there's an ID in the URL query parameter
  useEffect(() => {
    const idFromUrl = searchParams.get('id');
    if (idFromUrl) {
      setAnalysisIdSearch(idFromUrl);
      // Trigger search after a small delay to ensure state is set
      setTimeout(() => {
        handleSearchById(idFromUrl);
      }, 100);
    } else {
      loadAnalyses();
    }
  }, []);

  useEffect(() => {
    if (!searchParams.get('id')) {
      loadAnalyses();
    }
  }, [currentPage]);

  const loadAnalyses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (verdictFilter) params.append('verdict', verdictFilter);
      if (startDate) params.append('startDate', new Date(startDate).toISOString());
      if (endDate) params.append('endDate', new Date(endDate).toISOString());
      params.append('limit', pageSize.toString());
      params.append('offset', ((currentPage - 1) * pageSize).toString());

      const response = await api.get(`/admin/debug/analyses?${params}`);
      setAnalyses(response.data.data?.analyses || []);
      setTotalCount(response.data.data?.pagination?.total || 0);
    } catch (error) {
      console.error('Failed to load analyses:', error);
      setAnalyses([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchById = async (id?: string) => {
    const searchId = id || analysisIdSearch.trim();
    if (!searchId) return;

    setLoading(true);
    try {
      const response = await api.get(`/admin/debug/analyses/${searchId}`);
      setAnalyses([response.data.data]);
      setTotalCount(1);
      setCurrentPage(1);
    } catch (error) {
      console.error('Analysis not found:', error);
      setAnalyses([]);
      setTotalCount(0);
      alert('Analysis not found. Please check the ID and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadAnalyses();
  };

  const handleClearFilters = () => {
    setVerdictFilter('');
    setStartDate('');
    setEndDate('');
    setAnalysisIdSearch('');
    setCurrentPage(1);
    setTimeout(() => loadAnalyses(), 0);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    const totalPages = Math.ceil(totalCount / pageSize);
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const getVerdictIcon = (verdict: string) => {
    switch (verdict) {
      case 'Safe':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'Suspicious':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      case 'Malicious':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Bug className="w-5 h-5 text-gray-600" />;
    }
  };

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'Safe':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Suspicious':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Malicious':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  /**
   * Extract enriched threats from script_execution_detected signal
   */
  const extractEnrichedThreats = (analysis: Analysis) => {
    const scriptSignal = analysis.signals?.find(
      s => s.signalType === 'script_execution_detected'
    );

    if (!scriptSignal?.evidence?.enrichedThreats) {
      return null;
    }

    const { inline, external, runtime, dom, summary } = scriptSignal.evidence.enrichedThreats;

    // Flatten all threats into a single array for ThreatDisplay
    const allThreats: EnrichedThreat[] = [
      ...inline,
      ...external.flatMap(ext => ext.threats),
      ...runtime,
      ...dom
    ];

    return { threats: allThreats, summary };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading analyses...</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Debug Interface</h1>
        <p className="text-muted-foreground">Search analyses by ID or filter by verdict and date range</p>
      </div>

      {/* Analysis ID Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Input
              type="text"
              placeholder="Search by Analysis ID (e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890)"
              value={analysisIdSearch}
              onChange={(e) => setAnalysisIdSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearchById()}
              className="flex-1"
            />
            <Button onClick={() => handleSearchById()} disabled={loading || !analysisIdSearch.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Search by ID
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium block mb-2">Verdict</label>
              <select
                value={verdictFilter}
                onChange={(e) => setVerdictFilter(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">All Verdicts</option>
                <option value="Safe">Safe</option>
                <option value="Suspicious">Suspicious</option>
                <option value="Malicious">Malicious</option>
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium block mb-2">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium block mb-2">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} disabled={loading}>
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
              <Button variant="outline" onClick={handleClearFilters} disabled={loading}>
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {analyses.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No recent analyses. Data will appear once the backend processes requests.
              </p>
            </CardContent>
          </Card>
        ) : (
          analyses.map((analysis) => (
            <Card key={analysis.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getVerdictIcon(analysis.verdict)}
                    <div>
                      <CardTitle className="text-lg">{analysis.inputType}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {formatRelativeTime(analysis.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getVerdictColor(
                      analysis.verdict
                    )}`}
                  >
                    {analysis.verdict}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confidence:</span>
                    <span className="font-medium">
                      {(analysis.confidenceScore * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mode:</span>
                    <span className="font-medium capitalize">{analysis.executionMode}</span>
                  </div>
                  {analysis.aiProvider && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Provider:</span>
                      <span className="font-medium capitalize">
                        {analysis.aiProvider}
                        {analysis.aiModel && ` (${analysis.aiModel})`}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing Time:</span>
                    <span className="font-medium">{analysis.processingTimeMs}ms</span>
                  </div>
                  {analysis.costUsd && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cost:</span>
                      <span className="font-medium">${analysis.costUsd.toFixed(4)}</span>
                    </div>
                  )}
                  {analysis.whitelisted && (
                    <div className="mt-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20">
                      <p className="text-xs text-green-800 dark:text-green-400">
                        ✓ Whitelisted: {analysis.whitelistReason}
                      </p>
                    </div>
                  )}
                  {analysis.analyzersRun && analysis.analyzersRun.length >= 0 && (
                    <div className="mt-2 p-2 rounded-md bg-blue-50 dark:bg-blue-900/20">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-400">
                          Analyzers Executed
                        </p>
                        <span className="text-xs font-bold text-blue-900 dark:text-blue-300">
                          {analysis.analyzersRun.length} / 9
                        </span>
                      </div>
                      {analysis.analyzersRun.length === 0 ? (
                        <p className="text-xs text-blue-700 dark:text-blue-400 italic">
                          Full bypass (trusted sender, no risk indicators)
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {analysis.analyzersRun.map((analyzer, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 text-xs rounded bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200"
                            >
                              {analyzer}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {analysis.contentRisk && (
                    <div className="mt-2 p-2 rounded-md bg-purple-50 dark:bg-purple-900/20">
                      <p className="text-xs font-medium text-purple-800 dark:text-purple-400 mb-1">
                        Content Risk Assessment
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded ${
                          analysis.contentRisk.hasLinks
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {analysis.contentRisk.hasLinks ? '⚠️ Links' : '✓ No Links'}
                        </span>
                        <span className={`px-2 py-0.5 rounded ${
                          analysis.contentRisk.hasAttachments
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {analysis.contentRisk.hasAttachments ? '⚠️ Attachments' : '✓ No Attachments'}
                        </span>
                        <span className={`px-2 py-0.5 rounded ${
                          analysis.contentRisk.hasUrgencyLanguage
                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {analysis.contentRisk.hasUrgencyLanguage ? '⚠️ Urgency' : '✓ No Urgency'}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-800/50 dark:text-purple-200 font-medium">
                          Risk: {analysis.contentRisk.overallRiskScore}/10
                        </span>
                      </div>
                    </div>
                  )}
                  {analysis.costSummary && analysis.costSummary.operations && analysis.costSummary.operations.length > 0 && (
                    <div className="mt-2 p-2 rounded-md bg-orange-50 dark:bg-orange-900/20">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-medium text-orange-800 dark:text-orange-400">
                          Cost Breakdown
                        </p>
                        <span className="text-xs font-bold text-orange-900 dark:text-orange-300">
                          Total: ${analysis.costSummary.totalCostUsd.toFixed(4)}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {analysis.costSummary.operations.map((op, idx) => (
                          <div key={idx} className="flex items-start justify-between text-xs bg-white dark:bg-gray-800 p-2 rounded">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-orange-900 dark:text-orange-200">
                                  {op.operationType.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200 rounded text-[10px] font-medium">
                                  {op.count}x
                                </span>
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {op.description}
                              </p>
                              {op.metadata && (
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {op.metadata.provider && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                      {op.metadata.provider}
                                    </span>
                                  )}
                                  {op.metadata.model && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                      {op.metadata.model}
                                    </span>
                                  )}
                                  {op.metadata.tokensUsed && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                      {op.metadata.tokensUsed} tokens
                                    </span>
                                  )}
                                  {op.metadata.browser && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                      {op.metadata.browser}
                                    </span>
                                  )}
                                  {op.metadata.urlsChecked && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                                      {op.metadata.urlsChecked} URLs
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {op.costUsd && (
                              <span className="text-[11px] font-medium text-orange-700 dark:text-orange-300 ml-2">
                                ${op.costUsd.toFixed(4)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.skippedTasks && analysis.skippedTasks.length > 0 && (
                    <div className="mt-2 p-2 rounded-md bg-gray-50 dark:bg-gray-900/50">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-400 mb-1">
                        Skipped Tasks (no matching content):
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {analysis.skippedTasks.map((task, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                          >
                            {task}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.riskFactors && analysis.riskFactors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Risk Factors:
                      </p>
                      <ul className="text-xs space-y-1">
                        {analysis.riskFactors.map((factor, idx) => {
                          const isObject = typeof factor === 'object' && factor !== null;
                          const message = isObject ? (factor as any).message : factor;
                          const severity = isObject ? (factor as any).severity : null;
                          const severityColor =
                            severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                            severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                            severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-muted-foreground';

                          return (
                            <li key={idx} className={severityColor}>
                              • {message}
                              {severity && (
                                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 uppercase">
                                  {severity}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {analysis.executionSteps && analysis.executionSteps.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-3">
                        Execution Timeline:
                      </p>
                      <ExecutionStepsTimeline steps={analysis.executionSteps} />
                    </div>
                  )}
                  {/* JavaScript Threat Detection */}
                  {(() => {
                    const threatData = extractEnrichedThreats(analysis);
                    if (!threatData) return null;

                    const { threats, summary } = threatData;
                    const seriousCount = summary.criticalCount + summary.highCount + summary.mediumCount;

                    return (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-medium text-muted-foreground">
                            JavaScript Security Analysis
                          </p>
                          <div className="flex items-center gap-2">
                            {summary.criticalCount > 0 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                                CRITICAL: {summary.criticalCount}
                              </span>
                            )}
                            {summary.highCount > 0 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                                HIGH: {summary.highCount}
                              </span>
                            )}
                            {summary.mediumCount > 0 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                                MEDIUM: {summary.mediumCount}
                              </span>
                            )}
                          </div>
                        </div>
                        <ThreatDisplay
                          threats={threats}
                          title="Detected Threats"
                          collapsible={summary.benignCount > 0 && seriousCount === 0}
                        />
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalCount > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Showing {analyses.length} of {totalCount} analyses
              </p>
              <div className="flex gap-2 items-center">
                <Button
                  variant="outline"
                  onClick={handlePreviousPage}
                  disabled={currentPage === 1 || loading}
                  size="sm"
                >
                  Previous
                </Button>
                <span className="px-4 py-2 text-sm">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  onClick={handleNextPage}
                  disabled={currentPage === totalPages || loading || totalPages === 0}
                  size="sm"
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

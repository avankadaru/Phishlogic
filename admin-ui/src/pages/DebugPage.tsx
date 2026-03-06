import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatRelativeTime } from '@/lib/utils';
import type { Analysis } from '@/types';
import { Bug, CheckCircle, AlertTriangle, XCircle, Search } from 'lucide-react';

export default function DebugPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisIdSearch, setAnalysisIdSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 20;

  useEffect(() => {
    loadAnalyses();
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
      setAnalyses(response.data.data || response.data.data?.analyses || []);
      setTotalCount(response.data.total || response.data.data?.analyses?.length || 0);
    } catch (error) {
      console.error('Failed to load analyses:', error);
      setAnalyses([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchById = async () => {
    if (!analysisIdSearch.trim()) return;

    setLoading(true);
    try {
      const response = await api.get(`/admin/debug/analyses/${analysisIdSearch.trim()}`);
      setAnalyses([response.data]);
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
            <Button onClick={handleSearchById} disabled={loading || !analysisIdSearch.trim()}>
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
                  {analysis.riskFactors && analysis.riskFactors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Risk Factors:
                      </p>
                      <ul className="text-xs space-y-1">
                        {analysis.riskFactors.map((factor, idx) => (
                          <li key={idx} className="text-muted-foreground">
                            • {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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

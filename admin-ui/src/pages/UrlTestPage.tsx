import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link, Loader2, Copy } from 'lucide-react';
import api from '@/lib/api';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ScenarioButtons } from '@/components/ScenarioButtons';
import { ResultDisplay } from '@/components/ResultDisplay';
import { urlScenarios, UrlScenario } from '@/data/url-scenarios';

interface AnalysisResult {
  verdict: 'Safe' | 'Suspicious' | 'Malicious';
  confidence: number;
  redFlags: string[];
  actionItems: string[];
  executionMode: string;
  aiProvider?: string;
  processingTimeMs: number;
  analysisId: string;
}

export default function UrlTestPage() {
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState('native');
  const [formData, setFormData] = useState({
    url: '',
    referrer: '',
    userAgent: ''
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleScenarioClick = (scenario: UrlScenario) => {
    setSelectedScenario(scenario.id);
    setFormData({
      url: scenario.data.url,
      referrer: '',
      userAgent: ''
    });
  };

  const handleAnalyze = async () => {
    if (!formData.url) {
      toast.error('Please enter a URL');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const analysisId = crypto.randomUUID();
      const uiTimestamp = Date.now();

      const requestBody: any = {
        analysisId,
        uiTimestamp,
        executionMode,
        url: formData.url
      };

      if (formData.referrer) {
        requestBody.referrer = formData.referrer;
      }
      if (formData.userAgent) {
        requestBody.userAgent = formData.userAgent;
      }

      const response = await api.post('/v1/analyze/url', requestBody);

      setResult({
        verdict: response.data.verdict || 'Safe',
        confidence: response.data.confidence || 0,
        redFlags: response.data.redFlags?.map((flag: any) => flag.message) || [],
        actionItems: response.data.actions || [],
        executionMode: executionMode,
        aiProvider: undefined,
        processingTimeMs: response.data.metadata?.duration || 0,
        analysisId,
      });
    } catch (error: any) {
      console.error('Analysis failed:', error);
      toast.error(error.response?.data?.error || 'Analysis failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyAnalysisId = () => {
    if (result?.analysisId) {
      navigator.clipboard.writeText(result.analysisId);
      toast.success('Analysis ID copied to clipboard');
    }
  };

  const handleViewInDebug = () => {
    if (result?.analysisId) {
      navigate(`/debug?id=${result.analysisId}`);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">URL Testing</h1>
        <p className="text-muted-foreground mt-2">
          Test URL analysis with various scenarios or custom URLs
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Scenarios + Form */}
        <Card>
          <CardHeader>
            <CardTitle>URL Test Scenarios</CardTitle>
            <CardDescription>
              Select a scenario to auto-fill the form, or enter your own URL
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Scenario Buttons */}
            <ScenarioButtons
              scenarios={urlScenarios}
              selectedId={selectedScenario}
              onSelect={handleScenarioClick}
            />

            {/* Execution Mode Selector */}
            <div className="mt-6">
              <label className="text-sm font-medium">Execution Mode</label>
              <Select
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value)}
                className="mt-1.5"
              >
                <option value="native">Native (Rules-based)</option>
                <option value="hybrid">Hybrid (AI + Fallback)</option>
                <option value="ai">AI Only</option>
              </Select>
            </div>

            {/* URL Form Fields */}
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">URL *</label>
                <Input
                  placeholder="https://example.com"
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Referrer (optional)</label>
                <Input
                  placeholder="https://referrer.com"
                  value={formData.referrer}
                  onChange={(e) => setFormData({ ...formData, referrer: e.target.value })}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Where the link came from
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">User Agent (optional)</label>
                <Input
                  placeholder="Mozilla/5.0..."
                  value={formData.userAgent}
                  onChange={(e) => setFormData({ ...formData, userAgent: e.target.value })}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Browser identification string
                </p>
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={loading || !formData.url}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Link className="mr-2 h-4 w-4" />
                    Analyze URL
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: Results */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Analysis Results</CardTitle>
              {result && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewInDebug}
                >
                  View in Debug
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">Analyzing URL...</p>
              </div>
            )}

            {!loading && !result && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Link className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm font-medium">No analysis yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a scenario or enter a URL and click Analyze
                </p>
              </div>
            )}

            {result && (
              <>
                {/* Analysis ID Badge */}
                <div className="mb-4 p-3 bg-muted rounded-md">
                  <p className="text-xs text-muted-foreground mb-1">Analysis ID</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono flex-1 break-all">
                      {result.analysisId}
                    </code>
                    <button
                      onClick={handleCopyAnalysisId}
                      className="p-1 hover:bg-background rounded"
                      title="Copy to clipboard"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <ResultDisplay result={result} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

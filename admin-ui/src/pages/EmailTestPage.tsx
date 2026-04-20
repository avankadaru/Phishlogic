import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Loader2, Copy, ChevronRight, ChevronDown } from 'lucide-react';
import api from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatDuration, formatErrorWithStatus } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { ScenarioButtons } from '@/components/ScenarioButtons';
import { ResultDisplay } from '@/components/ResultDisplay';
import {
  emailScenarios,
  EmailScenario,
  AuthOverride,
  buildRawEmail,
} from '@/data/email-scenarios';

interface AnalysisResult {
  verdict: 'Safe' | 'Suspicious' | 'Malicious';
  confidence: number;
  redFlags: string[];
  actionItems: string[];
  reasoning: string;
  executionMode: string;
  aiProvider?: string;
  processingTimeMs: number;
  analysisId: string;
  signals?: any[];
}

export default function EmailTestPage() {
  const navigate = useNavigate();
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState('native');
  const [authOverride, setAuthOverride] = useState<AuthOverride>('pass');
  const [formData, setFormData] = useState({
    from: '',
    to: '',
    subject: '',
    body: ''
  });
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [rawPreviewOpen, setRawPreviewOpen] = useState(false);

  // Timer for showing elapsed time during analysis
  useEffect(() => {
    if (!loading || !startTime) {
      return;
    }

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [loading, startTime]);

  const handleScenarioClick = (scenario: EmailScenario) => {
    setSelectedScenario(scenario.id);
    setFormData(scenario.data);
    setAuthOverride(scenario.authOverride ?? 'pass');
  };

  const rawEmailPreview = useMemo(
    () =>
      buildRawEmail(
        {
          from: formData.from || 'sender@example.com',
          to: formData.to || 'recipient@example.com',
          subject: formData.subject || '(no subject)',
          body: formData.body || '',
        },
        authOverride
      ),
    [formData, authOverride]
  );

  const handleAnalyze = async () => {
    if (!formData.from || !formData.subject) {
      toast.error('Please fill in at least From and Subject fields');
      return;
    }

    setLoading(true);
    setStartTime(Date.now());
    setResult(null);

    try {
      const analysisId = crypto.randomUUID();
      const uiTimestamp = Date.now();

      const rawEmail = buildRawEmail(formData, authOverride);

      const response = await api.post('/v1/analyze/email', {
        analysisId,
        uiTimestamp,
        executionMode,
        rawEmail
      });

      setResult({
        verdict: response.data.verdict || 'Safe',
        confidence: response.data.confidence || 0,
        redFlags: response.data.redFlags?.map((flag: any) => flag.message) || [],
        actionItems: response.data.actions || [],
        reasoning: response.data.reasoning || '',
        executionMode: executionMode,
        aiProvider: undefined,
        processingTimeMs: response.data.metadata?.duration || 0,
        analysisId,
        signals: response.data.signals || [],
      });
    } catch (error: any) {
      console.error('Analysis failed:', error);
      toast.error(formatErrorWithStatus(error));
    } finally {
      setLoading(false);
      setStartTime(null);
      setElapsed(0);
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
        <h1 className="text-3xl font-bold">Email Testing</h1>
        <p className="text-muted-foreground mt-2">
          Test email analysis with various scenarios or custom email content
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Scenarios + Form */}
        <Card>
          <CardHeader>
            <CardTitle>Email Test Scenarios</CardTitle>
            <CardDescription>
              Select a scenario to auto-fill the form, or enter your own email data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Scenario Buttons */}
            <ScenarioButtons
              scenarios={emailScenarios}
              selectedId={selectedScenario}
              onSelect={handleScenarioClick}
            />

            {/* Execution Mode Selector */}
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div>
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
              <div>
                <label className="text-sm font-medium">Simulated Authentication</label>
                <Select
                  value={authOverride}
                  onChange={(e) => setAuthOverride(e.target.value as AuthOverride)}
                  className="mt-1.5"
                >
                  <option value="pass">Pass (realistic default)</option>
                  <option value="softfail">Soft-fail</option>
                  <option value="fail">Fail (SPF/DKIM/DMARC)</option>
                  <option value="none">None (no auth header)</option>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Injects an Authentication-Results header so SPF/DKIM/DMARC signals reflect real traffic.
                </p>
              </div>
            </div>

            {/* Email Form Fields */}
            <div className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium">From *</label>
                <Input
                  placeholder="sender@example.com"
                  value={formData.from}
                  onChange={(e) => setFormData({ ...formData, from: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">To</label>
                <Input
                  placeholder="recipient@example.com"
                  value={formData.to}
                  onChange={(e) => setFormData({ ...formData, to: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Subject *</label>
                <Input
                  placeholder="Email subject line"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="mt-1.5"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Body</label>
                <Textarea
                  placeholder="Email message content..."
                  value={formData.body}
                  onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                  rows={10}
                  className="mt-1.5"
                />
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={loading || !formData.from || !formData.subject}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Analyze Email
                  </>
                )}
              </Button>

              <div className="rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setRawPreviewOpen((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    {rawPreviewOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Raw email being sent
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    auth={authOverride}
                  </span>
                </button>
                {rawPreviewOpen && (
                  <pre className="whitespace-pre-wrap break-all border-t border-border bg-muted/50 px-3 py-2 text-[11px] font-mono max-h-64 overflow-auto">
                    {rawEmailPreview}
                  </pre>
                )}
              </div>
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
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-current border-r-transparent mb-4"></div>
                  <p className="text-lg font-medium mb-2">Analyzing email...</p>
                  <p className="text-sm text-muted-foreground">
                    Elapsed time: {formatDuration(elapsed)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    This may take up to 50 seconds for complex analysis
                  </p>
                </div>
              </div>
            )}

            {!loading && !result && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Mail className="h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm font-medium">No analysis yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select a scenario or enter email data and click Analyze
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

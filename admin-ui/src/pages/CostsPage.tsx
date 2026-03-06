import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import type { CostSummary } from '@/types';

export default function CostsPage() {
  const [costs, setCosts] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCosts();
  }, []);

  const loadCosts = async () => {
    try {
      const response = await api.get('/admin/costs/summary');
      setCosts(response.data.data);
    } catch (error) {
      console.error('Failed to load costs:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading cost data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cost Analytics</h1>
        <p className="text-muted-foreground">Monitor AI usage and costs</p>
      </div>

      {costs ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(costs.summary.totalCost)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {costs.summary.totalRequests} requests
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Budget Usage</CardTitle>
                {costs.summary.budgetUtilization ? (
                  costs.summary.budgetUtilization > 80 ? (
                    <TrendingUp className="w-4 h-4 text-red-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-green-600" />
                  )
                ) : null}
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {costs.summary.budgetUtilization
                    ? `${costs.summary.budgetUtilization.toFixed(1)}%`
                    : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">
                  {costs.summary.monthlyBudget
                    ? `of ${formatCurrency(costs.summary.monthlyBudget)}`
                    : 'No budget set'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Cost/Request</CardTitle>
                <DollarSign className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(costs.summary.avgCostPerRequest)}
                </div>
                <p className="text-xs text-muted-foreground">Per analysis</p>
              </CardContent>
            </Card>
          </div>

          {/* By Provider */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Provider</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {costs.byProvider.map((provider) => (
                  <div key={provider.provider} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium capitalize">{provider.provider}</p>
                      <p className="text-sm text-muted-foreground">
                        {provider.requestCount} requests • {provider.totalTokens.toLocaleString()}{' '}
                        tokens
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(provider.totalCost)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(provider.avgCostPerRequest)}/req
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* By Task */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Task</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {costs.byTask.map((task) => (
                  <div key={task.taskName} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{task.taskName}</p>
                      <p className="text-sm text-muted-foreground">
                        {task.requestCount} requests
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(task.totalCost)}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(task.avgCostPerRequest)}/req
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No cost data available. Data will appear once the backend is connected.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

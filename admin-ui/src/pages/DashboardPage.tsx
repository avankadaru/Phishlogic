import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Activity, DollarSign, Shield, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface DashboardStats {
  totalAnalyses: number;
  totalCost: number;
  whitelistEntries: number;
  errorRate: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalAnalyses: 0,
    totalCost: 0,
    whitelistEntries: 0,
    errorRate: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load stats from various endpoints
      const [costsRes, whitelistRes, debugRes] = await Promise.all([
        api.get('/admin/costs/summary').catch(() => ({ data: { data: null } })),
        api.get('/admin/whitelist/stats').catch(() => ({ data: { data: null } })),
        api.get('/admin/debug/stats').catch(() => ({ data: { data: null } })),
      ]);

      setStats({
        totalAnalyses: debugRes.data.data?.verdictDistribution?.reduce(
          (sum: number, v: any) => sum + v.count,
          0
        ) || 0,
        totalCost: costsRes.data.data?.summary?.totalCost || 0,
        whitelistEntries: whitelistRes.data.data?.total || 0,
        errorRate: debugRes.data.data?.errorRate || 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Analyses',
      value: loading ? '...' : stats.totalAnalyses.toLocaleString(),
      description: 'Last 24 hours',
      icon: Activity,
      color: 'text-blue-600',
    },
    {
      title: 'Total Cost',
      value: loading ? '...' : formatCurrency(stats.totalCost),
      description: 'Current month',
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      title: 'Whitelist Entries',
      value: loading ? '...' : stats.whitelistEntries.toString(),
      description: 'Active entries',
      icon: Shield,
      color: 'text-purple-600',
    },
    {
      title: 'Error Rate',
      value: loading ? '...' : `${stats.errorRate.toFixed(1)}%`,
      description: 'Last hour',
      icon: AlertTriangle,
      color: stats.errorRate > 5 ? 'text-red-600' : 'text-yellow-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to PhishLogic Admin</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administration tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/tasks"
              className="block px-4 py-2 rounded-md hover:bg-accent transition-colors"
            >
              Configure Tasks
            </a>
            <a
              href="/whitelist"
              className="block px-4 py-2 rounded-md hover:bg-accent transition-colors"
            >
              Manage Whitelist
            </a>
            <a
              href="/costs"
              className="block px-4 py-2 rounded-md hover:bg-accent transition-colors"
            >
              View Cost Analytics
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Current system health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">API Status</span>
              <span className="text-sm font-medium text-green-600">Operational</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Database</span>
              <span className="text-sm font-medium text-green-600">Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Last Updated</span>
              <span className="text-sm text-muted-foreground">Just now</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              <p>No recent activity to display.</p>
              <p className="mt-2">Check the Debug page for detailed logs.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

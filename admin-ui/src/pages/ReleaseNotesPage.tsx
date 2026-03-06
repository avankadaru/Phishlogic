import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ChevronDown, ChevronUp, Package, Bug, Wrench, AlertTriangle } from 'lucide-react';
import type { ReleaseNote } from '@/types';

// Mock release notes data
const mockReleaseNotes: ReleaseNote[] = [
  {
    version: '1.2.0',
    date: '2026-03-06',
    features: [
      'Central AI Model Configuration - Configure AI models once and reuse across all tasks',
      'Enhanced Tasks Page - View execution mode details (Native/Hybrid/AI)',
      'Support System - Built-in issue reporting and feature request submission',
      'Release Notes Page - Track all changes and updates in one place',
    ],
    bugFixes: [
      'Fixed SMTP configuration validation errors',
      'Resolved task status toggle not persisting',
      'Corrected cost analytics rounding issues',
    ],
    improvements: [
      'Improved task grouping by analyzer type',
      'Enhanced mode descriptions with visual indicators',
      'Better error messages for failed API calls',
      'Optimized database queries for whitelist checks',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-02-15',
    features: [
      'Notification System - Email, Webhook, and Slack integrations',
      'Cost Analytics Dashboard - Track AI API usage and costs',
      'Whitelist Management - Bypass analysis for trusted sources',
      'System Settings - Centralized configuration management',
    ],
    bugFixes: [
      'Fixed authentication token expiration handling',
      'Resolved pagination issues in debug view',
      'Corrected timezone display in audit logs',
    ],
    improvements: [
      'Added batch email notifications',
      'Enhanced debug interface with filtering',
      'Improved whitelist performance with indexing',
      'Better mobile responsiveness',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-01-10',
    features: [
      'Admin Dashboard - Complete admin interface',
      'Task Configuration - Enable/disable analyzers',
      'Debug Interface - View analysis history and errors',
      'Authentication - Secure login system',
      'User Management - Role-based access control',
    ],
    bugFixes: [],
    improvements: [
      'Initial production release',
      '6 analyzers: SPF, DKIM, Header, URL Pattern, Form Detection, Redirect',
      'REST API with comprehensive documentation',
    ],
    breaking: [
      'API v1 endpoints now require authentication',
      'Database schema migrations required from beta',
    ],
  },
];

export default function ReleaseNotesPage() {
  const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({
    [mockReleaseNotes[0].version]: true, // Expand latest version by default
  });

  const toggleVersion = (version: string) => {
    setExpandedVersions(prev => ({
      ...prev,
      [version]: !prev[version],
    }));
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Release Notes</h1>
        <p className="text-muted-foreground">
          Track new features, improvements, and bug fixes across versions
        </p>
      </div>

      <div className="space-y-4">
        {mockReleaseNotes.map((release) => {
          const isExpanded = expandedVersions[release.version];
          const isLatest = release.version === mockReleaseNotes[0].version;

          return (
            <Card key={release.version}>
              <CardHeader>
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleVersion(release.version)}
                >
                  <div className="flex items-center space-x-3">
                    <Package className="w-5 h-5 text-primary" />
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <span>Version {release.version}</span>
                        {isLatest && (
                          <Badge variant="default" className="ml-2">
                            Latest
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription>{formatDate(release.date)}</CardDescription>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="space-y-4">
                  {/* Breaking Changes */}
                  {release.breaking && release.breaking.length > 0 && (
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-destructive" />
                        <h3 className="text-sm font-semibold text-destructive">
                          Breaking Changes
                        </h3>
                      </div>
                      <ul className="space-y-1 ml-6">
                        {release.breaking.map((item, index) => (
                          <li key={index} className="text-sm text-muted-foreground list-disc">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* New Features */}
                  {release.features.length > 0 && (
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Package className="w-4 h-4 text-green-600" />
                        <h3 className="text-sm font-semibold text-green-600">New Features</h3>
                      </div>
                      <ul className="space-y-1 ml-6">
                        {release.features.map((feature, index) => (
                          <li key={index} className="text-sm text-muted-foreground list-disc">
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvements */}
                  {release.improvements.length > 0 && (
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Wrench className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-semibold text-blue-600">Improvements</h3>
                      </div>
                      <ul className="space-y-1 ml-6">
                        {release.improvements.map((improvement, index) => (
                          <li key={index} className="text-sm text-muted-foreground list-disc">
                            {improvement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Bug Fixes */}
                  {release.bugFixes.length > 0 && (
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Bug className="w-4 h-4 text-orange-600" />
                        <h3 className="text-sm font-semibold text-orange-600">Bug Fixes</h3>
                      </div>
                      <ul className="space-y-1 ml-6">
                        {release.bugFixes.map((bugFix, index) => (
                          <li key={index} className="text-sm text-muted-foreground list-disc">
                            {bugFix}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Future Enhancement Notice */}
      <Card className="border-dashed">
        <CardContent className="py-6">
          <p className="text-center text-sm text-muted-foreground">
            Release notes are currently displayed from static data. In a future update, these will
            be automatically generated from your deployment pipeline and synchronized with version
            control tags.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Key, Copy, Trash2, Plus, Eye, EyeOff } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface APIKey {
  id: string;
  name: string;
  keyPrefix: string;
  userName?: string;
  userEmail?: string;
  scopes: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

export default function APIKeysPage() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKeyData, setNewKeyData] = useState({
    name: '',
    userName: '',
    userEmail: '',
    scopes: ['read', 'write'] as string[],
    expiresInDays: 365,
  });
  const [generatedKey, setGeneratedKey] = useState<{ key: string; prefix: string } | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    try {
      const response = await api.get('/admin/keys');
      setKeys(response.data.data || []);
    } catch (error) {
      console.error('Failed to load API keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newKeyData.name.trim()) {
      alert('Please enter a key name');
      return;
    }

    setCreating(true);
    try {
      const response = await api.post('/admin/keys', {
        name: newKeyData.name,
        userName: newKeyData.userName || undefined,
        userEmail: newKeyData.userEmail || undefined,
        scopes: newKeyData.scopes,
        expiresInDays: newKeyData.expiresInDays > 0 ? newKeyData.expiresInDays : undefined,
      });

      setGeneratedKey({
        key: response.data.apiKey,
        prefix: response.data.keyPrefix,
      });

      setNewKeyData({
        name: '',
        userName: '',
        userEmail: '',
        scopes: ['read', 'write'],
        expiresInDays: 365,
      });

      await loadKeys();
    } catch (error) {
      console.error('Failed to create API key:', error);
      alert('Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke the API key "${name}"?`)) return;

    try {
      await api.delete(`/admin/keys/${id}`);
      await loadKeys();
    } catch (error) {
      console.error('Failed to revoke API key:', error);
      alert('Failed to revoke API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const toggleScope = (scope: string) => {
    setNewKeyData(prev => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter(s => s !== scope)
        : [...prev.scopes, scope]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading API keys...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Create API Key
        </Button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New API Key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Key Name *</label>
              <Input
                placeholder="Production Server"
                value={newKeyData.name}
                onChange={(e) => setNewKeyData({ ...newKeyData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">User Name (optional)</label>
                <Input
                  placeholder="John Doe"
                  value={newKeyData.userName}
                  onChange={(e) => setNewKeyData({ ...newKeyData, userName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">User Email (optional)</label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={newKeyData.userEmail}
                  onChange={(e) => setNewKeyData({ ...newKeyData, userEmail: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Scopes</label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newKeyData.scopes.includes('read')}
                    onChange={() => toggleScope('read')}
                  />
                  <span className="text-sm">Read</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newKeyData.scopes.includes('write')}
                    onChange={() => toggleScope('write')}
                  />
                  <span className="text-sm">Write</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Expires In (days)</label>
              <Input
                type="number"
                min="0"
                placeholder="365 (0 for never)"
                value={newKeyData.expiresInDays}
                onChange={(e) => setNewKeyData({ ...newKeyData, expiresInDays: parseInt(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground mt-1">Set to 0 for no expiration</p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Key'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>

            {/* Generated Key Display */}
            {generatedKey && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                <p className="text-sm font-medium text-green-800 dark:text-green-400 mb-2">
                  ✓ API Key Created Successfully!
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  Make sure to copy your API key now. You won't be able to see it again!
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <code className="flex-1 p-2 bg-white dark:bg-gray-800 border rounded text-sm font-mono break-all">
                    {showKey ? generatedKey.key : '••••••••••••••••••••••••••••••••'}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => copyToClipboard(generatedKey.key)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setGeneratedKey(null);
                    setShowKey(false);
                    setShowCreateForm(false);
                  }}
                >
                  Done
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* API Keys List */}
      <div className="grid gap-4">
        {keys.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No API keys created yet. Click "Create API Key" to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          keys.map((key) => (
            <Card key={key.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Key className="w-5 h-5 text-primary" />
                    <div>
                      <CardTitle>{key.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {key.keyPrefix}••••••••
                        {key.userName && ` • ${key.userName}`}
                        {key.userEmail && ` (${key.userEmail})`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        key.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}
                    >
                      {key.isActive ? 'Active' : 'Revoked'}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Scopes:</span>
                    <div className="flex gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 text-xs rounded-md bg-primary/10 text-primary"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{formatDate(key.createdAt)}</span>
                  </div>

                  {key.lastUsedAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last Used:</span>
                      <span>{formatDate(key.lastUsedAt)}</span>
                    </div>
                  )}

                  {key.expiresAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Expires:</span>
                      <span className={new Date(key.expiresAt) < new Date() ? 'text-destructive' : ''}>
                        {formatDate(key.expiresAt)}
                      </span>
                    </div>
                  )}

                  {key.isActive && (
                    <div className="pt-2 border-t">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRevoke(key.id, key.name)}
                        className="w-full text-destructive"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Revoke Key
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

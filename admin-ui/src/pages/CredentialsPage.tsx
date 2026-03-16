import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Key, Trash2, Plus, Edit2, Check, X, TestTube2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { ApiCredential } from '@/types';

interface CreateCredentialData {
  credentialName: string;
  displayName: string;
  description: string;
  provider: string;
  apiKey: string;
  apiSecret: string;
  endpointUrl: string;
  rateLimitPerDay: number | '';
}

interface EditCredentialData {
  displayName: string;
  description: string;
  apiKey: string;
  apiSecret: string;
  endpointUrl: string;
  rateLimitPerDay: number | '';
  isActive: boolean;
}

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [encryptionSecure, setEncryptionSecure] = useState(true);

  const [newCredential, setNewCredential] = useState<CreateCredentialData>({
    credentialName: '',
    displayName: '',
    description: '',
    provider: '',
    apiKey: '',
    apiSecret: '',
    endpointUrl: '',
    rateLimitPerDay: '',
  });

  const [editData, setEditData] = useState<EditCredentialData>({
    displayName: '',
    description: '',
    apiKey: '',
    apiSecret: '',
    endpointUrl: '',
    rateLimitPerDay: '',
    isActive: true,
  });

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const response = await api.get<{ credentials: ApiCredential[]; encryptionSecure: boolean }>(
        '/admin/credentials'
      );
      setCredentials(response.data.credentials || []);
      setEncryptionSecure(response.data.encryptionSecure);
    } catch (error) {
      console.error('Failed to load credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newCredential.credentialName.trim()) {
      alert('Please enter a credential name (lowercase, numbers, underscores only)');
      return;
    }
    if (!newCredential.displayName.trim()) {
      alert('Please enter a display name');
      return;
    }
    if (!newCredential.provider.trim()) {
      alert('Please enter a provider name');
      return;
    }
    if (!newCredential.apiKey.trim()) {
      alert('Please enter an API key');
      return;
    }

    setCreating(true);
    try {
      await api.post('/admin/credentials', {
        credentialName: newCredential.credentialName,
        displayName: newCredential.displayName,
        description: newCredential.description || undefined,
        provider: newCredential.provider,
        apiKey: newCredential.apiKey,
        apiSecret: newCredential.apiSecret || undefined,
        endpointUrl: newCredential.endpointUrl || undefined,
        rateLimitPerDay: newCredential.rateLimitPerDay || undefined,
      });

      setNewCredential({
        credentialName: '',
        displayName: '',
        description: '',
        provider: '',
        apiKey: '',
        apiSecret: '',
        endpointUrl: '',
        rateLimitPerDay: '',
      });

      setShowCreateForm(false);
      await loadCredentials();
    } catch (error: any) {
      console.error('Failed to create credential:', error);
      alert(error.response?.data?.error || 'Failed to create credential');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (credential: ApiCredential) => {
    setEditingId(credential.id);
    setEditData({
      displayName: credential.displayName,
      description: credential.description || '',
      apiKey: '', // Don't pre-fill encrypted keys
      apiSecret: '',
      endpointUrl: credential.endpointUrl || '',
      rateLimitPerDay: credential.rateLimitPerDay || '',
      isActive: credential.isActive,
    });
  };

  const handleUpdate = async (id: string) => {
    setCreating(true);
    try {
      // Build update payload (only include non-empty fields)
      const updatePayload: any = {};
      if (editData.displayName.trim()) updatePayload.displayName = editData.displayName;
      if (editData.description.trim()) updatePayload.description = editData.description;
      if (editData.apiKey.trim()) updatePayload.apiKey = editData.apiKey;
      if (editData.apiSecret.trim()) updatePayload.apiSecret = editData.apiSecret;
      if (editData.endpointUrl.trim()) updatePayload.endpointUrl = editData.endpointUrl;
      if (editData.rateLimitPerDay) updatePayload.rateLimitPerDay = editData.rateLimitPerDay;
      updatePayload.isActive = editData.isActive;

      await api.put(`/admin/credentials/${id}`, updatePayload);

      setEditingId(null);
      await loadCredentials();
    } catch (error: any) {
      console.error('Failed to update credential:', error);
      alert(error.response?.data?.error || 'Failed to update credential');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, displayName: string) => {
    if (!confirm(`Are you sure you want to delete "${displayName}"?`)) return;

    try {
      await api.delete(`/admin/credentials/${id}`);
      await loadCredentials();
    } catch (error) {
      console.error('Failed to delete credential:', error);
      alert('Failed to delete credential');
    }
  };

  const handleTest = async (id: string, displayName: string) => {
    setTesting(id);
    try {
      const response = await api.post(`/admin/credentials/${id}/test`);
      alert(`✓ ${response.data.message || `Credential for ${displayName} is valid`}`);
    } catch (error: any) {
      console.error('Failed to test credential:', error);
      alert(`✗ Test failed: ${error.response?.data?.message || 'Unknown error'}`);
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading API credentials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Credentials</h1>
          <p className="text-muted-foreground">
            Manage external API credentials for VirusTotal, Google Safe Browsing, etc.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Credential
        </Button>
      </div>

      {/* Security Warning */}
      {!encryptionSecure && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="text-yellow-600 dark:text-yellow-400">⚠️</div>
              <div>
                <p className="font-medium text-yellow-800 dark:text-yellow-200">
                  Insecure Encryption Key
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  API credentials are encrypted with a development key. Set ENCRYPTION_KEY environment
                  variable (32+ characters) for production use.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New API Credential</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Credential Name * (lowercase_underscore)</label>
                <Input
                  placeholder="virustotal_api"
                  value={newCredential.credentialName}
                  onChange={(e) =>
                    setNewCredential({ ...newCredential, credentialName: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Display Name *</label>
                <Input
                  placeholder="VirusTotal API"
                  value={newCredential.displayName}
                  onChange={(e) =>
                    setNewCredential({ ...newCredential, displayName: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="VirusTotal API for URL/file reputation checks"
                value={newCredential.description}
                onChange={(e) =>
                  setNewCredential({ ...newCredential, description: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Provider *</label>
                <Input
                  placeholder="virustotal"
                  value={newCredential.provider}
                  onChange={(e) => setNewCredential({ ...newCredential, provider: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Rate Limit (per day)</label>
                <Input
                  type="number"
                  placeholder="500"
                  value={newCredential.rateLimitPerDay}
                  onChange={(e) =>
                    setNewCredential({
                      ...newCredential,
                      rateLimitPerDay: e.target.value ? Number(e.target.value) : '',
                    })
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">API Key *</label>
              <Input
                type="password"
                placeholder="Your API key (will be encrypted)"
                value={newCredential.apiKey}
                onChange={(e) => setNewCredential({ ...newCredential, apiKey: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">API Secret (optional)</label>
              <Input
                type="password"
                placeholder="For OAuth or multi-part credentials"
                value={newCredential.apiSecret}
                onChange={(e) => setNewCredential({ ...newCredential, apiSecret: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Custom Endpoint URL (optional)</label>
              <Input
                type="url"
                placeholder="https://api.provider.com/v1"
                value={newCredential.endpointUrl}
                onChange={(e) =>
                  setNewCredential({ ...newCredential, endpointUrl: e.target.value })
                }
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Credential'}
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credentials List */}
      <div className="grid gap-4">
        {credentials.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Key className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No API credentials configured yet. Add credentials to enable external service integrations.
              </p>
            </CardContent>
          </Card>
        ) : (
          credentials.map((credential) => (
            <Card key={credential.id}>
              <CardContent className="pt-6">
                {editingId === credential.id ? (
                  // Edit Mode
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium">Display Name</label>
                        <Input
                          value={editData.displayName}
                          onChange={(e) => setEditData({ ...editData, displayName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Rate Limit (per day)</label>
                        <Input
                          type="number"
                          value={editData.rateLimitPerDay}
                          onChange={(e) =>
                            setEditData({
                              ...editData,
                              rateLimitPerDay: e.target.value ? Number(e.target.value) : '',
                            })
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Input
                        value={editData.description}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">New API Key (leave blank to keep existing)</label>
                      <Input
                        type="password"
                        placeholder="Enter new API key to update"
                        value={editData.apiKey}
                        onChange={(e) => setEditData({ ...editData, apiKey: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">New API Secret (optional)</label>
                      <Input
                        type="password"
                        placeholder="Enter new API secret to update"
                        value={editData.apiSecret}
                        onChange={(e) => setEditData({ ...editData, apiSecret: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Custom Endpoint URL</label>
                      <Input
                        type="url"
                        value={editData.endpointUrl}
                        onChange={(e) => setEditData({ ...editData, endpointUrl: e.target.value })}
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editData.isActive}
                        onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <label className="text-sm font-medium">Active</label>
                    </div>

                    <div className="flex gap-2">
                      <Button onClick={() => handleUpdate(credential.id)} disabled={creating}>
                        <Check className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                      <Button variant="outline" onClick={() => setEditingId(null)}>
                        <X className="w-4 h-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // View Mode
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold">{credential.displayName}</h3>
                          <span
                            className={`px-2 py-1 text-xs rounded ${
                              credential.isActive
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                            }`}
                          >
                            {credential.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {credential.description || 'No description'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Credential Name:</span>
                        <span className="ml-2 font-mono">{credential.credentialName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Provider:</span>
                        <span className="ml-2">{credential.provider}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">API Key:</span>
                        <span className="ml-2 font-mono">{credential.apiKeySanitized}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Has Secret:</span>
                        <span className="ml-2">{credential.hasApiSecret ? 'Yes' : 'No'}</span>
                      </div>
                      {credential.endpointUrl && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Endpoint:</span>
                          <span className="ml-2 font-mono text-xs">{credential.endpointUrl}</span>
                        </div>
                      )}
                      {credential.rateLimitPerDay && (
                        <div>
                          <span className="text-muted-foreground">Rate Limit:</span>
                          <span className="ml-2">{credential.rateLimitPerDay.toLocaleString()}/day</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Created:</span>
                        <span className="ml-2">{formatDate(credential.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(credential.id, credential.displayName)}
                        disabled={testing === credential.id}
                      >
                        <TestTube2 className="w-4 h-4 mr-2" />
                        {testing === credential.id ? 'Testing...' : 'Test'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => startEdit(credential)}>
                        <Edit2 className="w-4 h-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(credential.id, credential.displayName)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

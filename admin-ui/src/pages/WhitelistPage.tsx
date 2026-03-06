import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { WhitelistEntry, WhitelistType } from '@/types';
import { Shield, Plus, Trash2 } from 'lucide-react';

export default function WhitelistPage() {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newEntry, setNewEntry] = useState({
    type: 'domain' as WhitelistType,
    value: '',
    description: '',
  });

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      const response = await api.get('/admin/whitelist');
      setEntries(response.data.data || []);
    } catch (error) {
      console.error('Failed to load whitelist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newEntry.value.trim()) return;

    try {
      await api.post('/admin/whitelist', newEntry);
      setNewEntry({ type: 'domain', value: '', description: '' });
      setShowAdd(false);
      await loadEntries();
    } catch (error) {
      console.error('Failed to add entry:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    try {
      await api.delete(`/admin/whitelist/${id}`);
      await loadEntries();
    } catch (error) {
      console.error('Failed to delete entry:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading whitelist...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Whitelist Management</h1>
          <p className="text-muted-foreground">Manage trusted emails, domains, and URLs</p>
        </div>
        <Button onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Entry
        </Button>
      </div>

      {/* Add Entry Form */}
      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle>Add Whitelist Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Type</label>
              <div className="flex space-x-2">
                {(['email', 'domain', 'url'] as const).map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant={newEntry.type === type ? 'default' : 'outline'}
                    onClick={() => setNewEntry({ ...newEntry, type })}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Value</label>
              <Input
                placeholder={`Enter ${newEntry.type}...`}
                value={newEntry.value}
                onChange={(e) => setNewEntry({ ...newEntry, value: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Description (Optional)</label>
              <Input
                placeholder="Why is this trusted?"
                value={newEntry.description}
                onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
              />
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleAdd}>Add Entry</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entries List */}
      <div className="grid gap-4">
        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No whitelist entries. Add your first trusted source above.
              </p>
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <Shield className="w-5 h-5 text-green-600" />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{entry.value}</span>
                        <span className="px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary">
                          {entry.type}
                        </span>
                      </div>
                      {entry.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {entry.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

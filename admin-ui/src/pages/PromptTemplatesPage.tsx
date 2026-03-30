import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, FileText, Copy } from 'lucide-react';
import { PromptTemplateEditor } from '@/components/PromptTemplateEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import api from '@/lib/api';

interface Template {
  id: string;
  name: string;
  displayName: string;
  description: string;
  userPrompt: string;
  systemPrompt?: string;
  promptType: 'system' | 'user' | 'combined';
  inputType: 'email' | 'url' | 'both';
  isSystemTemplate?: boolean;
  costTier?: string;
  tokenEstimate?: number;
  accuracyTarget?: number;
}

export const PromptTemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/admin/prompt-templates');
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error('Failed to load prompt templates:', error);
      setError('Failed to load templates. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDetails = async (templateId: string): Promise<Template | null> => {
    try {
      setLoadingTemplate(true);
      const response = await api.get(`/admin/prompt-templates/${templateId}`);
      return response.data.template;
    } catch (error) {
      console.error('Failed to load template details:', error);
      alert('Failed to load template details. Please try again.');
      return null;
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleSave = async (templateData: any) => {
    try {
      if (editingTemplate?.id) {
        await api.put(`/admin/prompt-templates/${editingTemplate.id}`, templateData);
      } else {
        await api.post('/admin/prompt-templates', templateData);
      }

      setShowEditor(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('Failed to save template. Please try again.');
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template? This cannot be undone.')) {
      return;
    }

    try {
      await api.delete(`/admin/prompt-templates/${templateId}`);
      loadTemplates();
    } catch (error) {
      alert('Failed to delete template');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prompt Templates</h1>
          <p className="text-muted-foreground">
            Manage AI analysis templates with custom evaluation criteria
          </p>
        </div>
        {!showEditor && (
          <Button onClick={() => {
            setEditingTemplate(null);
            setShowEditor(true);
          }}>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Editor or List View */}
      {showEditor ? (
        <Card>
          <CardContent className="pt-6">
            <PromptTemplateEditor
              template={editingTemplate || undefined}
              onSave={handleSave}
              onCancel={() => {
                setShowEditor(false);
                setEditingTemplate(null);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No templates found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Create your first template to get started
                </p>
                <Button onClick={() => {
                  setEditingTemplate(null);
                  setShowEditor(true);
                }}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Your First Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            templates.map((template: any) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-xl">{template.displayName}</CardTitle>
                        {template.isSystemTemplate && (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                            System Template
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          // Fetch full template details including prompts
                          const fullTemplate = await loadTemplateDetails(template.id);
                          if (fullTemplate) {
                            setEditingTemplate(fullTemplate);
                            setShowEditor(true);
                          }
                        }}
                        disabled={loadingTemplate}
                      >
                        <Edit2 className="w-4 h-4 mr-2" />
                        {template.isSystemTemplate ? 'View' : 'Edit'}
                      </Button>
                      {!template.isSystemTemplate && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Template ID */}
                  <div className="mb-3 flex items-center gap-2 text-xs bg-muted p-3 rounded-md">
                    <span className="font-medium text-muted-foreground">Template ID:</span>
                    <code className="bg-background px-2 py-1 rounded border font-mono flex-1">
                      {template.id}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(template.id);
                        alert('Template ID copied to clipboard!');
                      }}
                      className="h-6 px-2"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Machine Name */}
                  <div className="mb-3 text-xs">
                    <span className="text-muted-foreground">Machine Name:</span>
                    <code className="ml-2 bg-muted px-2 py-1 rounded">
                      {template.name}
                    </code>
                  </div>

                  {/* Metadata Tags */}
                  <div className="flex gap-2 text-xs flex-wrap">
                    {template.costTier && (
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {template.costTier}
                      </span>
                    )}
                    {template.tokenEstimate && (
                      <span className="bg-gray-100 px-2 py-1 rounded">
                        ~{template.tokenEstimate} tokens
                      </span>
                    )}
                    {template.accuracyTarget && (
                      <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                        {(template.accuracyTarget * 100).toFixed(0)}% accuracy
                      </span>
                    )}
                    <span className="bg-gray-100 px-2 py-1 rounded">
                      {template.promptType}
                    </span>
                    <span className="bg-gray-100 px-2 py-1 rounded">
                      {template.inputType}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};

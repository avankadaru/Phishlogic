import { useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { AlertCircle, CheckCircle, MessageSquare } from 'lucide-react';

const CATEGORIES = [
  { value: 'general', label: 'General Question' },
  { value: 'settings', label: 'Settings & Configuration' },
  { value: 'tasks', label: 'Task Management' },
  { value: 'ai-models', label: 'AI Model Configuration' },
  { value: 'debug', label: 'Debug & Analytics' },
  { value: 'cost', label: 'Cost Tracking' },
  { value: 'whitelist', label: 'Whitelist Management' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'authentication', label: 'Authentication & Security' },
  { value: 'performance', label: 'Performance Issues' },
  { value: 'other', label: 'Other' },
];

export default function SupportPage() {
  const [requestType, setRequestType] = useState<'issue' | 'improvement'>('issue');
  const [category, setCategory] = useState('general');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [preferredContactTime, setPreferredContactTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (description.length < 20) {
      setError('Please provide at least 20 characters in the description');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/admin/support', {
        requestType,
        category,
        description,
        email: email || undefined,
        preferredContactTime: preferredContactTime || undefined,
      });

      setSubmitted(true);
      // Reset form
      setDescription('');
      setEmail('');
      setPreferredContactTime('');
      setCategory('general');

      // Hide success message after 5 seconds
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit support request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold">Support & Feedback</h1>
        <p className="text-muted-foreground">
          Report issues, suggest improvements, or ask questions
        </p>
      </div>

      {/* Success Message */}
      {submitted && (
        <Card className="border-green-600 bg-green-50 dark:bg-green-900/20">
          <CardContent className="py-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-600 font-medium">
                Support request submitted successfully! We'll review it shortly.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Support Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <MessageSquare className="w-5 h-5" />
            <span>Submit a Request</span>
          </CardTitle>
          <CardDescription>
            Help us improve PhishLogic by reporting issues or suggesting new features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Request Type */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Request Type <span className="text-destructive">*</span>
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="requestType"
                    value="issue"
                    checked={requestType === 'issue'}
                    onChange={(e) => setRequestType(e.target.value as 'issue')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Report an Issue</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="requestType"
                    value="improvement"
                    checked={requestType === 'improvement'}
                    onChange={(e) => setRequestType(e.target.value as 'improvement')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Suggest an Improvement</span>
                </label>
              </div>
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium mb-2">
                Category <span className="text-destructive">*</span>
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                required
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium mb-2">
                Description <span className="text-destructive">*</span>
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  requestType === 'issue'
                    ? 'Please describe the issue you encountered, including steps to reproduce it...'
                    : 'Please describe the improvement or feature you would like to see...'
                }
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[120px]"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 20 characters ({description.length}/20)
              </p>
            </div>

            {/* Optional Contact Information */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">
                Contact Information <span className="text-muted-foreground">(Optional)</span>
              </h3>

              <div className="space-y-3">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@company.com"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Provide your email if you'd like updates on this request
                  </p>
                </div>

                {/* Preferred Contact Time */}
                <div>
                  <label htmlFor="contactTime" className="block text-sm font-medium mb-2">
                    Preferred Contact Time
                  </label>
                  <input
                    id="contactTime"
                    type="text"
                    value={preferredContactTime}
                    onChange={(e) => setPreferredContactTime(e.target.value)}
                    placeholder="e.g., Weekdays 9AM-5PM EST"
                    className="w-full border rounded-md px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start space-x-2 p-3 bg-destructive/10 border border-destructive rounded-md">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDescription('');
                  setEmail('');
                  setPreferredContactTime('');
                  setError('');
                }}
                disabled={submitting}
              >
                Clear Form
              </Button>
              <Button type="submit" disabled={submitting || description.length < 20}>
                {submitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Help Text */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <h3 className="text-sm font-semibold mb-2">Tips for Effective Requests</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li className="flex items-start space-x-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong>Issues:</strong> Include steps to reproduce, expected vs. actual behavior,
                and any error messages
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong>Improvements:</strong> Explain the use case and how it would benefit your
                workflow
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong>Screenshots:</strong> If applicable, attach screenshots or error logs to
                help us understand
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

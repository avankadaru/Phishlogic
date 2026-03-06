import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { NotificationConfig } from '@/types';
import { Bell, BellOff, Trash2 } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const response = await api.get('/admin/notifications');
      setNotifications(response.data.data || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, currentState: boolean) => {
    try {
      await api.put(`/admin/notifications/${id}`, {
        enabled: !currentState,
      });
      await loadNotifications();
    } catch (error) {
      console.error('Failed to update notification:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) return;

    try {
      await api.delete(`/admin/notifications/${id}`);
      await loadNotifications();
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading notifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground">Configure alerts and webhooks</p>
        </div>
      </div>

      <div className="grid gap-4">
        {notifications.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                No notifications configured. Notification configs will appear here once the backend
                is connected.
              </p>
            </CardContent>
          </Card>
        ) : (
          notifications.map((notification) => (
            <Card key={notification.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {notification.enabled ? (
                      <Bell className="w-5 h-5 text-primary" />
                    ) : (
                      <BellOff className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle>{notification.name}</CardTitle>
                      <p className="text-sm text-muted-foreground capitalize">
                        {notification.type} • {notification.triggers.length} triggers
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        notification.enabled
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                      }`}
                    >
                      {notification.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Config Details */}
                  <div className="text-sm">
                    {notification.type === 'webhook' && notification.config.url && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">URL:</span> {notification.config.url}
                      </p>
                    )}
                    {notification.type === 'email' && notification.config.email && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Email:</span> {notification.config.email}
                      </p>
                    )}
                    {notification.type === 'slack' && notification.config.slackChannel && (
                      <p className="text-muted-foreground">
                        <span className="font-medium">Channel:</span>{' '}
                        {notification.config.slackChannel}
                      </p>
                    )}
                  </div>

                  {/* Triggers */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Triggers:</p>
                    <div className="flex flex-wrap gap-1">
                      {notification.triggers.map((trigger) => (
                        <span
                          key={trigger}
                          className="px-2 py-0.5 text-xs rounded-md bg-primary/10 text-primary"
                        >
                          {trigger}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <div className="text-xs text-muted-foreground">
                      {notification.lastTriggeredAt && (
                        <p>Last triggered: {new Date(notification.lastTriggeredAt).toLocaleString()}</p>
                      )}
                      {notification.errorCount > 0 && (
                        <p className="text-destructive">Errors: {notification.errorCount}</p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggle(notification.id, notification.enabled)}
                      >
                        {notification.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(notification.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

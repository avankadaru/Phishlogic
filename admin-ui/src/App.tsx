import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import TasksPage from '@/pages/TasksPage';
import CostsPage from '@/pages/CostsPage';
import WhitelistPage from '@/pages/WhitelistPage';
import DebugPage from '@/pages/DebugPage';
import SettingsPage from '@/pages/SettingsPage';
import APIKeysPage from '@/pages/APIKeysPage';
import CredentialsPage from '@/pages/CredentialsPage';
import ReleaseNotesPage from '@/pages/ReleaseNotesPage';
import SupportPage from '@/pages/SupportPage';
import EmailTestPage from '@/pages/EmailTestPage';
import UrlTestPage from '@/pages/UrlTestPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <DashboardPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <TasksPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/costs"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <CostsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/whitelist"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <WhitelistPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/debug"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <DebugPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/testing/email"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <EmailTestPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/testing/url"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <UrlTestPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <SettingsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-keys"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <APIKeysPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      {/* Temporarily hidden from UI - keeping code for future use
      <Route
        path="/credentials"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <CredentialsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      */}
      <Route
        path="/release-notes"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <ReleaseNotesPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <SupportPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;

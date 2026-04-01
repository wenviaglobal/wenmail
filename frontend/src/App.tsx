import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { useAuth } from "./hooks/use-auth";
import { usePortalAuth } from "./hooks/use-portal-auth";
import { Layout } from "./components/layout";
import { PortalLayout } from "./components/portal-layout";

// Admin pages
import { LoginPage } from "./pages/login";
import { DashboardPage } from "./pages/dashboard";
import { ClientListPage } from "./pages/clients/list";
import { ClientDetailPage } from "./pages/clients/detail";
import { DomainListPage } from "./pages/domains/list";
import { DomainDetailPage } from "./pages/domains/detail";
import { MailboxListPage } from "./pages/mailboxes/list";
import { AliasListPage } from "./pages/aliases/list";
import { MailLogsPage } from "./pages/logs/mail";
import { AuditLogsPage } from "./pages/logs/audit";
import { ServerHealthPage } from "./pages/admin/server-health";
import { ClientControlsPage } from "./pages/admin/client-controls";
import { AdminBillingPage } from "./pages/admin/billing";
import { AdminSettingsPage } from "./pages/admin/settings";

// Client Portal pages
import { PortalLoginPage } from "./pages/portal/login";
import { PortalDashboardPage } from "./pages/portal/dashboard";
import { PortalDomainsPage } from "./pages/portal/domains";
import { PortalMailboxesPage } from "./pages/portal/mailboxes";
import { PortalAliasesPage } from "./pages/portal/aliases";
import { PortalLogsPage } from "./pages/portal/logs";
import { PortalBillingPage } from "./pages/portal/billing";
import { PortalMigrationPage } from "./pages/portal/migration";
import { PortalDnsSetupPage } from "./pages/portal/dns-setup";
import { PortalGettingStartedPage } from "./pages/portal/getting-started";

function AdminProtected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function PortalProtected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = usePortalAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-slate-400">Loading...</div>;
  if (!isAuthenticated) return <Navigate to="/portal/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ============================== */}
        {/* Admin routes */}
        {/* ============================== */}
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <AdminProtected>
              <Layout />
            </AdminProtected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientListPage />} />
          <Route path="clients/:id" element={<ClientDetailPage />} />
          <Route path="clients/:id/controls" element={<ClientControlsPage />} />
          <Route path="domains" element={<DomainListPage />} />
          <Route path="domains/:id" element={<DomainDetailPage />} />
          <Route path="mailboxes" element={<MailboxListPage />} />
          <Route path="aliases" element={<AliasListPage />} />
          <Route path="logs/mail" element={<MailLogsPage />} />
          <Route path="logs/audit" element={<AuditLogsPage />} />
          <Route path="billing" element={<AdminBillingPage />} />
          <Route path="server" element={<ServerHealthPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>

        {/* ============================== */}
        {/* Client Portal routes */}
        {/* ============================== */}
        <Route path="/portal/login" element={<PortalLoginPage />} />
        <Route
          path="/portal"
          element={
            <PortalProtected>
              <PortalLayout />
            </PortalProtected>
          }
        >
          <Route index element={<PortalDashboardPage />} />
          <Route path="getting-started" element={<PortalGettingStartedPage />} />
          <Route path="domains" element={<PortalDomainsPage />} />
          <Route path="domains/:id/dns-setup" element={<PortalDnsSetupPage />} />
          <Route path="mailboxes" element={<PortalMailboxesPage />} />
          <Route path="aliases" element={<PortalAliasesPage />} />
          <Route path="logs" element={<PortalLogsPage />} />
          <Route path="billing" element={<PortalBillingPage />} />
          <Route path="migration" element={<PortalMigrationPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

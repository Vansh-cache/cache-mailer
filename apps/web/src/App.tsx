import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { api, ensureCsrf } from "./lib/api";
import { CampaignReportPage } from "./pages/CampaignReport";
import { CampaignWizardPage, CampaignsPage } from "./pages/Campaigns";
import { ContactDetailPage } from "./pages/ContactDetail";
import { ContactsPage } from "./pages/Contacts";
import { DashboardPage } from "./pages/Dashboard";
import { EditorPage } from "./pages/Editor";
import { AuditPage } from "./pages/Audit";
import { GrowthPage } from "./pages/Growth";
import { HealthPage } from "./pages/Health";
import { LoginPage } from "./pages/Login";
import { MailboxesPage } from "./pages/Mailboxes";
import { SettingsPage } from "./pages/Settings";
import { TemplatesPage } from "./pages/Templates";
import { UsersPage } from "./pages/Users";
import { useEffect } from "react";

function Shell() {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  if (me.isLoading) return <div className="grid h-screen place-items-center">Loading…</div>;
  if (me.isError || !me.data) return <Navigate to="/login" replace />;
  return (
    <Routes>
      <Route element={<Layout user={me.data.user} />}>
        <Route index element={<DashboardPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="audience" element={<Navigate to="/contacts" replace />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/:id" element={<EditorPage />} />
        <Route path="campaigns" element={<CampaignsPage />} />
        <Route path="campaigns/new" element={<CampaignWizardPage />} />
        <Route path="campaigns/:id" element={<CampaignReportPage />} />
        <Route path="growth" element={<GrowthPage />} />
        <Route path="mailboxes" element={<MailboxesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={me.data.user.role === "admin" ? <UsersPage /> : <Navigate to="/" replace />} />
        <Route path="health" element={me.data.user.role === "admin" ? <HealthPage /> : <Navigate to="/" replace />} />
        <Route path="audit" element={me.data.user.role === "admin" ? <AuditPage /> : <Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  useEffect(() => {
    ensureCsrf().catch(() => undefined);
  }, []);
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={<Shell />} />
    </Routes>
  );
}

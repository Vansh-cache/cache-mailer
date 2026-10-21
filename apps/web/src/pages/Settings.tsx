import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Field, PageHeader, inputClass } from "../components/ui";
import { api } from "../lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const zoho = useQuery({ queryKey: ["zoho"], queryFn: api.zohoStatus });
  const [company, setCompany] = useState("");
  const [address, setAddress] = useState("");
  const [smtpHost, setSmtpHost] = useState("smtp.office365.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState("false");
  const [smtpEmail, setSmtpEmail] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  useEffect(() => {
    if (!settings.data) return;
    setCompany(settings.data.settings.company_name ?? "");
    setAddress(settings.data.settings.company_address ?? "");
    setSmtpHost(settings.data.settings.smtp_host ?? "smtp.office365.com");
    setSmtpPort(settings.data.settings.smtp_port ?? "587");
    setSmtpSecure(settings.data.settings.smtp_secure ?? "false");
    setSmtpEmail(settings.data.settings.smtp_email ?? "");
  }, [settings.data]);
  const save = useMutation({
    mutationFn: () => api.saveSettings({ company_name: company, company_address: address }),
    onSuccess: () => toast.success("Settings saved"),
    onError: (error: Error) => toast.error(error.message),
  });
  const saveSmtp = useMutation({
    mutationFn: () => api.saveSettings({
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_secure: smtpSecure,
      smtp_email: smtpEmail,
      ...(smtpPassword ? { smtp_password: smtpPassword } : {}),
    }),
    onSuccess: async () => {
      toast.success("SMTP settings saved");
      setSmtpPassword("");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const sync = useMutation({
    mutationFn: api.zohoSync,
    onSuccess: async () => {
      toast.success("Zoho sync finished");
      await queryClient.invalidateQueries({ queryKey: ["zoho"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid max-w-3xl grid-cols-2 gap-4">
        <form className="panel space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
          <h2 className="font-medium">Company footer</h2>
          <Field label="Company name"><input className={inputClass} value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
          <Field label="Postal address"><textarea className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} /></Field>
          <Button type="submit">Save</Button>
        </form>
        <section className="panel space-y-3 p-4 text-sm">
          <h2 className="font-medium">Zoho CRM</h2>
          <p>{zoho.data?.configured ? "Client configured" : "Add Zoho client id and secret to the server env"} · {zoho.data?.connected ? "connected" : "not connected"}</p>
          {zoho.data?.states.map((state) => (
            <p key={state.module}>{state.module}: {state.lastStatus ?? "never"} {state.lastError ? `— ${state.lastError}` : ""}</p>
          ))}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={async () => {
              const result = await api.zohoAuthUrl();
              window.location.href = result.url;
            }}>Connect Zoho</Button>
            <Button onClick={() => sync.mutate()}>Sync now</Button>
          </div>
        </section>
        {me.data?.user.role === "admin" && (
          <form className="panel col-span-2 space-y-3 p-4" onSubmit={(event) => { event.preventDefault(); saveSmtp.mutate(); }}>
            <h2 className="font-medium">SMTP sending (Nodemailer)</h2>
            <p className="text-sm text-slate-500">
              For Microsoft 365, use smtp.office365.com, port 587, and STARTTLS. The password is encrypted on the server and is never shown again.
              Add a mailbox with the same From email and choose SMTP.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP host"><input className={inputClass} value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} /></Field>
              <Field label="SMTP email"><input className={inputClass} type="email" value={smtpEmail} onChange={(event) => setSmtpEmail(event.target.value)} placeholder="vishakha@cachedigitech.com" /></Field>
              <Field label="Port"><input className={inputClass} type="number" min={1} max={65535} value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} /></Field>
              <Field label="Connection">
                <select className={inputClass} value={smtpSecure} onChange={(event) => setSmtpSecure(event.target.value)}>
                  <option value="false">STARTTLS (587)</option>
                  <option value="true">SSL (465)</option>
                </select>
              </Field>
            </div>
            <Field label="Password or app password">
              <input
                className={inputClass}
                type="password"
                value={smtpPassword}
                onChange={(event) => setSmtpPassword(event.target.value)}
                placeholder={settings.data?.smtpPasswordSet ? "Saved — leave blank to keep it" : "Enter the SMTP password"}
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" disabled={saveSmtp.isPending || !smtpHost.trim() || !smtpEmail.trim()}>Save SMTP</Button>
          </form>
        )}
      </div>
    </div>
  );
}

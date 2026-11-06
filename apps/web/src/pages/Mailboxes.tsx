import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { Badge, Button, Field, PageHeader, inputClass, statusTone } from "../components/ui";
import { api, type Sender } from "../lib/api";

const schema = z.object({
  teamId: z.coerce.number().int().positive(),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().email().or(z.literal("")),
  dailyLimit: z.coerce.number().int().positive(),
  perMinuteLimit: z.coerce.number().int().positive(),
  provider: z.enum(["graph", "smtp"]),
  smtpHost: z.string().max(255),
  smtpPort: z.coerce.number().int(),
  smtpSecure: z.enum(["true", "false"]),
  smtpPassword: z.string().max(512),
}).superRefine((values, ctx) => {
  if (values.provider !== "smtp") return;
  if (!values.smtpHost.trim()) {
    ctx.addIssue({ code: "custom", path: ["smtpHost"], message: "Enter the SMTP host for this mailbox" });
  }
  if (!Number.isInteger(values.smtpPort) || values.smtpPort < 1 || values.smtpPort > 65535) {
    ctx.addIssue({ code: "custom", path: ["smtpPort"], message: "Enter an SMTP port from 1 to 65535" });
  }
  if (!values.smtpPassword.trim()) {
    ctx.addIssue({ code: "custom", path: ["smtpPassword"], message: "Enter the SMTP password for this mailbox" });
  }
});

export function MailboxesPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const senders = useQuery({ queryKey: ["senders"], queryFn: api.senders });
  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const contacts = useQuery({ queryKey: ["test-receivers"], queryFn: () => api.contacts("?pageSize=100") });
  const [testTo, setTestTo] = useState("");
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      dailyLimit: 500,
      perMinuteLimit: 20,
      replyTo: "",
      provider: "smtp",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: "false",
      smtpPassword: "",
    },
  });
  const provider = form.watch("provider");
  const create = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api.createSender({
      teamId: values.teamId,
      fromName: values.fromName,
      fromEmail: values.fromEmail,
      replyTo: values.replyTo || null,
      dailyLimit: values.dailyLimit,
      perMinuteLimit: values.perMinuteLimit,
      provider: values.provider,
      ...(values.provider === "smtp"
        ? {
            smtpHost: values.smtpHost.trim(),
            smtpPort: values.smtpPort,
            smtpSecure: values.smtpSecure === "true",
            smtpPassword: values.smtpPassword,
          }
        : {}),
    }),
    onSuccess: async () => {
      toast.success("Mailbox added");
      form.resetField("smtpPassword");
      await queryClient.invalidateQueries({ queryKey: ["senders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const changeProvider = useMutation({
    mutationFn: (action: { id: number; provider: "graph" | "smtp" }) => api.updateSender(action.id, { provider: action.provider }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["senders"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const test = useMutation({
    mutationFn: (id: number) => api.testSender(id, testTo.trim()),
    onSuccess: () => toast.success(`Test sent to ${testTo.trim()}`),
    onError: (error: Error) => toast.error(error.message),
  });
  const run = useMutation({
    mutationFn: (action: { id: number; kind: "check" | "paused" | "active" }) =>
      action.kind === "check" ? api.checkSender(action.id) : api.updateSender(action.id, { status: action.kind }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["senders"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteSender(id),
    onSuccess: async () => {
      toast.success("Mailbox deleted");
      await queryClient.invalidateQueries({ queryKey: ["senders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div>
      <PageHeader title="Mailboxes" />
      <div className="mb-4 flex max-w-xl gap-2">
        <input
          className={inputClass}
          value={testTo}
          onChange={(event) => setTestTo(event.target.value)}
          placeholder="Test receiver email"
          list="mailbox-test-receiver-options"
          aria-label="Test receiver email"
        />
        <datalist id="mailbox-test-receiver-options">
          {contacts.data?.contacts.map((contact) => <option key={contact.id} value={contact.email}>{contact.email}</option>)}
        </datalist>
      </div>
      <div className="grid grid-cols-[1fr_320px] gap-4">
        <div className="space-y-3">
          {senders.data?.senders.map((sender) => (
            <article key={sender.id} className="panel p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{sender.fromName}</div>
                  <div className="text-sm text-slate-500">{sender.fromEmail} · {sender.team.name} · {sender.provider === "smtp" ? "SMTP" : "Microsoft 365"} · {sender.dailyLimit}/day</div>
                </div>
                <Badge tone={statusTone(sender.status)}>{sender.status}</Badge>
              </div>
              {sender.lastError && <p className="mt-2 text-sm text-rose-700">{sender.lastError}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => run.mutate({ id: sender.id, kind: "check" })}>Check connection</Button>
                <Button variant="ghost" disabled={!testTo.trim() || test.isPending} onClick={() => test.mutate(sender.id)}>Test send</Button>
                <Button variant="ghost" onClick={() => run.mutate({ id: sender.id, kind: sender.status === "paused" ? "active" : "paused" })}>
                  {sender.status === "paused" ? "Resume" : "Pause"}
                </Button>
                {me.data?.user.role === "admin" && (
                  <select
                    className={`${inputClass} w-auto`}
                    aria-label={`Sending method for ${sender.fromEmail}`}
                    value={sender.provider === "smtp" ? "smtp" : "graph"}
                    onChange={(event) => changeProvider.mutate({ id: sender.id, provider: event.target.value as "graph" | "smtp" })}
                  >
                    <option value="smtp">SMTP</option>
                    <option value="graph">Microsoft 365</option>
                  </select>
                )}
                {me.data?.user.role === "admin" && (
                  <Button
                    variant="danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete mailbox ${sender.fromEmail}? This cannot be undone.`)) remove.mutate(sender.id);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
              {sender.provider === "smtp" && me.data?.user.role === "admin" && <MailboxSmtpForm sender={sender} />}
            </article>
          ))}
        </div>
        {me.data?.user.role === "admin" && (
          <form
            className="panel space-y-3 p-4"
            onSubmit={form.handleSubmit(
              (values) => create.mutate(values),
              (errors) => {
                const message = Object.values(errors).find((error) => error?.message)?.message;
                if (message) toast.error(message);
              },
            )}
          >
            <h2 className="font-medium">Add mailbox</h2>
            <Field label="Team">
              <select className={inputClass} {...form.register("teamId")}>
                <option value="">Choose</option>
                {teams.data?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </Field>
            <Field label="Sending method">
              <select className={inputClass} {...form.register("provider")}>
                <option value="smtp">SMTP</option>
                <option value="graph">Microsoft 365</option>
              </select>
            </Field>
            <Field label="From name"><input className={inputClass} {...form.register("fromName")} /></Field>
            <Field label="From email"><input className={inputClass} {...form.register("fromEmail")} /></Field>
            <Field label="Reply-to"><input className={inputClass} {...form.register("replyTo")} /></Field>
            {provider === "smtp" && (
              <>
                <p className="text-sm text-slate-500">This mailbox signs in to SMTP as its From email, with its own password.</p>
                <Field label="SMTP host"><input className={inputClass} {...form.register("smtpHost")} /></Field>
                <Field label="Port"><input className={inputClass} type="number" min={1} max={65535} {...form.register("smtpPort")} /></Field>
                <Field label="Connection">
                  <select className={inputClass} {...form.register("smtpSecure")}>
                    <option value="false">STARTTLS (587)</option>
                    <option value="true">SSL (465)</option>
                  </select>
                </Field>
                <Field label="Password or app password">
                  <input className={inputClass} type="password" autoComplete="new-password" {...form.register("smtpPassword")} />
                </Field>
              </>
            )}
            <Field label="Daily limit"><input className={inputClass} type="number" {...form.register("dailyLimit")} /></Field>
            <Field label="Per minute"><input className={inputClass} type="number" {...form.register("perMinuteLimit")} /></Field>
            <Button type="submit">Save</Button>
          </form>
        )}
      </div>
    </div>
  );
}

function MailboxSmtpForm({ sender }: { sender: Sender }) {
  const queryClient = useQueryClient();
  const [host, setHost] = useState(sender.smtpHost ?? "smtp.office365.com");
  const [port, setPort] = useState(String(sender.smtpPort ?? 587));
  const [secure, setSecure] = useState(sender.smtpSecure ? "true" : "false");
  const [password, setPassword] = useState("");
  useEffect(() => {
    setHost(sender.smtpHost ?? "smtp.office365.com");
    setPort(String(sender.smtpPort ?? 587));
    setSecure(sender.smtpSecure ? "true" : "false");
  }, [sender.id, sender.smtpHost, sender.smtpPort, sender.smtpSecure]);
  const save = useMutation({
    mutationFn: async () => {
      const smtpPort = Number(port);
      if (!host.trim() || !Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
        throw new Error("Enter the SMTP host and a port from 1 to 65535");
      }
      if (!password.trim() && sender.smtpSource === "missing") {
        throw new Error("Enter the SMTP password for this mailbox");
      }
      await api.updateSender(sender.id, {
        smtpHost: host.trim(),
        smtpPort,
        smtpSecure: secure === "true",
        ...(password.trim() ? { smtpPassword: password } : {}),
      });
      return api.checkSender(sender.id);
    },
    onSuccess: async (result) => {
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["senders"] });
      if (result.ok) toast.success(`SMTP login saved for ${sender.fromEmail}`);
      else toast.error(result.error ?? "Connection failed");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <form
      className="mt-3 space-y-3 border-t border-slate-200 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm text-slate-500">
        {sender.smtpSource === "mailbox" && `This mailbox signs in to SMTP as ${sender.fromEmail}.`}
        {sender.smtpSource === "settings" && `Using the SMTP login saved in Settings for ${sender.fromEmail}. Enter a password here only if this address should use a different login.`}
        {sender.smtpSource === "missing" && `Save a host and password to send as ${sender.fromEmail}.`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SMTP host"><input className={inputClass} value={host} onChange={(event) => setHost(event.target.value)} /></Field>
        <Field label="Port"><input className={inputClass} type="number" min={1} max={65535} value={port} onChange={(event) => setPort(event.target.value)} /></Field>
        <Field label="Connection">
          <select className={inputClass} value={secure} onChange={(event) => setSecure(event.target.value)}>
            <option value="false">STARTTLS (587)</option>
            <option value="true">SSL (465)</option>
          </select>
        </Field>
        <Field label="Password or app password">
          <input
            className={inputClass}
            type="password"
            value={password}
            autoComplete="new-password"
            placeholder={
              sender.smtpSource === "mailbox"
                ? "Saved — leave blank to keep it"
                : sender.smtpSource === "settings"
                  ? "Leave blank to keep using Settings"
                  : "Password for this email"
            }
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      </div>
      <Button type="submit" disabled={save.isPending}>{save.isPending ? "Checking…" : "Save SMTP"}</Button>
    </form>
  );
}

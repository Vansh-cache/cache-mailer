import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { Badge, Button, Field, PageHeader, inputClass, statusTone } from "../components/ui";
import { api } from "../lib/api";

const schema = z.object({
  teamId: z.coerce.number().int().positive(),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  replyTo: z.string().email().or(z.literal("")),
  dailyLimit: z.coerce.number().int().positive(),
  perMinuteLimit: z.coerce.number().int().positive(),
  provider: z.enum(["graph", "smtp"]).default("smtp"),
});

export function MailboxesPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const senders = useQuery({ queryKey: ["senders"], queryFn: api.senders });
  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const contacts = useQuery({ queryKey: ["test-receivers"], queryFn: () => api.contacts("?pageSize=100") });
  const [testTo, setTestTo] = useState("");
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { dailyLimit: 500, perMinuteLimit: 20, replyTo: "", provider: "smtp" },
  });
  const create = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api.createSender({ ...values, replyTo: values.replyTo || null }),
    onSuccess: async () => {
      toast.success("Mailbox added");
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
              <div className="mt-3 flex gap-2">
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
              </div>
            </article>
          ))}
        </div>
        {me.data?.user.role === "admin" && (
          <form className="panel space-y-3 p-4" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
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
            <Field label="Daily limit"><input className={inputClass} type="number" {...form.register("dailyLimit")} /></Field>
            <Field label="Per minute"><input className={inputClass} type="number" {...form.register("perMinuteLimit")} /></Field>
            <Button type="submit">Save</Button>
          </form>
        )}
      </div>
    </div>
  );
}

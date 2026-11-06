import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { EmailChips } from "../components/EmailChips";
import { MailboxPicker } from "../components/MailboxPicker";
import { SendQueue } from "../components/SendQueue";
import { Button, Field, PageHeader, inputClass } from "../components/ui";
import { api } from "../lib/api";

const PREDEFINED_TAGS = new Set(["Lead", "Customer", "Event attendee", "Demo requested"]);

export function SendMailPage() {
  const [params, setParams] = useSearchParams();
  const queueId = Number(params.get("queue")) || 0;
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.templates() });
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const senders = useQuery({ queryKey: ["senders"], queryFn: api.senders });
  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams, enabled: me.data?.user.role === "admin" });
  const [templateId, setTemplateId] = useState(0);
  const [subject, setSubject] = useState("");
  const [autoSubject, setAutoSubject] = useState("");
  const [senderIds, setSenderIds] = useState<number[]>([]);
  const [fromName, setFromName] = useState("");
  const [autoFromName, setAutoFromName] = useState("");
  const [teamId, setTeamId] = useState(0);
  const [cc, setCc] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const hasAudience = tagIds.length > 0 || emails.length > 0;
  const audience = useQuery({
    queryKey: ["audience-preview", tagIds, emails],
    queryFn: () => api.audiencePreview({ tags: tagIds, segmentId: null, excludeTags: [], emails }),
    enabled: hasAudience,
    retry: false,
  });
  const sending = useQuery({
    queryKey: ["campaign", queueId],
    queryFn: () => api.campaign(queueId),
    enabled: queueId > 0,
    refetchInterval: (query) => (query.state.data?.campaign.status === "sending" ? 3000 : false),
  });
  const live = sending.data?.campaign.status === "sending";

  useEffect(() => {
    if (queueId > 0) document.getElementById("send-queue")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [queueId]);

  const chooseTemplate = (id: number) => {
    const template = templates.data?.templates.find((item) => item.id === id);
    const nextSubject = template?.name ?? "";
    setTemplateId(id);
    setSubject((current) => (current === "" || current === autoSubject ? nextSubject : current));
    setAutoSubject(nextSubject);
  };

  const send = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error("Choose a template");
      if (!subject.trim()) throw new Error("Add a subject");
      if (senderIds.length === 0) throw new Error("Choose at least one mailbox");
      if (!fromName.trim()) throw new Error("Set the name receivers will see");
      if (!hasAudience) throw new Error("Choose a tag or add receivers");
      const template = templates.data?.templates.find((item) => item.id === templateId);
      setProblems([]);
      const created = await api.createCampaign({
        name: `${template?.name ?? "Mail"} · ${new Date().toLocaleString()}`.slice(0, 150),
        subject: subject.trim(),
        fromName: fromName.trim(),
        templateId,
        teamId: teamId || undefined,
        senderIds,
        audience: { tags: tagIds, segmentId: null, excludeTags: [], emails },
        ccEmails: cc.length > 0 ? cc.join(", ") : undefined,
        useUtm: true,
      });
      const check = await api.precheck(created.campaign.id);
      if (!check.ok) {
        await api.campaignAction(created.campaign.id, "cancel").catch(() => undefined);
        const failed = check.checks.filter((item) => !item.ok).map((item) => item.detail);
        setProblems(failed);
        throw new Error(failed[0] ?? "Pre-send checks failed");
      }
      await api.sendCampaign(created.campaign.id);
      return created.campaign.id;
    },
    onSuccess: (id) => {
      toast.success("Queued. Status turns to sent only after each mail goes out.");
      setParams({ queue: String(id) });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visibleTags = (tags.data?.tags ?? []).filter((tag) => tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase()));
  const tagGroups = [
    { title: "Predefined tags", items: visibleTags.filter((tag) => PREDEFINED_TAGS.has(tag.name)) },
    { title: "Your tags", items: visibleTags.filter((tag) => !PREDEFINED_TAGS.has(tag.name)) },
  ];
  const toggleTag = (id: number) => setTagIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const receiverCount = audience.data?.count ?? 0;
  const chunkCount = audience.data?.chunks ?? 0;
  const chunkSize = audience.data?.chunkSize ?? 500;
  const role = me.data?.user.role ?? "marketing";
  const mailboxTeam = role === "admin" ? (teamId > 0 ? teamId : null) : me.data?.user.teamId;

  return (
    <div>
      <PageHeader title="Send mail">
        {queueId > 0 && (
          <Button type="button" variant="ghost" onClick={() => document.getElementById("send-queue")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
            Queue{live ? " · sending" : ""}
          </Button>
        )}
      </PageHeader>
      <form
        className="panel mb-4 max-w-3xl space-y-3 p-5"
        onSubmit={(event) => { event.preventDefault(); send.mutate(); }}
      >
        <Field label="Template">
          <select className={inputClass} value={templateId} onChange={(event) => chooseTemplate(Number(event.target.value))} required>
            <option value={0}>Choose a template</option>
            {templates.data?.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </Field>
        <Field label="Subject">
          <input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} required />
        </Field>
        {role === "admin" && (
          <Field label="Team">
            <select className={inputClass} value={teamId} onChange={(event) => { setTeamId(Number(event.target.value)); setSenderIds([]); setFromName((current) => (current === autoFromName ? "" : current)); setAutoFromName(""); }}>
              <option value={0}>My team</option>
              {teams.data?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Mailboxes">
          <MailboxPicker
            senders={senders.data?.senders ?? []}
            selected={senderIds}
            onChange={(ids) => {
              setSenderIds(ids);
              const picked = (senders.data?.senders ?? []).filter((sender) => ids.includes(sender.id));
              const suggestion = picked[0]?.fromName ?? "";
              setFromName((current) => (current === "" || current === autoFromName ? suggestion : current));
              setAutoFromName(suggestion);
            }}
            teamId={mailboxTeam}
            role={role}
          />
          <p className="mt-1 text-xs text-slate-500">Receivers are spread across the mailboxes you pick. The address still sends from that mailbox.</p>
        </Field>
        <Field label="Sender name">
          <input className={inputClass} value={fromName} onChange={(event) => setFromName(event.target.value)} placeholder="Name the receiver sees" required maxLength={100} />
          <p className="mt-1 text-xs text-slate-500">This is the name in the receiver's inbox. It replaces the name saved on the mailbox for this send only.</p>
        </Field>
        <Field label="CC (optional)">
          <EmailChips emails={cc} onChange={setCc} max={10} placeholder="Type an email and press Enter" ariaLabel="CC email addresses" />
          <p className="mt-1 text-xs text-slate-500">Press Enter or use a comma. Each CC address is copied on every mail. Up to 10.</p>
        </Field>
        <Field label="Receivers by tag">
          <div className="space-y-2">
            <input className={inputClass} value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} placeholder="Search tags" aria-label="Search tags" />
            <div className="max-h-48 space-y-3 overflow-y-auto rounded-md border border-slate-200 p-3">
              {tagGroups.map((group) => group.items.length > 0 && (
                <div key={group.title}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</p>
                  {group.items.map((tag) => (
                    <label key={tag.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                      <input type="checkbox" checked={tagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                      <span className="flex-1">{tag.name}</span>
                      <span className="text-slate-400">{tag.count}</span>
                    </label>
                  ))}
                </div>
              ))}
              {visibleTags.length === 0 && <p className="text-sm text-slate-500">No tags yet. Import contacts first, or add receivers below.</p>}
            </div>
          </div>
        </Field>
        <Field label="Add receivers the tags missed">
          <EmailChips emails={emails} onChange={setEmails} placeholder="name@company.com, then Enter or comma" ariaLabel="Manual receiver emails" />
          <p className="mt-1 text-xs text-slate-500">
            Press Enter or type a comma to add each address. Paste a comma-separated list. These are added on top of the tags, and duplicates are skipped.
            {emails.length > 0 && <> <strong>{emails.length}</strong> added.</>}
          </p>
        </Field>
        <p className="text-sm text-slate-600">
          {audience.isFetching && "Counting receivers…"}
          {audience.data && receiverCount === 0 && "No active receivers match this selection."}
          {audience.data && receiverCount > 0 && (
            <>
              <strong>{receiverCount.toLocaleString()} receivers</strong>
              {chunkCount === 1
                ? <> will go out as <strong>1 batch</strong>.</>
                : <> will be split into <strong>{chunkCount} batches</strong> of {chunkSize}{receiverCount % chunkSize !== 0 ? `, and the last batch has ${receiverCount % chunkSize}` : ""}.</>}
            </>
          )}
          {audience.error && <span className="text-rose-700"> {audience.error.message}</span>}
        </p>
        {problems.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-rose-700">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={send.isPending || !hasAudience || templateId === 0 || senderIds.length === 0 || !fromName.trim()}>
            {send.isPending ? "Queuing…" : "Send"}
          </Button>
          {queueId > 0 && (
            <Button type="button" variant="ghost" onClick={() => document.getElementById("send-queue")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Queue
            </Button>
          )}
        </div>
      </form>
      {queueId > 0 && <SendQueue campaignId={queueId} live={live} fromName={sending.data?.campaign.fromName} />}
    </div>
  );
}

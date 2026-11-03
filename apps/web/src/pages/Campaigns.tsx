import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge, Button, Field, PageHeader, inputClass, statusTone } from "../components/ui";
import { api, type Precheck } from "../lib/api";
import { Link } from "react-router-dom";

export function CampaignsPage() {
  const campaigns = useQuery({ queryKey: ["campaigns"], queryFn: api.campaigns });
  return (
    <div>
      <PageHeader title="Email Campaigns">
        <Link to="/campaigns/new"><Button>New email campaign</Button></Link>
      </PageHeader>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-3 py-2">Name</th><th>Status</th><th>Sent</th></tr></thead>
          <tbody>
            {campaigns.data?.campaigns.map((campaign) => (
              <tr key={campaign.id} className="border-t border-slate-100">
                <td className="px-3 py-2"><Link className="font-medium text-tide-700" to={`/campaigns/${campaign.id}`}>{campaign.name}</Link></td>
                <td><Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge></td>
                <td>{campaign.stats?.sent ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PREDEFINED_TAGS = new Set(["Lead", "Customer", "Event attendee", "Demo requested"]);

export function CampaignWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetTemplateId = Number(searchParams.get("templateId")) || 0;
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.templates() });
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const segments = useQuery({ queryKey: ["segments"], queryFn: api.segments });
  const senders = useQuery({ queryKey: ["senders"], queryFn: api.senders });
  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [templateId, setTemplateId] = useState(presetTemplateId);
  const presetTemplate = templates.data?.templates.find((template) => template.id === presetTemplateId);
  useEffect(() => {
    if (presetTemplate) setName((current) => current || presetTemplate.name);
  }, [presetTemplate]);
  const [senderId, setSenderId] = useState(0);
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [segmentId, setSegmentId] = useState(0);
  const [manualText, setManualText] = useState("");
  const emails = [...new Set(manualText.split(/[\s,;]+/).map((email) => email.trim().toLowerCase()).filter(Boolean))];
  const hasAudience = tagIds.length > 0 || segmentId > 0 || emails.length > 0;
  const audience = useQuery({
    queryKey: ["audience-preview", tagIds, segmentId, emails],
    queryFn: () => api.audiencePreview({ tags: tagIds, segmentId: segmentId || null, excludeTags: [], emails }),
    enabled: hasAudience,
    retry: false,
  });
  const [when, setWhen] = useState("");
  const [teamId, setTeamId] = useState(0);
  const [ccEmails, setCcEmails] = useState("");
  const [checks, setChecks] = useState<Precheck | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      if (!hasAudience) throw new Error("Choose at least one tag, a saved segment, or add receivers manually");
      const created = await api.createCampaign({
        name,
        subject,
        preheader,
        templateId,
        teamId: teamId || undefined,
        senderIds: senderId ? [senderId] : [],
        audience: { tags: tagIds, segmentId: segmentId || null, excludeTags: [], emails },
        ccEmails: ccEmails.trim() || undefined,
        useUtm: true,
      });
      const result = await api.precheck(created.campaign.id);
      setChecks(result);
      if (!result.ok) throw new Error(result.checks.find((check) => !check.ok)?.detail ?? "Pre-send checks failed");
      if (when) await api.scheduleCampaign(created.campaign.id, new Date(when).toISOString());
      else await api.sendCampaign(created.campaign.id);
      return created.campaign.id;
    },
    onSuccess: (id) => navigate(`/campaigns/${id}`),
    onError: (error: Error) => toast.error(error.message),
  });
  const visibleTags = (tags.data?.tags ?? []).filter((tag) => tag.name.toLowerCase().includes(tagSearch.trim().toLowerCase()));
  const tagGroups: { title: string; items: typeof visibleTags }[] = [
    { title: "Predefined tags", items: visibleTags.filter((tag) => PREDEFINED_TAGS.has(tag.name)) },
    { title: "Your tags", items: visibleTags.filter((tag) => !PREDEFINED_TAGS.has(tag.name)) },
  ];
  const toggleTag = (id: number) =>
    setTagIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const selectAllVisible = () => setTagIds((current) => [...new Set([...current, ...visibleTags.map((tag) => tag.id)])]);
  return (
    <div>
      <PageHeader title="New email campaign" />
      <form className="panel max-w-2xl space-y-3 p-5" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <Field label="Name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Subject"><input className={inputClass} value={subject} onChange={(event) => setSubject(event.target.value)} required /></Field>
        <Field label="Preheader"><input className={inputClass} value={preheader} onChange={(event) => setPreheader(event.target.value)} /></Field>
        <Field label="Template">
          <select className={inputClass} value={templateId} onChange={(event) => setTemplateId(Number(event.target.value))} required>
            <option value={0}>Choose</option>
            {templates.data?.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
        </Field>
        <Field label="Team">
          <select className={inputClass} value={teamId} onChange={(event) => setTeamId(Number(event.target.value))}>
            <option value={0}>My team</option>
            {teams.data?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </Field>
        <Field label="Mailbox">
          <select className={inputClass} value={senderId} onChange={(event) => setSenderId(Number(event.target.value))}>
            <option value={0}>Choose</option>
            {senders.data?.senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.fromEmail}</option>)}
          </select>
        </Field>
        <Field label="CC (optional)">
          <input
            className={inputClass}
            type="text"
            value={ccEmails}
            onChange={(event) => setCcEmails(event.target.value)}
            placeholder="manager@company.com, founder@company.com"
            aria-label="CC email addresses"
          />
          <p className="mt-1 text-xs text-slate-500">
            These addresses are copied on every mail in this campaign (comma or semicolon separated, up to 10). Keep this short — each CC person receives one copy per receiver.
          </p>
        </Field>
        <Field label="Receivers by tag (choose one or more)">
          <div className="space-y-2">
            <input
              className={inputClass}
              value={tagSearch}
              onChange={(event) => setTagSearch(event.target.value)}
              placeholder="Search tags, e.g. October 2026 launch"
              aria-label="Search tags"
            />
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="rounded border border-slate-300 px-2 py-1 font-medium hover:bg-slate-50 disabled:opacity-50" disabled={visibleTags.length === 0} onClick={selectAllVisible}>
                {tagSearch.trim() ? "Select all shown" : "Select all"}
              </button>
              <button type="button" className="rounded border border-slate-300 px-2 py-1 font-medium hover:bg-slate-50 disabled:opacity-50" disabled={tagIds.length === 0} onClick={() => setTagIds([])}>
                Clear all
              </button>
              <span className="text-slate-500">{tagIds.length} selected</span>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-md border border-slate-200 p-3">
              {tagGroups.map((group) => group.items.length > 0 && (
                <div key={group.title}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</p>
                  <div className="space-y-1">
                    {group.items.map((tag) => (
                      <label key={tag.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={tagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                        <span className="flex-1">{tag.name}</span>
                        <span className="text-slate-400">{tag.count}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {visibleTags.length === 0 && <p className="text-sm text-slate-500">No tags found. Import contacts with a category or your own tag first.</p>}
            </div>
            <p className="text-xs text-slate-500">
              Everyone with <strong>any</strong> selected tag receives the mail, only once. Unsubscribed and blocked contacts are always skipped.
              {audience.data && <> <strong>{audience.data.count} people</strong> will receive this campaign.</>}
              {audience.isFetching && <> Counting receivers…</>}
              {audience.error && <span className="text-rose-700"> {audience.error.message}</span>}
            </p>
          </div>
        </Field>
        <Field label="Add receivers manually (optional)">
          <textarea
            className={`${inputClass} min-h-20`}
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="one@company.com, two@company.com"
            aria-label="Manual receiver emails"
          />
          <p className="mt-1 text-xs text-slate-500">
            Separate with commas, spaces or new lines. Works with or without tags. New addresses are saved as contacts; unsubscribed and blocked addresses are still skipped.
            {emails.length > 0 && <> <strong>{emails.length}</strong> typed.</>}
          </p>
        </Field>
        <Field label="Segment">
          <select className={inputClass} value={segmentId} onChange={(event) => setSegmentId(Number(event.target.value))}>
            <option value={0}>None</option>
            {segments.data?.segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
          </select>
        </Field>
        <Field label="Schedule (leave empty to send now)">
          <input className={inputClass} type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
        </Field>
        {checks && (
          <ul className="text-sm">
            {checks.checks.map((check) => <li key={check.id}>{check.ok ? "OK" : "Fix"} — {check.detail}</li>)}
          </ul>
        )}
        <Button type="submit" disabled={create.isPending || !hasAudience}>Review and send</Button>
      </form>
    </div>
  );
}

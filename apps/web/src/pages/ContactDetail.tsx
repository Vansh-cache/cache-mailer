import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Field, PageHeader, inputClass, statusTone } from "../components/ui";
import { api } from "../lib/api";

export function ContactDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagText, setNewTagText] = useState("");
  const detail = useQuery({ queryKey: ["contact", id], queryFn: () => api.contact(id) });
  const allTags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  useEffect(() => {
    const contact = detail.data?.contact;
    if (!contact) return;
    setEmail(contact.email);
    setFirstName(contact.firstName ?? "");
    setLastName(contact.lastName ?? "");
    setCompany(contact.company ?? "");
    setJobTitle(contact.jobTitle ?? "");
    setSelectedTagIds(contact.tags.map((tag) => tag.id));
  }, [detail.data]);
  const save = useMutation({
    mutationFn: () => api.updateContact(id, {
      email,
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
      company: company.trim() || null,
      jobTitle: jobTitle.trim() || null,
      consentNote: note || detail.data?.contact.consentNote,
      tagIds: selectedTagIds,
      newTags: newTagText.split(",").map((tag) => tag.trim()).filter(Boolean),
      customFields: {
        ...(detail.data?.contact.customFields ?? {}),
        ...(fieldKey.trim() ? { [fieldKey.trim().replace(/\s+/g, "_").toLowerCase()]: fieldValue } : {}),
      },
    }),
    onSuccess: async () => {
      toast.success("Saved");
      setNewTagText("");
      await queryClient.invalidateQueries({ queryKey: ["contact", id] });
      await queryClient.invalidateQueries({ queryKey: ["contacts"] });
      await queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteContact(id),
    onSuccess: () => navigate("/contacts"),
    onError: (error: Error) => toast.error(error.message),
  });
  const toggleTag = (tagId: number) =>
    setSelectedTagIds((current) => (current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId]));
  if (!detail.data) return <p>Loading contact…</p>;
  const contact = detail.data.contact;
  const selectedTags = (allTags.data?.tags ?? []).filter((tag) => selectedTagIds.includes(tag.id));
  return (
    <div>
      <PageHeader title={contact.email}>
        <Button variant="danger" onClick={() => remove.mutate()}>Delete</Button>
      </PageHeader>
      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <section className="panel space-y-3 p-4 text-sm">
          <Field label="Email"><input className={inputClass} value={email} onChange={(event) => setEmail(event.target.value)} /></Field>
          <Field label="First name"><input className={inputClass} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></Field>
          <Field label="Last name"><input className={inputClass} value={lastName} onChange={(event) => setLastName(event.target.value)} /></Field>
          <Field label="Company"><input className={inputClass} value={company} onChange={(event) => setCompany(event.target.value)} /></Field>
          <Field label="Job title"><input className={inputClass} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></Field>
          <Badge tone={statusTone(contact.status)}>{contact.status}</Badge>
          <div>Source: {contact.source ?? "unknown"}</div>
          <div>Score: {contact.score ?? 0}. Tag points plus opens, and double for clicks.</div>
          <div>
            <span className="mb-1 block font-medium">Tags</span>
            {selectedTags.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1">
                {selectedTags.map((tag) => (
                  <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {tag.name}
                    <button type="button" className="text-slate-500 hover:text-slate-800" aria-label={`Remove tag ${tag.name}`} onClick={() => toggleTag(tag.id)}>×</button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mb-2 text-slate-500">No tags. Tick a tag below or type a new one.</p>
            )}
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {(allTags.data?.tags ?? []).map((tag) => (
                <label key={tag.id} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} />
                  <span className="flex-1">{tag.name}</span>
                  <span className="text-slate-400">{tag.count}</span>
                </label>
              ))}
              {(allTags.data?.tags.length ?? 0) === 0 && <p className="text-slate-500">No tags exist yet. Create the first one below.</p>}
            </div>
            <input
              className={`${inputClass} mt-2`}
              value={newTagText}
              onChange={(event) => setNewTagText(event.target.value)}
              placeholder="New tag, e.g. October 2026 launch"
              aria-label="New tag"
            />
            <p className="mt-1 text-xs text-slate-500">Use a comma for more than one new tag. New tags are created when you press Save, and can then be used in campaigns.</p>
          </div>
          <div className="break-all">Referral link: {detail.data.referralUrl}</div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputClass} value={fieldKey} placeholder="Custom field, such as city" onChange={(event) => setFieldKey(event.target.value)} />
            <input className={inputClass} value={fieldValue} placeholder="Value" onChange={(event) => setFieldValue(event.target.value)} />
          </div>
          {contact.customFields && Object.entries(contact.customFields).map(([key, value]) => (
            <div key={key}>{key}: {value}</div>
          ))}
          <label className="block pt-2">
            Consent note
            <textarea className="mt-1 w-full rounded-lg border border-slate-300 p-2" defaultValue={contact.consentNote ?? ""} onChange={(event) => setNote(event.target.value)} />
          </label>
          <Button onClick={() => save.mutate()}>Save</Button>
        </section>
        <section className="panel p-4">
          <h2 className="mb-2 font-medium">Activity</h2>
          <ul className="space-y-2 text-sm">
            {detail.data.activity.map((event) => (
              <li key={event.id} className="flex justify-between border-b border-slate-100 py-1">
                <span>{event.type}{event.isBot ? " (bot)" : ""} · {event.campaignName}</span>
                <span className="text-slate-500">{new Date(event.createdAt).toLocaleString()}</span>
              </li>
            ))}
            {detail.data.activity.length === 0 && <li className="text-slate-500">No email activity yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

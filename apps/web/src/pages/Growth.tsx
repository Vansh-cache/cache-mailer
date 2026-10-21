import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button, Field, PageHeader, inputClass } from "../components/ui";
import { api } from "../lib/api";

export function GrowthPage() {
  const queryClient = useQueryClient();
  const sequences = useQuery({ queryKey: ["sequences"], queryFn: api.sequences });
  const gates = useQuery({ queryKey: ["gates"], queryFn: api.gates });
  const tags = useQuery({ queryKey: ["tags"], queryFn: api.tags });
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.templates() });
  const senders = useQuery({ queryKey: ["senders"], queryFn: api.senders });
  const [name, setName] = useState("");
  const [tagId, setTagId] = useState(0);
  const [senderId, setSenderId] = useState(0);
  const [steps, setSteps] = useState([{ waitDays: 0, templateId: 0, subject: "" }]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [gateTag, setGateTag] = useState("Demo requested");
  const [assetUrl, setAssetUrl] = useState("https://cachedigitech.com");
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["sequences"] });
    await queryClient.invalidateQueries({ queryKey: ["gates"] });
  };
  const createSequence = useMutation({
    mutationFn: () => api.createSequence({
      name,
      triggerTagId: tagId,
      senderId,
      steps,
    }),
    onSuccess: async () => {
      toast.success("Sequence is on");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: (id: number) => api.toggleSequence(id),
    onSuccess: refresh,
    onError: (error: Error) => toast.error(error.message),
  });
  const createGate = useMutation({
    mutationFn: () => api.createGate({ title, slug, detail: "Leave your email to continue.", tagName: gateTag, assetUrl }),
    onSuccess: async (result) => {
      toast.success(result.url);
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div>
      <PageHeader title="Growth" />
      <div className="grid grid-cols-2 gap-4">
        <section className="panel space-y-3 p-4">
          <h2 className="font-medium">Thank-you sequence</h2>
          <p className="text-sm text-slate-500">When a contact receives the tag, the mailbox sends this email after the wait. Suppression and the mailbox limits still apply.</p>
          <Field label="Name"><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Demo thank you" /></Field>
          <Field label="When tagged">
            <select className={inputClass} value={tagId} onChange={(event) => setTagId(Number(event.target.value))}>
              <option value={0}>Choose</option>
              {tags.data?.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          </Field>
          <Field label="Mailbox">
            <select className={inputClass} value={senderId} onChange={(event) => setSenderId(Number(event.target.value))}>
              <option value={0}>Choose</option>
              {senders.data?.senders.map((sender) => <option key={sender.id} value={sender.id}>{sender.fromEmail}</option>)}
            </select>
          </Field>
          {steps.map((step, index) => (
            <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="text-sm font-medium">Email {index + 1}</div>
              <Field label="Wait days"><input className={inputClass} type="number" min={0} value={step.waitDays} onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, waitDays: Number(event.target.value) } : item))} /></Field>
              <Field label="Template">
                <select className={inputClass} value={step.templateId} onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, templateId: Number(event.target.value) } : item))}>
                  <option value={0}>Choose</option>
                  {templates.data?.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </Field>
              <Field label="Subject"><input className={inputClass} value={step.subject} onChange={(event) => setSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, subject: event.target.value } : item))} /></Field>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setSteps((current) => current.length >= 8 ? current : [...current, { waitDays: 2, templateId: 0, subject: "" }])}>Add follow-up</Button>
          <Button onClick={() => createSequence.mutate()} disabled={createSequence.isPending || !name || !tagId || !senderId || steps.some((step) => !step.templateId || !step.subject.trim())}>Start sequence</Button>
          <ul className="text-sm">
            {sequences.data?.sequences.map((sequence) => (
              <li key={sequence.id} className="flex items-center justify-between border-t border-slate-100 py-2">
                <span>{sequence.name} · {sequence.tag} · {sequence.enrolled} enrolled · {sequence.status}</span>
                <Button variant="ghost" onClick={() => toggle.mutate(sequence.id)}>{sequence.status === "active" ? "Pause" : "Resume"}</Button>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel space-y-3 p-4">
          <h2 className="font-medium">Gated page</h2>
          <p className="text-sm text-slate-500">Someone enters an email, then sees the link. They are tagged, so a sequence for that tag can send the thank-you.</p>
          <Field label="Title"><input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Request a demo" /></Field>
          <Field label="Link name"><input className={inputClass} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="demo" /></Field>
          <Field label="Tag"><input className={inputClass} value={gateTag} onChange={(event) => setGateTag(event.target.value)} /></Field>
          <Field label="Link they unlock"><input className={inputClass} value={assetUrl} onChange={(event) => setAssetUrl(event.target.value)} /></Field>
          <Button onClick={() => createGate.mutate()} disabled={createGate.isPending || !title || !slug}>Create page</Button>
          <ul className="text-sm">
            {gates.data?.gates.map((gate) => (
              <li key={gate.id} className="border-t border-slate-100 py-2">
                <div className="font-medium">{gate.title}</div>
                <div className="text-slate-500">{gate.tagName} · {gate.url}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

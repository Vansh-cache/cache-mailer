import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { Button, PageHeader } from "../components/ui";
import { api } from "../lib/api";
import { STARTER_TEMPLATES, TEMPLATE_CATEGORIES, categoryLabel, type StarterTemplate } from "../lib/starters";

const starter = {
  version: 1 as const,
  settings: {
    outerBg: "#f3f4f6",
    contentBg: "#ffffff",
    width: 600,
    fontFamily: "Arial, Helvetica, sans-serif",
    baseFontSize: 16,
    textColor: "#1f2937",
    linkColor: "#0f766e",
    includeUnsubscribe: false,
    compose: "blocks",
    plainBody: "",
  },
  blocks: [
    { id: "intro", section: "body" as const, type: "text" as const, html: "<p>Hi {{first_name | there}},</p>", style: { fontSize: 16, align: "left" as const, padding: "24px 28px", bg: "transparent" } },
  ],
};

export function TemplatesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("all");
  const templates = useQuery({ queryKey: ["templates"], queryFn: () => api.templates() });
  const create = useMutation({
    mutationFn: () => api.createTemplate({ name: "Untitled email", kind: "draft", design: starter }),
    onSuccess: (result) => navigate(`/templates/${result.template.id}`),
    onError: (error: Error) => toast.error(error.message),
  });
  const useStarterTemplate = useMutation({
    mutationFn: (item: StarterTemplate) => api.createTemplate({ name: item.name, category: item.category, kind: "template", design: item.design() }),
    onSuccess: (result) => navigate(`/templates/${result.template.id}`),
    onError: (error: Error) => toast.error(error.message),
  });
  const duplicate = useMutation({
    mutationFn: (id: number) => api.duplicateTemplate(id),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["templates"] }); },
    onError: (error: Error) => toast.error(error.message),
  });
  const starters = STARTER_TEMPLATES.filter((item) => category === "all" || item.category === category);
  const mine = (templates.data?.templates ?? []).filter((template) => category === "all" || (template.category ?? "general") === category);
  return (
    <div>
      <PageHeader title="Email Templates">
        <Button onClick={() => create.mutate()}>New blank email</Button>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`rounded-full border px-3 py-1 text-sm ${category === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
        >
          All categories
        </button>
        {TEMPLATE_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setCategory(item.id)}
            className={`rounded-full border px-3 py-1 text-sm ${category === item.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white hover:bg-slate-50"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <h2 className="mb-1 font-semibold">Starter templates</h2>
      <p className="mb-3 text-sm text-slate-500">Professional ready-made layouts. Pick one, then change the words, images and button — it saves as your own template.</p>
      <div className="mb-8 grid grid-cols-3 gap-3">
        {starters.map((item) => (
          <article key={`${item.category}-${item.name}`} className="panel overflow-hidden">
            <div className="flex h-20 items-center justify-center text-lg font-semibold text-white" style={{ background: `#${item.color}` }}>
              {item.banner}
            </div>
            <div className="p-4">
              <div className="font-medium">{item.name}</div>
              <div className="mt-1 text-sm text-slate-500">{item.blurb}</div>
              <div className="mt-1 text-xs uppercase text-slate-400">{categoryLabel(item.category)}</div>
              <Button className="mt-3" variant="ghost" disabled={useStarterTemplate.isPending} onClick={() => useStarterTemplate.mutate(item)}>Use this template</Button>
            </div>
          </article>
        ))}
        {starters.length === 0 && <p className="text-sm text-slate-500">No starter templates in this category.</p>}
      </div>

      <h2 className="mb-3 font-semibold">Your templates</h2>
      <div className="grid grid-cols-3 gap-3">
        {mine.map((template) => (
          <article key={template.id} className="panel p-4">
            <Link className="font-medium text-tide-700" to={`/templates/${template.id}`}>{template.name}</Link>
            <div className="mt-1 text-xs uppercase text-slate-500">{categoryLabel(template.category)} · {template.visibility} · {template.kind}</div>
            <Button className="mt-3" variant="ghost" onClick={() => duplicate.mutate(template.id)}>Duplicate</Button>
          </article>
        ))}
        {mine.length === 0 && <p className="text-sm text-slate-500">No templates of yours in this category yet. Use a starter above or create a blank email.</p>}
      </div>
    </div>
  );
}

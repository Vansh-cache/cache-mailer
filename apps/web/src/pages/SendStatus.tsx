import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SendingQueue } from "../components/SendingQueue";
import { TestSendHistory } from "../components/TestSendHistory";
import { Badge, PageHeader, inputClass, statusTone } from "../components/ui";
import { api } from "../lib/api";

type Source = "campaign" | "test";

export function SendStatusPage() {
  const [params, setParams] = useSearchParams();
  const source: Source = params.get("source") === "test" ? "test" : "campaign";
  const requested = Number(params.get("campaign")) || 0;
  const templateId = Number(params.get("template")) || 0;
  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.campaigns,
    enabled: source === "campaign",
    refetchInterval: (query) => {
      const rows = query.state.data?.campaigns ?? [];
      const currentId = requested || rows[0]?.id;
      const current = rows.find((campaign) => campaign.id === currentId);
      return current?.status === "sending" ? 5000 : false;
    },
  });
  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.templates(),
    enabled: source === "test",
  });
  const list = campaigns.data?.campaigns ?? [];
  const campaignId = list.some((campaign) => campaign.id === requested) ? requested : (list[0]?.id ?? 0);
  const selected = list.find((campaign) => campaign.id === campaignId);
  const live = selected?.status === "sending";

  useEffect(() => {
    if (source !== "campaign") return;
    if (campaignId > 0 && requested !== campaignId) {
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set("campaign", String(campaignId));
        return next;
      }, { replace: true });
    }
  }, [source, campaignId, requested, setParams]);

  const chooseSource = (next: Source) => {
    setParams((current) => {
      const paramsNext = new URLSearchParams(current);
      if (next === "test") paramsNext.set("source", "test");
      else paramsNext.delete("source");
      return paramsNext;
    });
  };

  return (
    <div>
      <PageHeader title="Send status" />
      <div className="mb-4 flex gap-1.5">
        <button
          type="button"
          onClick={() => chooseSource("campaign")}
          className={`rounded-full border px-3 py-1 text-sm font-medium ${source === "campaign" ? "border-tide-600 bg-tide-50 text-tide-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          Campaigns
        </button>
        <button
          type="button"
          onClick={() => chooseSource("test")}
          className={`rounded-full border px-3 py-1 text-sm font-medium ${source === "test" ? "border-tide-600 bg-tide-50 text-tide-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          Test sends
        </button>
      </div>
      {source === "campaign" ? (
        <>
          <section className="panel mb-4 p-4">
            <label className="block max-w-xl text-sm">
              <span className="mb-1 block font-medium text-ink-700">Campaign</span>
              <select
                className={inputClass}
                value={campaignId || ""}
                onChange={(event) => {
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set("campaign", event.target.value);
                    next.delete("source");
                    return next;
                  });
                }}
                disabled={list.length === 0}
                aria-label="Select a campaign"
              >
                {list.length === 0 && <option value="">No campaigns yet</option>}
                {list.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name} — {campaign.status}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <Badge tone={statusTone(selected.status)}>{selected.status}</Badge>
                <span>Subject: {selected.subject}</span>
                <span className="text-slate-300" aria-hidden="true">|</span>
                <span>Sent: {selected.stats?.sent ?? 0}</span>
                <span className="text-slate-300" aria-hidden="true">|</span>
                <Link className="font-medium text-tide-700" to={`/campaigns/${selected.id}`}>Open campaign report</Link>
              </div>
            )}
            {campaigns.isLoading && <p className="mt-3 text-sm text-slate-500">Loading campaigns…</p>}
            {!campaigns.isLoading && list.length === 0 && (
              <p className="mt-3 text-sm text-slate-500">Create a campaign first. This page lists every receiver and whether the mail was sent.</p>
            )}
          </section>
          {campaignId > 0 && (
            <>
              <p className="mb-3 text-sm text-slate-500">
                Yes means the mail went out. No means it is still waiting, failed, or was skipped. The status column says which.
              </p>
              <SendingQueue campaignId={campaignId} live={live} />
            </>
          )}
        </>
      ) : (
        <>
          <section className="panel mb-4 p-4">
            <label className="block max-w-xl text-sm">
              <span className="mb-1 block font-medium text-ink-700">Template</span>
              <select
                className={inputClass}
                value={templateId || ""}
                onChange={(event) => {
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    next.set("source", "test");
                    if (event.target.value) next.set("template", event.target.value);
                    else next.delete("template");
                    return next;
                  });
                }}
                aria-label="Filter test sends by template"
              >
                <option value="">All templates</option>
                {templates.data?.templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-sm text-slate-500">Every mail sent with Test send on a template, including earlier ones.</p>
          </section>
          <TestSendHistory templateId={templateId} />
        </>
      )}
    </div>
  );
}

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type RecipientStatus } from "../lib/api";
import { Badge, inputClass, statusTone } from "./ui";

type Filter = "" | "sent" | "remaining" | "failed" | "skipped";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "", label: "All" },
  { id: "sent", label: "Sent" },
  { id: "remaining", label: "Waiting" },
  { id: "failed", label: "Failed" },
  { id: "skipped", label: "Skipped" },
];

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

function statusLabel(status: RecipientStatus): string {
  if (status === "queued") return "waiting";
  if (status === "processing") return "sending";
  return status;
}

export function SendQueue({ campaignId, live, fromName }: { campaignId: number; live: boolean; fromName?: string | null }) {
  const [chunk, setChunk] = useState(0);
  const [filter, setFilter] = useState<Filter>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const chunks = useQuery({
    queryKey: ["chunks", campaignId],
    queryFn: () => api.chunks(campaignId),
    refetchInterval: live ? 3000 : false,
  });
  const queue = useQuery({
    queryKey: ["recipients", campaignId, "sent-first", chunk, filter, search.trim(), page],
    queryFn: () => api.recipients(campaignId, { status: filter, search: search.trim(), page, chunk: chunk || undefined, sort: "sent" }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 3000 : false,
  });
  const blocks = chunks.data?.chunks ?? [];
  const size = chunks.data?.chunkSize ?? 500;
  const counts = queue.data?.counts ?? { queued: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
  const everyone = blocks.reduce((sum, block) => sum + block.total, 0);
  const sent = blocks.reduce((sum, block) => sum + block.sent, 0);
  const pages = queue.data ? Math.max(1, Math.ceil(queue.data.total / queue.data.pageSize)) : 1;
  const countFor = (id: Filter) => {
    if (id === "sent") return counts.sent;
    if (id === "remaining") return counts.queued + counts.processing;
    if (id === "failed") return counts.failed;
    if (id === "skipped") return counts.skipped;
    return counts.queued + counts.processing + counts.sent + counts.failed + counts.skipped;
  };

  return (
    <section id="send-queue" className="panel p-4 text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          Queue
          {live && <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> live</span>}
        </h2>
        <span className="text-slate-500">{sent} of {everyone} sent · batches of {size}{fromName ? ` · from ${fromName}` : ""}</span>
      </div>
      <p className="mb-3 text-xs text-slate-500">Each batch is up to {size} receivers. A row stays waiting until the mailbox accepts the mail, and only then becomes sent. Sent addresses are listed first.</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setChunk(0); setPage(1); }}
          className={`rounded-lg border px-3 py-2 text-left text-xs ${chunk === 0 ? "border-tide-600 bg-tide-50 text-tide-700" : "border-slate-200 hover:bg-slate-50"}`}
        >
          <span className="block font-medium">All receivers</span>
          <span>{sent}/{everyone || 0} sent</span>
        </button>
        {blocks.map((block) => {
          const done = block.queued + block.processing === 0 && block.total > 0;
          const active = block.processing > 0 || (block.sent > 0 && block.queued > 0);
          return (
            <button
              key={block.index}
              type="button"
              onClick={() => { setChunk(block.index); setPage(1); }}
              className={`min-w-36 rounded-lg border px-3 py-2 text-left text-xs ${chunk === block.index ? "border-tide-600 bg-tide-50 text-tide-700" : "border-slate-200 hover:bg-slate-50"}`}
            >
              <span className="block font-medium">Batch {block.index}</span>
              <span>{block.sent}/{block.total} sent{done ? " · done" : active ? " · sending" : ""}</span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full bg-emerald-500" style={{ width: `${block.total ? (block.sent / block.total) * 100 : 0}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            onClick={() => { setFilter(item.id); setPage(1); }}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === item.id ? "border-tide-600 bg-tide-50 text-tide-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {item.label} ({countFor(item.id)})
          </button>
        ))}
        <input
          className={`${inputClass} ml-auto w-56`}
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search email"
          aria-label="Search queue by email"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1.5">Receiver</th>
              <th>Sent</th>
              <th>Status</th>
              <th>Batch</th>
              <th>Mailbox</th>
              <th>Sent at</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {queue.data?.recipients.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-3">{row.contact.email}</td>
                <td className="pr-3"><Badge tone={row.status === "sent" ? "green" : "slate"}>{row.status === "sent" ? "Yes" : "No"}</Badge></td>
                <td className="pr-3"><Badge tone={row.status === "processing" || row.status === "queued" ? "amber" : statusTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                <td className="pr-3 text-slate-600">{row.chunkIndex}</td>
                <td className="pr-3 text-slate-600">{row.sender.fromEmail}</td>
                <td className="whitespace-nowrap pr-3 text-slate-600">{formatTime(row.sentAt)}</td>
                <td className="max-w-xs break-words text-xs text-rose-700">{row.skipReason ? `Skipped: ${row.skipReason}` : row.lastError ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {queue.isLoading && <p className="py-4 text-center text-slate-500">Loading queue…</p>}
        {queue.data && queue.data.recipients.length === 0 && (
          <p className="py-4 text-center text-slate-500">{everyone === 0 ? "Nobody is queued yet." : "Nobody in this list."}</p>
        )}
        {queue.isError && <p className="py-4 text-center text-rose-700">{queue.error.message}</p>}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <button type="button" className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="rounded border border-slate-200 px-2 py-1 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

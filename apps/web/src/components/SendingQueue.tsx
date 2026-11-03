import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, type RecipientCounts, type RecipientStatus } from "../lib/api";
import { Badge, inputClass, statusTone } from "./ui";

type Filter = "remaining" | "" | RecipientStatus;

const FILTERS: { id: Filter; label: string; count: (counts: RecipientCounts) => number }[] = [
  { id: "remaining", label: "Remaining", count: (c) => c.queued + c.processing },
  { id: "sent", label: "Sent", count: (c) => c.sent },
  { id: "failed", label: "Failed", count: (c) => c.failed },
  { id: "skipped", label: "Skipped", count: (c) => c.skipped },
  { id: "", label: "All", count: (c) => c.queued + c.processing + c.sent + c.failed + c.skipped },
];

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export function SendingQueue({ campaignId, live }: { campaignId: number; live: boolean }) {
  const [filter, setFilter] = useState<Filter>("remaining");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["recipients", campaignId, filter, search.trim(), page],
    queryFn: () => api.recipients(campaignId, { status: filter, search: search.trim(), page }),
    placeholderData: keepPreviousData,
    refetchInterval: live ? 5000 : false,
  });
  const data = query.data;
  const counts = data?.counts ?? { queued: 0, processing: 0, sent: 0, failed: 0, skipped: 0 };
  const total = counts.queued + counts.processing + counts.sent + counts.failed + counts.skipped;
  const done = counts.sent + counts.failed + counts.skipped;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const choose = (next: Filter) => { setFilter(next); setPage(1); };

  return (
    <section className="panel mb-4 p-4 text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">
          Sending queue
          {live && <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> live</span>}
        </h2>
        <span className="text-slate-500">{done} of {total} processed · {counts.queued + counts.processing} remaining</span>
      </div>
      <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-label="Sending progress">
        {total > 0 && (
          <>
            <div className="bg-emerald-500" style={{ width: `${(counts.sent / total) * 100}%` }} />
            <div className="bg-rose-500" style={{ width: `${(counts.failed / total) * 100}%` }} />
            <div className="bg-slate-400" style={{ width: `${(counts.skipped / total) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(counts.processing / total) * 100}%` }} />
          </>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            onClick={() => choose(item.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === item.id ? "border-tide-600 bg-tide-50 text-tide-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {item.label} ({item.count(counts)})
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
            <tr><th className="py-1.5">Receiver</th><th>Status</th><th>Mailbox</th><th>{filter === "sent" ? "Sent at" : "Sent / next try"}</th><th>Attempts</th><th>Note</th></tr>
          </thead>
          <tbody>
            {data?.recipients.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="py-1.5 pr-2">{row.contact.email}</td>
                <td className="pr-2"><Badge tone={row.status === "processing" || row.status === "queued" ? "amber" : statusTone(row.status)}>{row.status}</Badge></td>
                <td className="pr-2 text-slate-600">{row.sender.fromEmail}</td>
                <td className="pr-2 text-slate-600">{row.sentAt ? formatTime(row.sentAt) : row.status === "queued" ? formatTime(row.nextAttemptAt) : "—"}</td>
                <td className="pr-2 text-slate-600">{row.attempts}</td>
                <td className="max-w-xs break-words text-xs text-rose-700">{row.skipReason ? `Skipped: ${row.skipReason}` : row.lastError ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.recipients.length === 0 && (
          <p className="py-4 text-center text-slate-500">{total === 0 ? "Nobody is queued yet — the queue fills when the campaign starts." : "Nobody in this list."}</p>
        )}
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

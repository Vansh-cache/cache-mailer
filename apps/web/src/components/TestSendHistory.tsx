import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { Badge, inputClass } from "./ui";

type Filter = "" | "sent" | "failed";

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

export function TestSendHistory({ templateId }: { templateId: number }) {
  const [filter, setFilter] = useState<Filter>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["test-sends", templateId, filter, search.trim(), page],
    queryFn: () => api.testSends({ templateId: templateId || undefined, status: filter, search: search.trim(), page }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const counts = data?.counts ?? { sent: 0, failed: 0 };
  const totalRows = counts.sent + counts.failed;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "", label: "All", count: totalRows },
    { id: "sent", label: "Sent", count: counts.sent },
    { id: "failed", label: "Failed", count: counts.failed },
  ];
  const choose = (next: Filter) => { setFilter(next); setPage(1); };

  return (
    <section className="panel mb-4 p-4 text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Test send history</h2>
        <span className="text-slate-500">{counts.sent} sent · {counts.failed} failed</span>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {filters.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            onClick={() => choose(item.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === item.id ? "border-tide-600 bg-tide-50 text-tide-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {item.label} ({item.count})
          </button>
        ))}
        <input
          className={`${inputClass} ml-auto w-56`}
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search email or template"
          aria-label="Search test sends"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1.5">When</th>
              <th>Receiver</th>
              <th>Sent</th>
              <th>Status</th>
              <th>Template</th>
              <th>Mailbox</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {data?.sends.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap py-1.5 pr-3 text-slate-600">{formatTime(row.createdAt)}</td>
                <td className="pr-3">{row.toEmail}</td>
                <td className="pr-3"><Badge tone={row.status === "sent" ? "green" : "slate"}>{row.status === "sent" ? "Yes" : "No"}</Badge></td>
                <td className="pr-3"><Badge tone={row.status === "sent" ? "green" : "rose"}>{row.status}</Badge></td>
                <td className="pr-3">{row.templateName}</td>
                <td className="pr-3 text-slate-600">{row.fromEmail || "—"}</td>
                <td className="max-w-xs break-words text-xs text-rose-700">{row.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.isLoading && <p className="py-4 text-center text-slate-500">Loading test sends…</p>}
        {data && data.sends.length === 0 && (
          <p className="py-4 text-center text-slate-500">
            {totalRows === 0 ? "No test sends yet. Use Test send on a template and they show up here." : "Nobody in this list."}
          </p>
        )}
        {query.isError && <p className="py-4 text-center text-rose-700">{query.error.message}</p>}
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

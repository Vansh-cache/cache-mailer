import { useQuery } from "@tanstack/react-query";
import { Badge, PageHeader, statusTone } from "../components/ui";
import { api } from "../lib/api";

export function HealthPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  if (health.isError) return <p>Health check failed. The API may be up while the worker is not.</p>;
  if (!health.data) return <p>Checking…</p>;
  const data = health.data;
  return (
    <div>
      <PageHeader title="System health">
        <Badge tone={data.ok ? "green" : "rose"}>{data.ok ? "ok" : "degraded"}</Badge>
      </PageHeader>
      <div className="grid grid-cols-3 gap-3">
        <article className="panel p-4"><div className="text-sm text-slate-500">Database</div><Badge tone={data.db ? "green" : "rose"}>{data.db ? "up" : "down"}</Badge></article>
        <article className="panel p-4"><div className="text-sm text-slate-500">Worker</div><Badge tone={statusTone(data.worker.ok ? "active" : "error")}>{data.worker.ok ? "fresh" : "stale"}</Badge><div className="mt-2 text-xs text-slate-500">{data.worker.lastSeen}</div></article>
        <article className="panel p-4"><div className="text-sm text-slate-500">Queue</div><div>{data.queue.queued} queued · {data.queue.processing} processing</div></article>
      </div>
    </div>
  );
}

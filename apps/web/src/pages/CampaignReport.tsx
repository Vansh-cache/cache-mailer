import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useNavigate, useParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, PageHeader, statusTone } from "../components/ui";
import { api, downloadCsv } from "../lib/api";

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function CampaignReportPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: () => api.campaign(id) });
  const stats = useQuery({ queryKey: ["stats", id], queryFn: () => api.stats(id) });
  const timeline = useQuery({ queryKey: ["timeline", id], queryFn: () => api.timeline(id) });
  const links = useQuery({ queryKey: ["links", id], queryFn: () => api.links(id) });
  const recipients = useQuery({ queryKey: ["recipients", id], queryFn: () => api.recipients(id) });
  const action = useMutation({
    mutationFn: (name: "pause" | "resume" | "cancel") => api.campaignAction(id, name),
    onSuccess: async (_result, name) => {
      toast.success(name === "pause" ? "Campaign paused" : name === "resume" ? "Campaign resumed" : "Campaign cancelled");
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      await queryClient.invalidateQueries({ queryKey: ["stats", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const duplicate = useMutation({
    mutationFn: () => api.campaignAction(id, "duplicate"),
    onSuccess: (result) => {
      if (result.campaign?.id) navigate(`/campaigns/${result.campaign.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (!campaign.data || !stats.data) return <p>Loading report…</p>;
  const status = campaign.data.campaign.status;
  const summary = stats.data.stats;
  const cards = [
    ["Sent", summary?.sent ?? 0],
    ["Delivered (est.)", stats.data.delivered],
    ["Unique opens", summary?.uniqueOpens ?? 0],
    ["Total opens", summary?.totalOpens ?? 0],
    ["Unique clicks", summary?.uniqueClicks ?? 0],
    ["Total clicks", summary?.totalClicks ?? 0],
    ["Open rate", percent(stats.data.rates.open)],
    ["CTR", percent(stats.data.rates.ctr)],
    ["CTOR", percent(stats.data.rates.ctor)],
    ["Bounce", percent(stats.data.rates.bounce)],
    ["Unsubscribe", percent(stats.data.rates.unsubscribe)],
    ["Reply", percent(stats.data.rates.reply)],
  ];
  return (
    <div>
      <PageHeader title={campaign.data.campaign.name}>
        <Badge tone={statusTone(status)}>{status}</Badge>
        {status === "sending" && <Button variant="ghost" onClick={() => action.mutate("pause")}>Pause</Button>}
        {status === "paused" && <Button variant="ghost" onClick={() => action.mutate("resume")}>Resume</Button>}
        {(status === "draft" || status === "scheduled" || status === "sending" || status === "paused") && (
          <Button variant="ghost" onClick={() => action.mutate("cancel")}>Cancel</Button>
        )}
        <Button variant="ghost" onClick={() => duplicate.mutate()}>Duplicate</Button>
        <Button variant="ghost" onClick={() => downloadCsv(`/api/campaigns/${id}/export`, "recipients.csv")}>Export</Button>
      </PageHeader>
      <div className="mb-4 grid grid-cols-4 gap-3">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="panel p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <p className="mb-4 text-sm text-slate-500">Opens are approximate. Delivered is sent minus bounces.</p>
      {campaign.data.campaign.ccEmails && (
        <p className="mb-4 text-sm text-slate-600">
          <span className="font-medium text-ink-900">CC on every mail:</span> {campaign.data.campaign.ccEmails}
        </p>
      )}
      <section className="panel mb-4 h-64 p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline.data?.points ?? []}>
            <CartesianGrid stroke="#e2e8f0" />
            <XAxis dataKey="hourStart" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line dataKey="opens" stroke="#0f766e" dot={false} />
            <Line dataKey="clicks" stroke="#b45309" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>
      <div className="grid grid-cols-2 gap-4">
        <section className="panel p-4 text-sm">
          <h2 className="mb-2 font-medium">Links</h2>
          {links.data?.links.map((link) => (
            <div key={link.id} className="border-b border-slate-100 py-1">{link.original_url} · {Number(link.uniq)} unique</div>
          ))}
        </section>
        <section className="panel p-4 text-sm">
          <h2 className="mb-2 font-medium">Recipients</h2>
          {recipients.data?.recipients.map((row) => (
            <div key={row.id} className="flex justify-between border-b border-slate-100 py-1">
              <span>{row.contact.email}</span><span>{row.status}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Badge, Button, PageHeader, statusTone } from "../components/ui";
import { api, type Overview } from "../lib/api";

function monthYear(value: string): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function titled(data: Overview): string {
  if (data.scope.role === "marketing") return "Marketing dashboard";
  if (data.scope.role === "sales") return "Sales dashboard";
  return "Dashboard";
}

export function DashboardPage() {
  const overview = useQuery({ queryKey: ["overview"], queryFn: api.overview });
  const [problemsOpen, setProblemsOpen] = useState(false);
  if (overview.isLoading) return <p>Loading dashboard…</p>;
  if (overview.isError || !overview.data) return <p>The dashboard could not be loaded.</p>;
  const data = overview.data;
  const growth = data.growth.map((row) => ({ ...row, label: monthYear(row.month) }));
  const bounces = data.bounces.map((row) => ({ ...row, label: monthYear(row.month) }));
  const cards = [
    ["Contacts", data.contacts.total],
    ["Active", data.contacts.active],
    ["Mail sent", data.sent],
    ["Queued", data.queue.queued],
  ];
  const rates = [
    ["Open rate", percent(data.rates.open)],
    ["Click rate", percent(data.rates.click)],
    ["Bounce rate", percent(data.rates.bounce)],
  ];
  return (
    <div>
      <PageHeader title={titled(data)} />
      <div className="mb-3 grid grid-cols-4 gap-3">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="panel p-4">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {rates.map(([label, value]) => (
          <div key={label} className="panel p-4">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <section className="panel p-4">
          <h2 className="mb-3 font-medium">New contacts</h2>
          <Chart data={growth} empty="No contacts yet." />
        </section>
        <section className="panel p-4">
          <h2 className="mb-3 font-medium">Mail sent by category</h2>
          <Chart data={data.sentByCategory.map((row) => ({ label: row.name, count: row.count }))} empty="No mail sent in a category yet." color="#b45309" />
        </section>
      </div>
      <section className="panel mb-4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Bounced mail</h2>
          <button className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-ink-900" aria-label="Bounced and not sent" onClick={() => setProblemsOpen(true)}>
            <ArrowUpRight size={16} />
          </button>
        </div>
        <Chart data={bounces} empty="No bounces yet." color="#be123c" />
      </section>
      <div className="grid grid-cols-[1.2fr_0.8fr] gap-4">
        <section className="panel p-4">
          <h2 className="mb-3 font-medium">Recent campaigns</h2>
          <table className="w-full text-sm">
            <tbody>
              {data.campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-slate-100">
                  <td className="py-2"><Link className="font-medium text-tide-700" to={`/campaigns/${campaign.id}`}>{campaign.name}</Link></td>
                  <td><Badge tone={statusTone(campaign.status)}>{campaign.status}</Badge></td>
                  {data.scope.role === "admin" && <td className="text-slate-500">{campaign.team}</td>}
                  <td className="text-right text-slate-500">{campaign.stats?.sent ?? 0} sent</td>
                </tr>
              ))}
              {data.campaigns.length === 0 && <tr><td className="py-6 text-slate-500">No campaigns yet.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="panel p-4">
          <h2 className="mb-3 font-medium">Mailboxes today</h2>
          <div className="space-y-3 text-sm">
            {data.mailboxes.map((mailbox) => (
              <div key={mailbox.id} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium">{mailbox.fromEmail}</div>
                <div className="text-slate-500">{mailbox.team} · {mailbox.sentToday}/{mailbox.dailyLimit}</div>
              </div>
            ))}
            {data.mailboxes.length === 0 && <p className="text-slate-500">No mailboxes yet.</p>}
          </div>
        </section>
      </div>
      {problemsOpen && <DeliveryList problems={data.problems} onClose={() => setProblemsOpen(false)} />}
    </div>
  );
}

function Chart({ data, empty, color = "#0f766e" }: { data: { label: string; count: number }[]; empty: string; color?: string }) {
  if (data.length === 0) return <p className="py-10 text-sm text-slate-500">{empty}</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" fill={color} radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeliveryList({ problems, onClose }: { problems: Overview["problems"]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: (id: number) => api.retryDelivery(id),
    onSuccess: async () => {
      toast.success("Queued again");
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-ink-950/40 p-4">
      <div className="panel max-h-[80vh] w-full max-w-2xl overflow-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bounced and not sent</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr><th className="py-2">Email</th><th>Campaign</th><th>Result</th><th></th></tr>
          </thead>
          <tbody>
            {problems.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="py-2">{row.email}</td>
                <td>{row.campaign}</td>
                <td className="text-slate-500">{row.kind === "bounced" ? "Bounced" : "Not sent"} · {row.detail}</td>
                <td className="text-right">
                  <Button variant="ghost" disabled={!row.canRetry || retry.isPending} onClick={() => retry.mutate(row.id)}>Retry</Button>
                </td>
              </tr>
            ))}
            {problems.length === 0 && <tr><td className="py-6 text-slate-500" colSpan={4}>Nothing bounced or failed.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

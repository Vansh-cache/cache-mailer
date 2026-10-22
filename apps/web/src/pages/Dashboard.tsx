import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Mail, MousePointerClick, Eye, AlertTriangle, Users, Send, CircleHelp } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Badge, Button, PageHeader, statusTone } from "../components/ui";
import { api, type Overview } from "../lib/api";

const TEAL = "#0f766e";
const BLUE = "#2563eb";
const ROSE = "#be123c";
const AMBER = "#b45309";
const SLATE = "#64748b";
const INK = "#0f172a";

const DELIVERY_COLORS = [TEAL, ROSE];
const SOURCE_COLORS = [TEAL, BLUE];
const TAG_PALETTE = ["#0f766e", "#2563eb", "#b45309", "#7c3aed", "#0891b2", "#be123c", "#334155", "#15803d"];

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

function Empty({ children }: { children: ReactNode }) {
  return <p className="grid h-52 place-items-center text-sm text-slate-500">{children}</p>;
}

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const [problemsOpen, setProblemsOpen] = useState(false);
  if (overview.isLoading) return <p>Loading dashboard…</p>;
  if (overview.isError || !overview.data) return <p>The dashboard could not be loaded.</p>;
  const data = overview.data;

  const growth = data.growth.map((row) => ({ ...row, label: monthYear(row.month) }));
  const sentByMonth = data.sentByMonth.map((row) => ({ ...row, label: monthYear(row.month) }));
  const bounceTrend = data.bounces.map((row) => ({ ...row, label: monthYear(row.month) }));
  const deliveryPie = [
    { name: "Delivered", value: data.delivery.successful },
    { name: "Bounced", value: data.delivery.bounced },
  ].filter((row) => row.value > 0);
  const sourcePie = data.sentBySource.filter((row) => row.count > 0).map((row) => ({ name: row.name, value: row.count }));
  const tagBars = data.contactsByTag.map((row) => ({
    name: row.name.length > 18 ? `${row.name.slice(0, 16)}…` : row.name,
    full: row.name,
    count: row.count,
    predefined: row.predefined,
  }));
  const categoryBars = data.sentByCategory.map((row) => ({
    name: row.name.length > 16 ? `${row.name.slice(0, 14)}…` : row.name,
    full: row.name,
    count: row.count,
  }));
  const deliveryTotal = data.delivery.successful + data.delivery.bounced;
  const activeShare = data.contacts.total === 0 ? 0 : data.contacts.active / data.contacts.total;
  const deliveryHealth = deliveryTotal === 0 ? null : data.delivery.successful / deliveryTotal;
  const monthCount = sentByMonth.length;
  const latestMonth = sentByMonth[sentByMonth.length - 1];
  const topTag = tagBars[0];
  const topCategory = categoryBars[0];

  return (
    <div>
      <PageHeader title={titled(data)} />
      <p className="-mt-3 mb-5 text-sm text-slate-500">
        One place for the full history of this tool · campaigns + test sends · refreshes every 15s.
        Hover the <span className="inline-flex align-text-bottom text-slate-400"><CircleHelp size={14} /></span> on any card or chart for a plain-English explanation of the numbers.
      </p>

      {/* KPI strip */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Contacts"
          value={data.contacts.total}
          hint={`${data.contacts.active} active (${percent(activeShare)})`}
          icon={<Users size={18} />}
          accent="from-teal-700 to-teal-500"
          tipAlign="start"
          explain={`Your full contact list.\n\nNow: ${data.contacts.total} people · ${data.contacts.active} can receive mail.\nUnsubscribed / bounced people are skipped when you send.`}
        />
        <KpiCard
          label="All mail sent"
          value={data.sent}
          hint={`${data.sentBreakdown.campaign} campaign · ${data.sentBreakdown.test} test`}
          icon={<Send size={18} />}
          accent="from-sky-700 to-sky-500"
          tipAlign="center"
          explain={`All emails ever sent from this tool.\n\nNow: ${data.sent} total (${data.sentBreakdown.campaign} campaign + ${data.sentBreakdown.test} test).\nTest send from the editor also counts here.`}
        />
        <KpiCard
          label="In queue"
          value={data.queue.queued + data.queue.processing}
          hint={`${data.queue.queued} waiting · ${data.queue.processing} sending`}
          icon={<Mail size={18} />}
          accent="from-amber-700 to-amber-500"
          tipAlign="center"
          explain={`Mails waiting to go out right now.\n\nNow: ${data.queue.queued} waiting · ${data.queue.processing} sending.\n0 means nothing is mid-send.`}
        />
        <KpiCard
          label="Delivery health"
          value={deliveryHealth == null ? "—" : percent(deliveryHealth)}
          hint={`${data.delivery.successful} ok · ${data.delivery.bounced} bounced`}
          icon={<AlertTriangle size={18} />}
          accent="from-rose-700 to-rose-500"
          tipAlign="end"
          explain={`How campaign mail is doing — delivered vs bounced.\n\nNow: ${data.delivery.successful} delivered · ${data.delivery.bounced} bounced${deliveryHealth == null ? ".\nShows — until a campaign has been sent." : ` · health ${percent(deliveryHealth)}.`}\nTest sends are not counted here.`}
        />
      </div>

      {/* Rate meters */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <RateMeter
          label="Open rate"
          value={data.rates.open}
          icon={<Eye size={16} />}
          color={TEAL}
          tipAlign="start"
          explain={`How many campaign receivers opened the mail.\n\nNow: ${percent(data.rates.open)}.\nStays 0% if you have only done test sends (opens are tracked on campaigns).`}
        />
        <RateMeter
          label="Click rate"
          value={data.rates.click}
          icon={<MousePointerClick size={16} />}
          color={BLUE}
          tipAlign="center"
          explain={`How many campaign receivers clicked a link.\n\nNow: ${percent(data.rates.click)}.\nNeeds a real campaign with links — tests do not count.`}
        />
        <RateMeter
          label="Bounce rate"
          value={data.rates.bounce}
          icon={<AlertTriangle size={16} />}
          color={ROSE}
          invert
          tipAlign="end"
          explain={`How many campaign mails bounced (bad address / full mailbox).\n\nNow: ${percent(data.rates.bounce)} · ${data.delivery.bounced} bounced so far.\nLower is better.`}
        />
      </div>

      {/* Trends + pies */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="panel p-4 xl:col-span-2">
          <SectionHead
            title="Mail sent over time"
            subtitle="Bar chart — campaigns (teal) stacked with test sends (blue)"
            tipAlign="start"
            explain={`Mail sent each month.\nTeal = campaigns · Blue = test sends (stacked).\n\nNow: ${monthCount} month${monthCount === 1 ? "" : "s"} shown${latestMonth ? `.\n${latestMonth.label}: ${latestMonth.campaign} campaign + ${latestMonth.test} test = ${latestMonth.count}` : "."}`}
          />
          {sentByMonth.length === 0 ? (
            <Empty>No mail sent yet.</Empty>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sentByMonth} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: SLATE }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: SLATE }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="campaign" name="Campaigns" stackId="sent" fill={TEAL} radius={[0, 0, 0, 0]} maxBarSize={48} />
                  <Bar dataKey="test" name="Test sends" stackId="sent" fill={BLUE} radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel p-4">
          <SectionHead
            title="How mail left the tool"
            subtitle="Campaign vs test send"
            tipAlign="end"
            explain={`Where your ${data.sent} sent mails came from.\n\nNow: ${data.sentBreakdown.campaign} campaign · ${data.sentBreakdown.test} test.\nMostly test? You have been using Send test, not a campaign yet.`}
          />
          <Donut
            data={sourcePie}
            colors={SOURCE_COLORS}
            center={data.sent}
            centerLabel="total"
            empty="Nothing sent yet."
          />
        </section>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <SectionHead
            title="Delivery result"
            subtitle="Pie — landed successfully vs bounced (campaigns)"
            tipAlign="start"
            explain={`Campaign delivery only (not tests).\n\nNow: ${data.delivery.successful} delivered · ${data.delivery.bounced} bounced.\nEmpty until a campaign has been sent.`}
          />
          <Donut
            data={deliveryPie}
            colors={DELIVERY_COLORS}
            center={deliveryTotal}
            centerLabel="messages"
            empty="No campaign delivery data yet."
          />
        </section>

        <section className="panel p-4">
          <SectionHead
            title="Contact growth"
            subtitle="Bars for each month, line for the trend"
            tipAlign="end"
            explain={`New contacts added each month (import or manual).\nBars = count · line = same trend.\n\nNow: ${data.contacts.total} total · ${growth.length} month${growth.length === 1 ? "" : "s"}${growth[0] ? ` · ${growth[0].label} added ${growth[0].count}` : ""}.`}
          />
          {growth.length === 0 ? (
            <Empty>No contacts yet.</Empty>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={growth} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: SLATE }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: SLATE }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                  <Bar dataKey="count" name="New contacts" fill={TEAL} fillOpacity={0.85} radius={[6, 6, 0, 0]} maxBarSize={48} />
                  <Line type="monotone" dataKey="count" name="Trend" stroke={AMBER} strokeWidth={2.5} dot={{ r: 4, fill: AMBER, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <SectionHead
            title="Contacts by tag"
            subtitle="Vertical bars — predefined and your custom tags"
            tipAlign="start"
            explain={`How many contacts sit in each tag.\n\nNow largest: ${topTag ? `${topTag.full} (${topTag.count})` : "none yet"}.\nSomeone with two tags appears in both bars.`}
          />
          {tagBars.length === 0 ? (
            <Empty>No tags yet. Import with a category or Other tag.</Empty>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tagBars} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: INK }} interval={0} angle={tagBars.length > 5 ? -28 : 0} textAnchor={tagBars.length > 5 ? "end" : "middle"} height={tagBars.length > 5 ? 64 : 32} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: SLATE }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, _name, item) => [value, (item?.payload as { full?: string })?.full ?? "Contacts"]}
                  />
                  <Bar dataKey="count" name="Contacts" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {tagBars.map((entry, index) => (
                      <Cell key={entry.full} fill={TAG_PALETTE[index % TAG_PALETTE.length]} fillOpacity={entry.count === 0 ? 0.25 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="panel p-4">
          <SectionHead
            title="Mail sent by category / tag"
            subtitle="Horizontal bars — who received campaign mail, plus Test send"
            tipAlign="end"
            explain={`Mails sent per audience tag (campaigns), plus a Test send bar.\n\nNow top: ${topCategory ? `${topCategory.full} (${topCategory.count})` : "none yet"}.`}
          />
          {categoryBars.length === 0 ? (
            <Empty>No mail sent in a category yet.</Empty>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBars} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: SLATE }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: INK }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, _name, item) => [value, (item?.payload as { full?: string })?.full ?? "Sent"]}
                  />
                  <Bar dataKey="count" name="Mails sent" fill={AMBER} radius={[0, 6, 6, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <section className="panel mb-4 p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <SectionHead
            title="Bounce trend"
            subtitle="Area — hard and soft bounces by month"
            tipAlign="start"
            explain={`Bounces over time (campaigns).\n\nNow: ${data.delivery.bounced} bounced in total.\nOpen list to see who failed and retry if needed.`}
          />
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-tide-600 hover:text-tide-700"
            onClick={() => setProblemsOpen(true)}
          >
            Open list <ArrowUpRight size={14} />
          </button>
        </div>
        {bounceTrend.length === 0 ? (
          <Empty>No bounces yet.</Empty>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bounceTrend} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gBounce" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ROSE} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={ROSE} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: SLATE }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: SLATE }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" name="Bounces" stroke={ROSE} fill="url(#gBounce)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="panel p-4">
          <SectionHead
            title="Recent campaigns"
            subtitle="Latest activity across teams you can see"
            tipAlign="start"
            explain={`Your latest campaigns and status.\n\nNow showing ${data.campaigns.length}.\n“Sent” = how many people that campaign already reached.\nClick a name for the full report.`}
          />
          <table className="mt-2 w-full text-sm">
            <tbody>
              {data.campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-slate-100">
                  <td className="py-2.5"><Link className="font-medium text-tide-700" to={`/campaigns/${campaign.id}`}>{campaign.name}</Link></td>
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
          <SectionHead
            title="Mailboxes today"
            subtitle="Daily quota used so far"
            tipAlign="end"
            explain={`How much of today’s send limit each mailbox has used.\n\nNow: ${data.mailboxes.length} mailbox${data.mailboxes.length === 1 ? "" : "es"}.\nBar fills as you approach the daily limit.`}
          />
          <div className="mt-3 space-y-3 text-sm">
            {data.mailboxes.map((mailbox) => {
              const used = mailbox.dailyLimit === 0 ? 0 : Math.min(1, mailbox.sentToday / mailbox.dailyLimit);
              return (
                <div key={mailbox.id} className="group/mailbox relative rounded-xl border border-slate-200 bg-slate-50/60 p-3" title={`${mailbox.fromEmail}: ${mailbox.sentToday} of ${mailbox.dailyLimit} daily limit used today (${percent(used)}). Team: ${mailbox.team}.`}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink-900">{mailbox.fromEmail}</div>
                      <div className="text-xs text-slate-500">{mailbox.team}</div>
                    </div>
                    <div className="shrink-0 text-xs font-semibold text-slate-600">{mailbox.sentToday}/{mailbox.dailyLimit}</div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div className="h-full rounded-full bg-tide-700 transition-all" style={{ width: `${used * 100}%` }} />
                  </div>
                </div>
              );
            })}
            {data.mailboxes.length === 0 && <p className="text-slate-500">No mailboxes yet.</p>}
          </div>
        </section>
      </div>

      {problemsOpen && <DeliveryList problems={data.problems} onClose={() => setProblemsOpen(false)} />}
    </div>
  );
}

const tooltipStyle = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
  fontSize: 12,
};

type TipAlign = "start" | "center" | "end";

function HelpTip({ text, align = "start" }: { text: string; align?: TipAlign }) {
  // Keep the bubble inside the dashboard: left cards open rightward, right cards open leftward.
  const panel =
    align === "end"
      ? "left-auto right-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "left-0 right-auto";
  const arrow =
    align === "end"
      ? "right-3 left-auto"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "left-3";
  return (
    <span className="group/help relative inline-flex shrink-0">
      <button
        type="button"
        className="grid h-5 w-5 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-tide-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-tide-600/40"
        aria-label="What does this mean?"
      >
        <CircleHelp size={14} />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-[calc(100%+8px)] z-40 max-w-[min(18rem,calc(100vw-2rem))] w-64 rounded-xl border border-slate-200 bg-ink-950 px-3 py-2.5 text-left text-[11px] leading-relaxed text-white opacity-0 shadow-xl transition group-hover/help:opacity-100 group-focus-within/help:opacity-100 ${panel}`}
      >
        {text.split("\n").map((line, index) => (
          <span key={index} className={line === "" ? "mt-1.5 block" : "block"}>
            {line || "\u00a0"}
          </span>
        ))}
        <span className={`absolute bottom-full border-4 border-transparent border-b-ink-950 ${arrow}`} />
      </span>
    </span>
  );
}

function SectionHead({ title, subtitle, explain, tipAlign = "start" }: { title: string; subtitle: string; explain: string; tipAlign?: TipAlign }) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        <h2 className="font-medium text-ink-950">{title}</h2>
        <HelpTip text={explain} align={tipAlign} />
      </div>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  accent,
  explain,
  tipAlign = "start",
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: ReactNode;
  accent: string;
  explain: string;
  tipAlign?: TipAlign;
}) {
  return (
    <div className="panel relative overflow-visible p-4">
      <div className={`absolute inset-y-0 left-0 w-1 rounded-l-xl bg-gradient-to-b ${accent}`} />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <span>{label}</span>
            <HelpTip text={explain} align={tipAlign} />
          </div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight text-ink-950">{value}</div>
          <div className="mt-1 text-xs text-slate-500">{hint}</div>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-tide-800">{icon}</span>
      </div>
    </div>
  );
}

function RateMeter({
  label,
  value,
  icon,
  color,
  invert = false,
  explain,
  tipAlign = "start",
}: {
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
  invert?: boolean;
  explain: string;
  tipAlign?: TipAlign;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const tone = invert && pct > 0.05 ? "text-rose-700" : "text-ink-950";
  return (
    <div className="panel relative overflow-visible p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <span className="text-slate-400">{icon}</span>
          {label}
          <HelpTip text={explain} align={tipAlign} />
        </div>
        <div className={`text-lg font-semibold ${tone}`}>{percent(pct)}</div>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">Based on campaign delivery history</p>
    </div>
  );
}

function Donut({
  data,
  colors,
  center,
  centerLabel,
  empty,
}: {
  data: { name: string; value: number }[];
  colors: string[];
  center: number;
  centerLabel: string;
  empty: string;
}) {
  if (data.length === 0) return <Empty>{empty}</Empty>;
  const total = data.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="relative flex h-64 items-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} paddingAngle={3} stroke="#fff" strokeWidth={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
          <Legend verticalAlign="bottom" height={28} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-7">
        <div className="text-center">
          <div className="text-2xl font-semibold text-ink-950">{center}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">{centerLabel}</div>
        </div>
      </div>
      <div className="sr-only">{total} total</div>
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

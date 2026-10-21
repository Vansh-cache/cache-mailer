import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../components/ui";
import { api } from "../lib/api";

export function AuditPage() {
  const audit = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  if (audit.isError) return <p>The audit log could not be loaded.</p>;
  if (!audit.data) return <p>Loading audit log…</p>;
  return (
    <div>
      <PageHeader title="Audit log" />
      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {audit.data.entries.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-2 text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{entry.actor}</td>
                <td>{entry.action}</td>
                <td className="text-slate-500">{entry.detail}</td>
              </tr>
            ))}
            {audit.data.entries.length === 0 && (
              <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>No actions recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

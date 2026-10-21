import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-tide-700 text-white hover:bg-tide-600",
    ghost: "bg-white text-ink-900 border border-slate-300 hover:bg-slate-50",
    danger: "bg-rose-700 text-white hover:bg-rose-600",
  }[variant];
  return <button className={`rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${className}`} {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink-700">{label}</span>
      {children}
    </label>
  );
}

export const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "rose" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export function statusTone(status: string): "slate" | "green" | "amber" | "rose" {
  if (status === "sent" || status === "active") return "green";
  if (status === "sending" || status === "scheduled" || status === "paused") return "amber";
  if (status === "failed" || status === "error" || status === "bounced" || status === "cancelled") return "rose";
  return "slate";
}

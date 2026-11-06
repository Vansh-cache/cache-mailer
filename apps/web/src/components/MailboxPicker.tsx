import { useMemo } from "react";

export type MailboxOption = {
  id: number;
  fromEmail: string;
  fromName: string;
  teamId: number;
  team?: { name: string };
};

type Props = {
  senders: MailboxOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
  teamId?: number | null;
  role?: "admin" | "marketing" | "sales";
  compact?: boolean;
  emptyLabel?: string;
};

export function MailboxPicker({
  senders,
  selected,
  onChange,
  teamId = null,
  role = "admin",
  compact = false,
  emptyLabel,
}: Props) {
  const options = useMemo(() => {
    if (role === "admin" || teamId == null) return senders;
    return senders.filter((sender) => sender.teamId === teamId);
  }, [senders, teamId, role]);
  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };
  return (
    <div className={`${compact ? "max-h-28 w-56 flex-none" : "max-h-40"} space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2`}>
      {options.map((sender) => (
        <label key={sender.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-slate-50 ${compact ? "py-0.5 text-xs" : "py-1 text-sm"}`}>
          <input type="checkbox" checked={selected.includes(sender.id)} onChange={() => toggle(sender.id)} />
          <span className="min-w-0 flex-1 truncate">{sender.fromEmail}</span>
          {!compact && (
            <span className="shrink-0 text-[11px] text-slate-400">{sender.team?.name ?? `Team ${sender.teamId}`}</span>
          )}
        </label>
      ))}
      {options.length === 0 && (
        <p className="px-1 py-2 text-xs text-slate-500">
          {emptyLabel
            ?? (role !== "admin" && !teamId
              ? "Choose a team first to see its mailboxes."
              : "No mailboxes yet. Add one under Mailboxes.")}
        </p>
      )}
    </div>
  );
}

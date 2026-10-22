import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { z } from "zod";
import { Button, Field, PageHeader, inputClass } from "../components/ui";
import { api, type User } from "../lib/api";

const schema = z
  .object({
    name: z.string().min(1, "Enter a name"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(10, "Password must be at least 10 characters"),
    role: z.enum(["admin", "marketing", "sales"]),
    teamId: z.coerce.number().int().positive().optional().or(z.literal("")),
    senderIds: z.array(z.number().int().positive()).default([]),
  })
  .superRefine((values, ctx) => {
    if (values.role !== "admin" && !values.teamId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["teamId"], message: "Choose a team for Marketing and Sales users" });
    }
  });

type FormValues = z.infer<typeof schema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-rose-600">{message}</p>;
}

function MailboxPicker({
  senders,
  selected,
  onChange,
  teamId,
  role,
}: {
  senders: { id: number; fromEmail: string; fromName: string; teamId: number; team?: { name: string } }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  teamId: number | null;
  role: "admin" | "marketing" | "sales";
}) {
  const options = useMemo(() => {
    if (role === "admin" || teamId == null) return senders;
    return senders.filter((sender) => sender.teamId === teamId);
  }, [senders, teamId, role]);
  const toggle = (id: number) => {
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  };
  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
      {options.map((sender) => (
        <label key={sender.id} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50">
          <input type="checkbox" checked={selected.includes(sender.id)} onChange={() => toggle(sender.id)} />
          <span className="min-w-0 flex-1 truncate">{sender.fromEmail}</span>
          <span className="shrink-0 text-[11px] text-slate-400">{sender.team?.name ?? `Team ${sender.teamId}`}</span>
        </label>
      ))}
      {options.length === 0 && (
        <p className="px-1 py-2 text-xs text-slate-500">
          {role !== "admin" && !teamId ? "Choose a team first to see its mailboxes." : "No mailboxes yet. Add one under Mailboxes."}
        </p>
      )}
    </div>
  );
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const senders = useQuery({ queryKey: ["senders"], queryFn: api.senders });
  const [editing, setEditing] = useState<User | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", role: "marketing", teamId: "", senderIds: [] },
  });
  const errors = form.formState.errors;
  const role = form.watch("role");
  const teamIdRaw = form.watch("teamId");
  const teamId = teamIdRaw ? Number(teamIdRaw) : null;
  const senderIds = form.watch("senderIds") ?? [];
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  };
  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.createUser({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role,
        teamId: values.teamId ? Number(values.teamId) : null,
        senderIds: values.senderIds,
      }),
    onSuccess: async () => {
      toast.success("User created. They can sign in now.");
      form.reset({ name: "", email: "", password: "", role: "marketing", teamId: "", senderIds: [] });
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: (user: User) => api.updateUser(user.id, { isActive: !(user.isActive ?? true) }),
    onSuccess: async (_result, user) => {
      toast.success(user.isActive === false ? "User enabled" : "User disabled");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const resetPassword = useMutation({
    mutationFn: (input: { id: number; password: string }) => api.updateUser(input.id, { password: input.password }),
    onSuccess: () => toast.success("Password updated"),
    onError: (error: Error) => toast.error(error.message),
  });
  const askResetPassword = (user: User) => {
    const password = window.prompt(`Set a new password for ${user.email} (at least 10 characters)`);
    if (!password) return;
    if (password.length < 10) {
      toast.error("Password must be at least 10 characters");
      return;
    }
    resetPassword.mutate({ id: user.id, password });
  };
  // Drop mailbox picks that no longer match the chosen team.
  useEffect(() => {
    if (role === "admin" || !teamId) return;
    const allowed = new Set((senders.data?.senders ?? []).filter((sender) => sender.teamId === teamId).map((sender) => sender.id));
    const next = senderIds.filter((id) => allowed.has(id));
    if (next.length !== senderIds.length) form.setValue("senderIds", next);
  }, [role, teamId, senders.data?.senders]);

  return (
    <div>
      <PageHeader title="Users" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4 text-sm">
          {users.data?.users.map((user) => (
            <div key={user.id} className="flex flex-col gap-2 border-b border-slate-100 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="font-medium">{user.name}</div>
                <div className="text-slate-500">
                  {user.email} · {user.role} · {user.teamName ?? "all teams"} · {user.isActive === false ? "disabled" : "active"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Mailboxes:{" "}
                  {(user.mailboxes?.length ?? 0) === 0
                    ? "none assigned (sees team mailboxes until you assign)"
                    : user.mailboxes!.map((box) => box.fromEmail).join(", ")}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                <Button variant="ghost" onClick={() => setEditing(user)}>Edit</Button>
                <Button variant="ghost" onClick={() => askResetPassword(user)}>Reset password</Button>
                <Button variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(user)}>
                  {user.isActive === false ? "Enable" : "Disable"}
                </Button>
              </div>
            </div>
          ))}
          {(users.data?.users.length ?? 0) === 0 && <p className="text-slate-500">No users yet. Create the first one on the right.</p>}
        </div>
        <form className="panel max-h-[min(90vh,820px)] space-y-3 overflow-y-auto p-4" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
          <h2 className="font-medium">Create user</h2>
          <Field label="Name">
            <input className={inputClass} {...form.register("name")} />
            <FieldError message={errors.name?.message} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" {...form.register("email")} />
            <FieldError message={errors.email?.message} />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" {...form.register("password")} />
            <FieldError message={errors.password?.message} />
          </Field>
          <Field label="Role">
            <select className={inputClass} {...form.register("role")}>
              <option value="marketing">Marketing</option>
              <option value="sales">Sales</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Team">
            <select className={inputClass} {...form.register("teamId")}>
              <option value="">None (admins only)</option>
              {teams.data?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <FieldError message={errors.teamId?.message} />
          </Field>
          <Field label="Mailboxes they can send from">
            <MailboxPicker
              senders={senders.data?.senders ?? []}
              selected={senderIds}
              onChange={(ids) => form.setValue("senderIds", ids, { shouldDirty: true })}
              teamId={teamId}
              role={role}
            />
            <p className="mt-1 text-xs text-slate-500">Tick one or more. You can change this later with Edit. Leave empty for now and they keep team-wide access until you assign.</p>
          </Field>
          <Button type="submit" disabled={create.isPending}>Create user</Button>
          <p className="text-xs text-slate-500">Share the password privately. The user signs in with this email and password.</p>
        </form>
      </div>
      {editing && (
        <EditUserDialog
          user={editing}
          teams={teams.data?.teams ?? []}
          senders={senders.data?.senders ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function EditUserDialog({
  user,
  teams,
  senders,
  onClose,
  onSaved,
}: {
  user: User;
  teams: { id: number; name: string }[];
  senders: { id: number; fromEmail: string; fromName: string; teamId: number; team?: { name: string } }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<User["role"]>(user.role);
  const [teamId, setTeamId] = useState<number | "">(user.teamId ?? "");
  const [senderIds, setSenderIds] = useState<number[]>(() => user.mailboxes?.map((box) => box.id) ?? []);
  const [password, setPassword] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api.updateUser(user.id, {
        name,
        role,
        teamId: teamId === "" ? null : Number(teamId),
        senderIds,
        ...(password.trim() ? { password: password.trim() } : {}),
      }),
    onSuccess: async () => {
      toast.success("User updated");
      await onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  useEffect(() => {
    if (role === "admin" || teamId === "") return;
    const allowed = new Set(senders.filter((sender) => sender.teamId === Number(teamId)).map((sender) => sender.id));
    setSenderIds((current) => current.filter((id) => allowed.has(id)));
  }, [role, teamId, senders]);

  return (
    <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-ink-950/40 p-4">
      <form
        className="panel flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden"
        onSubmit={(event) => {
          event.preventDefault();
          if (role !== "admin" && !teamId) {
            toast.error("Choose a team for Marketing and Sales users");
            return;
          }
          if (password.trim() && password.trim().length < 10) {
            toast.error("Password must be at least 10 characters");
            return;
          }
          save.mutate();
        }}
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold">Edit user</h2>
          <p className="mt-1 text-sm text-slate-500">{user.email}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as User["role"])}>
              <option value="marketing">Marketing</option>
              <option value="sales">Sales</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Team">
            <select className={inputClass} value={teamId} onChange={(event) => setTeamId(event.target.value ? Number(event.target.value) : "")}>
              <option value="">None (admins only)</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </Field>
          <Field label="Mailboxes they can send from">
            <MailboxPicker
              senders={senders}
              selected={senderIds}
              onChange={setSenderIds}
              teamId={teamId === "" ? null : Number(teamId)}
              role={role}
            />
            <p className="mt-1 text-xs text-slate-500">Add or remove mailboxes anytime. Clearing all returns them to team-wide access.</p>
          </Field>
          <Field label="New password (optional)">
            <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leave blank to keep current password" />
          </Field>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>Save changes</Button>
        </div>
      </form>
    </div>
  );
}

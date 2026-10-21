import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function UsersPage() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const teams = useQuery({ queryKey: ["teams"], queryFn: api.teams });
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "", role: "marketing", teamId: "" } });
  const errors = form.formState.errors;
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  };
  const create = useMutation({
    mutationFn: (values: FormValues) => api.createUser({ ...values, teamId: values.teamId ? Number(values.teamId) : null }),
    onSuccess: async () => {
      toast.success("User created. They can sign in now.");
      form.reset({ name: "", email: "", password: "", role: "marketing", teamId: "" });
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
  return (
    <div>
      <PageHeader title="Users" />
      <div className="grid grid-cols-[1fr_320px] gap-4">
        <div className="panel p-4 text-sm">
          {users.data?.users.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2">
              <div>
                <div className="font-medium">{user.name}</div>
                <div className="text-slate-500">
                  {user.email} · {user.role} · {user.teamName ?? "all teams"} · {user.isActive === false ? "disabled" : "active"}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => askResetPassword(user)}>Reset password</Button>
                <Button variant="ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(user)}>
                  {user.isActive === false ? "Enable" : "Disable"}
                </Button>
              </div>
            </div>
          ))}
          {(users.data?.users.length ?? 0) === 0 && <p className="text-slate-500">No users yet. Create the first one on the right.</p>}
        </div>
        <form className="panel space-y-3 p-4" onSubmit={form.handleSubmit((values) => create.mutate(values))}>
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
          <Button type="submit" disabled={create.isPending}>Create user</Button>
          <p className="text-xs text-slate-500">Share the password privately. The user signs in with this email and password — there are no demo accounts.</p>
        </form>
      </div>
    </div>
  );
}

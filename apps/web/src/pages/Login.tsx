import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button, Field, inputClass } from "../components/ui";
import { api, ensureCsrf } from "../lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  useEffect(() => {
    ensureCsrf().catch(() => toast.error("Could not reach the API"));
  }, []);
  const login = useMutation({
    mutationFn: (values: z.infer<typeof schema>) => api.login(values.email, values.password),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/");
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="grid min-h-screen place-items-center bg-ink-950">
      <form className="panel w-full max-w-md p-8" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
        <div className="text-xs uppercase tracking-[0.18em] text-tide-700">Cachedigitech</div>
        <h1 className="mb-6 text-2xl font-semibold">Sign in to Mailer</h1>
        <div className="space-y-4">
          <Field label="Email">
            <input className={inputClass} type="email" {...form.register("email")} />
            {form.formState.errors.email && <p className="mt-1 text-xs text-rose-600">{form.formState.errors.email.message}</p>}
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" {...form.register("password")} />
            {form.formState.errors.password && <p className="mt-1 text-xs text-rose-600">{form.formState.errors.password.message}</p>}
          </Field>
          <Button className="w-full" type="submit" disabled={login.isPending}>Sign in</Button>
        </div>
      </form>
    </div>
  );
}

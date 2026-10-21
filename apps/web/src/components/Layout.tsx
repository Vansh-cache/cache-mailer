import {
  HeartPulse,
  ScrollText,
  LayoutDashboard,
  Mail,
  Megaphone,
  Settings,
  Users,
  Inbox,
  GitBranch,
  LogOut,
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, type User } from "../lib/api";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "Contacts & Audience", icon: Users },
  { to: "/templates", label: "Email Templates", icon: Mail },
  { to: "/campaigns", label: "Email Campaigns", icon: Megaphone },
  { to: "/growth", label: "Growth", icon: GitBranch },
  { to: "/mailboxes", label: "Mailboxes", icon: Inbox },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="grid h-dvh grid-cols-[240px_1fr] overflow-hidden">
      <aside className="flex h-full min-h-0 flex-col bg-ink-950 text-slate-200">
        <div className="px-5 py-6">
          <div className="text-lg font-semibold text-white">Cachedigitech</div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.to === "/"} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5"}`}>
              <link.icon size={16} />
              {link.label}
            </NavLink>
          ))}
          {user.role === "admin" && (
            <>
              <NavLink to="/users" className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5"}`}>
                <Users size={16} /> Users
              </NavLink>
              <NavLink to="/health" className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5"}`}>
                <HeartPulse size={16} /> Health
              </NavLink>
              <NavLink to="/audit" className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "hover:bg-white/5"}`}>
                <ScrollText size={16} /> Audit
              </NavLink>
            </>
          )}
        </nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <div className="font-medium text-white">{user.name}</div>
          <div className="text-slate-400">{user.role}{user.teamName ? ` · ${user.teamName}` : ""}</div>
          <button className="mt-3 flex items-center gap-2 text-slate-300" onClick={() => logout.mutate()}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-h-0 min-w-0 overflow-y-auto px-8 py-6">
        <Outlet />
      </main>
    </div>
  );
}

import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { api, unwrapJson } from "../../lib/api-client";
import { qk } from "../../lib/query-keys";
import { useUiStore } from "../../stores/ui";

function NavItem(props: { to: string; label: string; badge?: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === props.to || (props.to !== "/" && pathname.startsWith(props.to));

  return (
    <Link
      to={props.to as any}
      className={[
        "group flex items-center justify-between rounded-[var(--radius-md)] px-3 py-2 text-sm",
        "transition-colors",
        active
          ? "bg-[color-mix(in_oklab,var(--bg-tertiary)_92%,black)] text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
      ].join(" ")}
    >
      <span className="font-medium">{props.label}</span>
      {props.badge}
    </Link>
  );
}

export function Sidebar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  const pendingCount = useQuery({
    queryKey: qk.reviewQueueCount({ status: "pending" }),
    queryFn: async () => {
      const res = await api.api["review-queue"].count.$get({ query: { status: "pending" } });
      const json = await unwrapJson<{ count: number }>(res);
      return json.count;
    },
    staleTime: 10_000,
  });

  if (!sidebarOpen) return null;

  const badge =
    (pendingCount.data ?? 0) > 0 ? (
      <span className="rounded-full bg-[color-mix(in_oklab,var(--accent-task)_22%,transparent)] px-2 py-[2px] font-mono text-[10px] font-semibold text-[var(--accent-task)]">
        {pendingCount.data}
      </span>
    ) : null;

  return (
    <aside className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      <div className="border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="font-[var(--font-display)] text-[13px] font-extrabold tracking-[-0.02em] text-[var(--text-primary)]">
          Navigation
        </div>
        <div className="mt-1 text-xs text-[var(--text-tertiary)]">
          Review low-confidence calls before they fossilize.
        </div>
      </div>
      <nav className="space-y-1 p-2">
        <NavItem to="/projects" label="Projects" />
        <NavItem to="/review" label="Review queue" badge={badge} />
        <NavItem to="/settings" label="Settings" />
      </nav>

      <div className="px-4 pb-4 pt-3">
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Tip
          </div>
          <div className="mt-2 text-sm text-[var(--text-secondary)]">
            Capture ruthlessly. The review queue is your throttle.
          </div>
        </div>
      </div>
    </aside>
  );
}

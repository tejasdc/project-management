import * as React from "react";

type Variant = "default" | "muted" | "success" | "warning" | "danger";

export function Badge(props: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const { className, variant = "default", ...rest } = props;
  const base = "inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.14em]";
  const variants: Record<Variant, string> = {
    default: "border border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]",
    muted: "bg-[color-mix(in_oklab,var(--bg-tertiary)_82%,black)] text-[var(--text-tertiary)]",
    success: "bg-[color-mix(in_oklab,var(--action-accept)_18%,transparent)] text-[var(--text-primary)]",
    warning: "bg-[color-mix(in_oklab,var(--confidence-medium)_22%,transparent)] text-[var(--text-primary)]",
    danger: "bg-[color-mix(in_oklab,var(--action-reject)_18%,transparent)] text-[var(--text-primary)]",
  };

  return <span {...rest} className={[base, variants[variant], className].filter(Boolean).join(" ")} />;
}


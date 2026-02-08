import * as React from "react";

type Variant = "default" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
) {
  const { className, variant = "default", size = "md", ...rest } = props;

  const base =
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  const sizes: Record<Size, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
  };

  const variants: Record<Variant, string> = {
    default:
      "bg-[color-mix(in_oklab,var(--accent-task)_22%,transparent)] text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--accent-task)_30%,transparent)]",
    secondary:
      "bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--bg-tertiary)_86%,black)] border border-[var(--border-subtle)]",
    ghost:
      "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]",
    danger:
      "bg-[color-mix(in_oklab,var(--action-reject)_18%,transparent)] text-[var(--text-primary)] hover:bg-[color-mix(in_oklab,var(--action-reject)_26%,transparent)]",
  };

  return (
    <button
      {...rest}
      className={[base, sizes[size], variants[variant], className].filter(Boolean).join(" ")}
    />
  );
}


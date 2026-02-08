import * as React from "react";

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return (
    <select
      {...rest}
      className={[
        "h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none",
        "focus:border-[var(--border-medium)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}


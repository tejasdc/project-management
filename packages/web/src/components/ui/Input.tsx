import * as React from "react";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={[
        "h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)] outline-none",
        "placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-medium)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}


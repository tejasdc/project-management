import * as React from "react";

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      {...rest}
      className={[
        "rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-secondary)_92%,black)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div {...rest} className={["border-b border-[var(--border-subtle)] p-4", className].filter(Boolean).join(" ")} />;
}

export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div {...rest} className={["p-4", className].filter(Boolean).join(" ")} />;
}


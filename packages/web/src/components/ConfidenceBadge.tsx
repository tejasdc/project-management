export function ConfidenceBadge(props: { value: number | null | undefined }) {
  const v = typeof props.value === "number" ? Math.max(0, Math.min(props.value, 1)) : null;
  const pct = v === null ? "—" : `${Math.round(v * 100)}%`;

  const tone =
    v === null ? "neutral" : v >= 0.9 ? "high" : v >= 0.7 ? "medium" : "low";

  const styles =
    tone === "high"
      ? "border-[color-mix(in_oklab,var(--confidence-high)_35%,transparent)] bg-[color-mix(in_oklab,var(--confidence-high)_18%,transparent)] text-[var(--confidence-high)]"
      : tone === "medium"
      ? "border-[color-mix(in_oklab,var(--confidence-medium)_35%,transparent)] bg-[color-mix(in_oklab,var(--confidence-medium)_18%,transparent)] text-[var(--confidence-medium)]"
      : tone === "low"
      ? "border-[color-mix(in_oklab,var(--confidence-low)_35%,transparent)] bg-[color-mix(in_oklab,var(--confidence-low)_18%,transparent)] text-[var(--confidence-low)]"
      : "border-[var(--border-subtle)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-2 py-[2px] font-mono text-[10px] font-semibold",
        styles,
      ].join(" ")}
      title={v === null ? "No confidence" : `Confidence: ${pct}`}
    >
      {pct}
    </span>
  );
}


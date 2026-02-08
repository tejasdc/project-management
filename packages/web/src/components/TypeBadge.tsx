export function TypeBadge(props: { type: "task" | "decision" | "insight" }) {
  const { type } = props;
  const color =
    type === "task"
      ? "var(--accent-task)"
      : type === "decision"
      ? "var(--accent-decision)"
      : "var(--accent-insight)";

  const label = type === "task" ? "TASK" : type === "decision" ? "DECISION" : "INSIGHT";

  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-bold tracking-[0.14em]"
      style={{
        borderColor: `color-mix(in oklab, ${color} 40%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
}


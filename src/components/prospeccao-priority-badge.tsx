export function ProspeccaoPriorityBadge({
  label,
  color,
  overdueAlert
}: {
  label: string | null;
  color?: string | null;
  overdueAlert?: boolean;
}) {
  const text = label?.trim() || "—";
  const bg = color?.startsWith("#") ? color : null;

  if (bg) {
    return (
      <span
        className="prospeccao-queue-badge"
        style={{
          background: `${bg}22`,
          color: bg,
          borderColor: `${bg}55`
        }}
      >
        {overdueAlert ? <span className="prospeccao-queue-badge__bang">!</span> : null}
        {text}
      </span>
    );
  }

  return (
    <span className="prospeccao-queue-badge prospeccao-queue-badge--default">
      {overdueAlert ? <span className="prospeccao-queue-badge__bang">!</span> : null}
      {text}
    </span>
  );
}

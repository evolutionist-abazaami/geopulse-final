const ITEMS = [
  { color: "bg-critical", label: "Critical alert" },
  { color: "bg-warning", label: "Warning" },
  { color: "bg-stable", label: "Stable" },
  { color: "bg-brand", label: "Monitored region" },
] as const;

export function MapLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-10 glass border border-border-subtle rounded-md px-3 py-2.5 space-y-1.5">
      {ITEMS.map(({ color, label }) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${color}`} />
          <span className="text-[11px] text-v2-secondary">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({
  title,
  collapsed,
  onToggle,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="ml-auto inline-flex h-7 cursor-pointer items-center rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-canvas-hover hover:text-foreground"
      >
        {collapsed ? "Show" : "Hide"}
      </button>
    </div>
  );
}

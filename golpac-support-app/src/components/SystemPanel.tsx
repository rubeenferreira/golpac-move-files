import "./SystemPanel.css";

type SystemPanelProps = {
  metrics: {
    free_disk_c_gb: number;
    total_disk_c_gb: number;
    timestamp: string;
  } | null;
};

export function SystemPanel({ metrics }: SystemPanelProps) {
  const total = metrics?.total_disk_c_gb ?? 0;
  const free = metrics?.free_disk_c_gb ?? 0;
  const usedPercent = total > 0 ? ((total - free) / total) * 100 : 0;
  const healthWarning = usedPercent >= 85;

  return (
    <div className="system-panel">
      <div className="system-card">
        <h2>Disk usage</h2>
        <p>Drive C: overview at {metrics?.timestamp || "unknown"}</p>
        <div className="disk-bar">
          <div
            className={`disk-fill ${healthWarning ? "warn" : ""}`}
            style={{ width: `${Math.min(100, usedPercent)}%` }}
          />
        </div>
        <div className="disk-stats">
          <span>{usedPercent.toFixed(0)}% full</span>
          <span>{free.toFixed(1)} GB free of {total.toFixed(1)} GB</span>
        </div>
        {healthWarning && (
          <div className="disk-warning">
            Drive C: is heavily used. This may cause performance issues. Please reach out to IT Support.
          </div>
        )}
      </div>
    </div>
  );
}

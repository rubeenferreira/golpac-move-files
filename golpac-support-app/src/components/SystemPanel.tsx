import "./SystemPanel.css";

type DiskMetric = {
  name: string;
  mount: string;
  total_gb: number;
  free_gb: number;
};

type MetricsShape = {
  free_disk_c_gb: number;
  total_disk_c_gb: number;
  timestamp: string;
  uptime_human?: string;
  uptime_seconds?: number;
  memory_total_gb?: number;
  memory_used_gb?: number;
  cpu_usage_percent?: number;
  cpu_brand?: string | null;
  default_gateway?: string | null;
  gateway_ping_ms?: number | null;
  public_ip?: string | null;
  disks?: DiskMetric[];
};

type SystemInfoShape = {
  hostname?: string;
  ipv4?: string;
  domain?: string | null;
};

type SystemPanelProps = {
  metrics: MetricsShape | null;
  info: SystemInfoShape | null;
};

export function SystemPanel({ metrics, info }: SystemPanelProps) {
  const diskEntries =
    metrics?.disks && metrics.disks.length > 0
      ? metrics.disks
      : metrics
      ? [
          {
            name: "Drive C:",
            mount: "C:",
            total_gb: metrics.total_disk_c_gb ?? 0,
            free_gb: metrics.free_disk_c_gb ?? 0,
          },
        ]
      : [];

  const hostname = info?.hostname || "Unknown system";
  const ipv4 = info?.ipv4 || "Unknown";
  const domainText = info?.domain ? info.domain : "Not connected to a domain";

  const memoryTotal = metrics?.memory_total_gb ?? 0;
  const memoryUsed = metrics?.memory_used_gb ?? 0;
  const cpuBrand = metrics?.cpu_brand || "Unknown processor";
  const cpuUsage = metrics?.cpu_usage_percent ?? 0;

  const summaryFacts = [
    { label: "System name", value: hostname },
    { label: "IPv4", value: ipv4 },
    { label: "Domain", value: domainText },
    {
      label: "RAM",
      value:
        memoryTotal > 0
          ? `${memoryUsed.toFixed(1)} GB / ${memoryTotal.toFixed(1)} GB`
          : "Unknown",
    },
    { label: "CPU", value: cpuBrand },
  ];

  const statusFacts = [
    { label: "Uptime", value: metrics?.uptime_human || "Unknown" },
    {
      label: "CPU usage",
      value: `${Math.round(cpuUsage)}%`,
    },
    {
      label: "Default gateway",
      value: metrics?.default_gateway || "Unknown",
    },
    {
      label: "Gateway ping",
      value:
        metrics?.gateway_ping_ms != null
          ? `${Math.round(metrics.gateway_ping_ms)} ms`
          : "No response",
    },
    {
      label: "Public IP",
      value: metrics?.public_ip || "Unknown",
    },
    {
      label: "Captured",
      value: metrics?.timestamp || "Unknown",
    },
  ];

  return (
    <div className="system-panel">
      <div className="system-grid">
        <div className="system-card">
          <h2>System summary</h2>
          <p>Snapshot of this workstation.</p>
          <dl className="system-facts">
            {summaryFacts.map((fact) => (
              <div key={fact.label} className="fact-row">
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="system-card">
          <h2>Health & network</h2>
          <p>Live metrics gathered in the background.</p>
          {metrics ? (
            <dl className="system-facts">
              {statusFacts.map((fact) => (
                <div key={fact.label} className="fact-row">
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="system-empty">Metrics are still loading…</div>
          )}
        </div>
      </div>

      <div className="system-card">
        <h2>Storage overview</h2>
        <p>Each detected drive is listed below.</p>
        {diskEntries.length === 0 ? (
          <div className="system-empty">No disk information available.</div>
        ) : (
          <div className="disk-grid">
            {diskEntries.map((disk) => {
              const usedPercent =
                disk.total_gb > 0
                  ? ((disk.total_gb - disk.free_gb) / disk.total_gb) * 100
                  : 0;
              const warn = usedPercent >= 85;
              return (
                <div key={`${disk.name}-${disk.mount}`} className="disk-card">
                  <div className="disk-header">
                    <strong>{disk.name || disk.mount}</strong>
                    <span>{disk.mount}</span>
                  </div>
                  <div className="disk-bar">
                    <div
                      className={`disk-fill ${warn ? "warn" : ""}`}
                      style={{ width: `${Math.min(100, usedPercent)}%` }}
                    />
                  </div>
                  <div className="disk-stats">
                    <span>{usedPercent.toFixed(0)}% full</span>
                    <span>
                      {disk.free_gb.toFixed(1)} GB free of{" "}
                      {disk.total_gb.toFixed(1)} GB
                    </span>
                  </div>
                  {warn && (
                    <div className="disk-warning">
                      This drive is running low on free space. Reach out to IT
                      if performance issues occur.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

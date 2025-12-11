type Urgency = "Low" | "Normal" | "High";

export type TicketRecord = {
  id: string;
  createdAt: string;
  subject: string;
  category: string;
  description: string;
  userEmail?: string | null;
  urgency: Urgency;
};

type TicketHistoryProps = {
  tickets: TicketRecord[];
  expandedId: string | null;
  onToggle: (id: string) => void;
};

export function TicketHistory({ tickets, expandedId, onToggle }: TicketHistoryProps) {
  if (tickets.length === 0) {
    return (
      <div className="troubleshoot-card">
        <h2>Ticket History</h2>
        <p>No tickets have been submitted from this device yet.</p>
      </div>
    );
  }

  return (
    <div className="troubleshoot-card">
      <h2>Ticket History</h2>
      <div className="app-context-list" style={{ maxHeight: "70vh", overflowY: "auto" }}>
        <ul className="app-context-list">
          {tickets.map((t) => (
            <li key={t.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span className="label">{new Date(t.createdAt).toLocaleString()}</span>
                <button
                  type="button"
                  className={`secondary-btn ${expandedId === t.id ? "active" : ""}`}
                  style={{ padding: "6px 10px", fontSize: "12px" }}
                  onClick={() => onToggle(t.id)}
                >
                  {expandedId === t.id ? "Hide details" : "View details"}
                </button>
              </div>
              <span className="value">
                <strong>{t.subject}</strong> · {t.category} · {t.urgency}
                {t.userEmail ? ` · ${t.userEmail}` : ""}
              </span>
              {expandedId === t.id && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: 8,
                  }}
                >
                  <div>
                    <strong>Description:</strong> {t.description || "Not provided"}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

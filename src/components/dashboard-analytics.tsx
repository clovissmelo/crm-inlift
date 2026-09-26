"use client";

const CHANNEL_LABEL: Record<string, string> = {
  call: "Ligações",
  whatsapp: "WhatsApp",
  email: "E-mail"
};

const CHANNEL_COLOR: Record<string, string> = {
  call: "#58a6ff",
  whatsapp: "#2dd4bf",
  email: "#f39c12"
};

function formatTimelineLabel(label: string, period: string) {
  if (period === "7d" || period === "today" || period === "yesterday") {
    const d = new Date(`${label}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).format(d);
    }
  }
  return label;
}

function pct(part: number, whole: number) {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function MultiLineChart({
  labels,
  series,
  period
}: {
  labels: string[];
  series: Array<{ channel: string; values: number[] }>;
  period: string;
}) {
  const width = 520;
  const height = 160;
  const pad = { t: 12, r: 8, b: 28, l: 8 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxY = Math.max(1, ...series.flatMap((s) => s.values));
  const pointCount = Math.max(labels.length, 1);

  function xAt(i: number) {
    if (pointCount <= 1) return pad.l + innerW / 2;
    return pad.l + (i / (pointCount - 1)) * innerW;
  }
  function yAt(v: number) {
    return pad.t + innerH - (v / maxY) * innerH;
  }

  const displayLabels =
    labels.length > 0 ? labels : ["—"];

  return (
    <svg className="dash-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Abordagens ao longo do tempo">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={pad.l}
          x2={width - pad.r}
          y1={pad.t + innerH * (1 - t)}
          y2={pad.t + innerH * (1 - t)}
          className="dash-line-chart-grid"
        />
      ))}
      {series.map((s) => {
        const points = s.values.length ? s.values : [0];
        const d = points
          .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
          .join(" ");
        const color = CHANNEL_COLOR[s.channel] ?? "#58a6ff";
        return (
          <g key={s.channel}>
            <path d={`${d} L ${xAt(points.length - 1).toFixed(1)} ${(pad.t + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(pad.t + innerH).toFixed(1)} Z`} fill={color} opacity={0.12} />
            <path d={d} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        );
      })}
      {displayLabels.map((label, i) => (
        <text key={`${label}-${i}`} x={xAt(i)} y={height - 6} className="dash-line-chart-axis" textAnchor="middle">
          {formatTimelineLabel(label, period)}
        </text>
      ))}
    </svg>
  );
}

export type DashboardAnalyticsData = {
  period: string;
  approaches_by_channel: Array<{ channel: string; count: number }>;
  approaches_timeline: {
    labels: string[];
    series: Array<{ channel: string; values: number[] }>;
  };
  unique_clients_attempted: number;
  clients_reached: number;
  meetings_scheduled: number;
  deals_converted: number;
  call_results: Array<{ result: string; count: number }>;
  bdr_activity: Array<{ bdr_name: string; approaches: number; meetings: number; clients: number }>;
};

export function DashboardAnalytics({ data }: { data: DashboardAnalyticsData }) {
  const channelTotals = data.approaches_by_channel;
  const attempted = data.unique_clients_attempted;
  const reached = data.clients_reached;
  const meetings = data.meetings_scheduled;
  const converted = data.deals_converted;

  const funnel = [
    { label: "Tentados", value: attempted, pct: null as number | null },
    { label: "Conseguimos falar", value: reached, pct: pct(reached, attempted) },
    { label: "Reuniões", value: meetings, pct: pct(meetings, reached) },
    { label: "Convertidos", value: converted, pct: pct(converted, meetings) }
  ];
  const funnelMax = Math.max(attempted, 1);

  const callTotal = data.call_results.reduce((s, r) => s + r.count, 0) || 1;
  const callRows = data.call_results.slice(0, 6);

  return (
    <div className="dash-analytics-grid">
      <section className="dash-panel dash-analytics-panel">
        <div className="dash-panel-head">
          <div>
            <h2>Atividade comercial</h2>
            <p className="dash-panel-sub">Abordagens ao longo do tempo</p>
          </div>
        </div>
        <ul className="dash-channel-legend">
          {(["call", "whatsapp", "email"] as const).map((ch) => {
            const count = channelTotals.find((c) => c.channel === ch)?.count ?? 0;
            return (
              <li key={ch}>
                <span className="dash-channel-dot" style={{ background: CHANNEL_COLOR[ch] }} aria-hidden />
                {CHANNEL_LABEL[ch]} · {count}
              </li>
            );
          })}
        </ul>
        <MultiLineChart labels={data.approaches_timeline.labels} series={data.approaches_timeline.series} period={data.period} />
      </section>

      <section className="dash-panel dash-analytics-panel">
        <div className="dash-panel-head">
          <div>
            <h2>Do primeiro contato ao fechamento</h2>
            <p className="dash-panel-sub">Funil no período selecionado</p>
          </div>
        </div>
        <ul className="dash-funnel-list">
          {funnel.map((step) => (
            <li key={step.label}>
              <div className="dash-funnel-row-head">
                <span>{step.label}</span>
                <span className="dash-funnel-meta">
                  <strong>{step.value}</strong>
                  {step.pct != null ? <span className="muted"> · {step.pct}%</span> : null}
                </span>
              </div>
              <div className="dash-funnel-track">
                <div className="dash-funnel-fill" style={{ width: `${Math.max(4, (step.value / funnelMax) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="dash-temp-foot">Percentuais entre etapas consecutivas do funil.</p>
      </section>

      <section className="dash-panel dash-analytics-panel">
        <div className="dash-panel-head">
          <div>
            <h2>Resultado das ligações</h2>
            <p className="dash-panel-sub">Distribuição no período</p>
          </div>
        </div>
        {callRows.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.8125rem" }}>
            Nenhuma ligação registrada no período.
          </p>
        ) : (
          <ul className="dash-call-results">
            {callRows.map((row, i) => (
              <li key={row.result}>
                <div className="dash-call-results-head">
                  <span>{row.result}</span>
                  <span>
                    {row.count} · {pct(row.count, callTotal)}%
                  </span>
                </div>
                <div className="dash-funnel-track">
                  <div
                    className="dash-funnel-fill dash-funnel-fill-alt"
                    style={{
                      width: `${Math.max(4, (row.count / callTotal) * 100)}%`,
                      opacity: 1 - i * 0.12
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dash-panel dash-analytics-panel">
        <div className="dash-panel-head">
          <div>
            <h2>Atividade por BDR</h2>
            <p className="dash-panel-sub">Abordagens, reuniões e carteira</p>
          </div>
        </div>
        {data.bdr_activity.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.8125rem" }}>
            Sem dados de BDR para os filtros atuais.
          </p>
        ) : (
          <div className="dash-bdr-table-wrap">
            <table className="dash-bdr-table">
              <thead>
                <tr>
                  <th>BDR</th>
                  <th>Abordagens</th>
                  <th>Reuniões</th>
                  <th>Clientes</th>
                </tr>
              </thead>
              <tbody>
                {data.bdr_activity.map((row) => (
                  <tr key={row.bdr_name}>
                    <td>{row.bdr_name}</td>
                    <td>{row.approaches}</td>
                    <td>{row.meetings}</td>
                    <td>{row.clients}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

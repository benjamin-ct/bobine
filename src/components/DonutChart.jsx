// Donut à 2 segments (films / séries). Couleurs catégorielles validées
// colorblind-safe (voir la skill dataviz — palette par défaut, slots 1 & 2).
const RADIUS = 52;
const STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 5; // px, espace entre les deux segments

export default function DonutChart({ segments, centerLabel, centerValue }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return null;
  }

  let cumulative = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const length = (s.value / total) * CIRCUMFERENCE - GAP;
      const arc = { ...s, length: Math.max(length, 0), offset: -cumulative };
      cumulative += (s.value / total) * CIRCUMFERENCE;
      return arc;
    });

  return (
    <div className="donut-chart">
      <svg
        width={(RADIUS + STROKE) * 2}
        height={(RADIUS + STROKE) * 2}
        viewBox={`0 0 ${(RADIUS + STROKE) * 2} ${(RADIUS + STROKE) * 2}`}
        role="img"
        aria-label={segments.map((s) => `${s.label} : ${s.value}`).join(", ")}
      >
        <g transform={`translate(${RADIUS + STROKE}, ${RADIUS + STROKE}) rotate(-90)`}>
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${arc.length} ${CIRCUMFERENCE - arc.length}`}
              strokeDashoffset={arc.offset}
            />
          ))}
        </g>
        {(centerValue != null || centerLabel) && (
          <>
            {centerValue != null && (
              <text x="50%" y="47%" textAnchor="middle" className="donut-chart__value">
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text x="50%" y="63%" textAnchor="middle" className="donut-chart__label">
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>

      <ul className="donut-chart__legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="donut-chart__swatch" style={{ background: s.color }} />
            {s.label} — {s.value} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

import styles from "./DonutChart.module.css";

// Donut à N segments. Couleurs catégorielles passées par l'appelant (voir
// la skill dataviz — palette par défaut, slots 1 & 2, colorblind-safe).
const RADIUS = 52;
const STROKE = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP = 5; // px, espace entre deux segments

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  centerLabel?: string;
  centerValue?: number | string;
}

export default function DonutChart({ segments, centerLabel, centerValue }: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return null;
  }

  const { arcs } = segments
    .filter((s) => s.value > 0)
    .reduce(
      (acc, s) => {
        const length = (s.value / total) * CIRCUMFERENCE - GAP;
        acc.arcs.push({ ...s, length: Math.max(length, 0), offset: -acc.cumulative });
        acc.cumulative += (s.value / total) * CIRCUMFERENCE;
        return acc;
      },
      { arcs: [] as Array<DonutSegment & { length: number; offset: number }>, cumulative: 0 }
    );

  return (
    <div className={styles.chart}>
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
              <text x="50%" y="47%" textAnchor="middle" className={styles.value}>
                {centerValue}
              </text>
            )}
            {centerLabel && (
              <text x="50%" y="63%" textAnchor="middle" className={styles.label}>
                {centerLabel}
              </text>
            )}
          </>
        )}
      </svg>

      <ul className={styles.legend}>
        {segments.map((s) => (
          <li key={s.label}>
            <span className={styles.swatch} style={{ background: s.color }} />
            {s.label} — {s.value} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

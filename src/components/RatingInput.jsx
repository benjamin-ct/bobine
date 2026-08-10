import { useState } from "react";

const VALUES = Array.from({ length: 10 }, (_, i) => i + 1);

export default function RatingInput({ value, onRate }) {
  const [hovered, setHovered] = useState(null);
  const displayValue = hovered ?? value ?? 0;

  return (
    <div className="rating-input" onMouseLeave={() => setHovered(null)}>
      <div className="rating-input__stars">
        {VALUES.map((n) => (
          <button
            key={n}
            type="button"
            className={`rating-input__star ${n <= displayValue ? "rating-input__star--filled" : ""}`}
            onMouseEnter={() => setHovered(n)}
            onClick={() => onRate(n === value ? null : n)}
            title={`${n}/10`}
          >
            ★
          </button>
        ))}
      </div>
      <span className="rating-input__value">{value ? `${value}/10` : "Pas encore noté"}</span>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../lib/motion.ts";

/**
 * Valeur affichée qui défile jusqu'à `target` (compteur des statistiques du
 * profil) : de 0 au premier affichage, puis de l'ancienne à la nouvelle
 * valeur quand elle change. Arrondi à `decimals` chiffres après la virgule.
 * Sans animation si le système demande de réduire les animations.
 */
export function useCountUp(target: number, duration = 900, decimals = 0): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target || prefersReducedMotion()) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const factor = 10 ** decimals;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // ease-out cubique : rapide au début, ralentit en arrivant.
      const eased = 1 - (1 - p) ** 3;
      const current = Math.round((from + (target - from) * eased) * factor) / factor;
      fromRef.current = current;
      setValue(current);
      if (p < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, decimals]);

  return value;
}

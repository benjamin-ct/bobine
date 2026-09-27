import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "../../../shared/components/index.ts";
import {
  AVATAR_MAX_ZOOM,
  avatarCropSide,
  clampAvatarCrop,
  drawAvatarCrop,
  initialAvatarCrop,
  type AvatarCrop,
} from "../../../shared/lib/avatarImage.ts";
import styles from "./AvatarCropDialog.module.css";

// Résolution du canvas d'aperçu (affiché en CSS à 280 px au plus) : assez pour
// rester net sur un écran Retina.
const PREVIEW_SIZE = 640;

interface Props {
  /** Photo à recadrer ; la modale est ouverte tant qu'elle est non nulle. */
  image: ImageBitmap | null;
  busy: boolean;
  /** Échec de l'enregistrement, affiché dans la modale restée ouverte. */
  error: string | null;
  onCancel: () => void;
  onConfirm: (crop: AvatarCrop) => void;
}

// Modale de recadrage de la photo de profil, ouverte juste après le choix du
// fichier : glisser pour déplacer, pincer / molette / curseur pour zoomer,
// flèches et +/- au clavier. `<dialog>` natif pour la top layer, le piège à
// focus et la touche Échap (comme MembersOnlyDialog).
export default function AvatarCropDialog({ image, busy, error, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState<AvatarCrop | null>(null);
  // Doigts / souris posés sur l'aperçu, pour le glisser et le pincement.
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (image) {
      setCrop(initialAvatarCrop(image));
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [image]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (context && image && crop) {
      drawAvatarCrop(context, image, crop, PREVIEW_SIZE);
    }
  }, [image, crop]);

  function update(change: (current: AvatarCrop) => AvatarCrop) {
    if (!image) {
      return;
    }
    setCrop((current) => (current ? clampAvatarCrop(image, change(current)) : current));
  }

  /** Pixels de l'image source par pixel CSS de l'aperçu. */
  function sourcePerCssPixel(zoom: number): number {
    const width = canvasRef.current?.getBoundingClientRect().width || 1;
    return image ? avatarCropSide(image, zoom) / width : 1;
  }

  // Molette : écouteur non passif pour empêcher la page de défiler derrière.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) {
      return;
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCrop((current) =>
        current
          ? clampAvatarCrop(image, { ...current, zoom: current.zoom * Math.exp(-e.deltaY * 0.002) })
          : current
      );
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [image]);

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const previous = pointers.current.get(e.pointerId);
    if (!previous) {
      return;
    }
    const next = { x: e.clientX, y: e.clientY };
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    pointers.current.set(e.pointerId, next);
    if (others.length === 0) {
      // Un seul doigt : l'image suit le doigt, donc le centre part à l'opposé.
      update((current) => {
        const ratio = sourcePerCssPixel(current.zoom);
        return {
          ...current,
          centerX: current.centerX - (next.x - previous.x) * ratio,
          centerY: current.centerY - (next.y - previous.y) * ratio,
        };
      });
    } else {
      // Pincement : le zoom suit l'écart entre les deux doigts.
      const other = others[0][1];
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0) {
        update((current) => ({ ...current, zoom: current.zoom * (after / before) }));
      }
    }
  }

  function onPointerUp(e: PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const step = PREVIEW_SIZE / 20;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key in moves) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      update((current) => {
        const ratio = avatarCropSide(image!, current.zoom) / PREVIEW_SIZE;
        return {
          ...current,
          centerX: current.centerX + dx * ratio,
          centerY: current.centerY + dy * ratio,
        };
      });
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      const factor = e.key === "-" ? 1 / 1.1 : 1.1;
      update((current) => ({ ...current, zoom: current.zoom * factor }));
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="avatar-crop-title"
      // Échap : annule, comme le bouton du même nom.
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) {
          onCancel();
        }
      }}
    >
      {image && crop && (
        <div className={styles.content}>
          <button
            type="button"
            className={styles.close}
            onClick={onCancel}
            disabled={busy}
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <Icon name="close" />
          </button>
          <h2 id="avatar-crop-title" className={styles.title}>
            {t("accountCard.avatarCropTitle")}
          </h2>
          <p className={styles.text}>{t("accountCard.avatarCropHint")}</p>

          <div className={styles.frame}>
            <canvas
              ref={canvasRef}
              className={styles.canvas}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              tabIndex={0}
              role="img"
              aria-label={t("accountCard.avatarCropPreview")}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
            />
          </div>

          <label className={styles.zoom}>
            <Icon name="search" />
            <input
              type="range"
              min={1}
              max={AVATAR_MAX_ZOOM}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => update((current) => ({ ...current, zoom: Number(e.target.value) }))}
              aria-label={t("accountCard.avatarCropZoom")}
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={busy}>
              {t("accountCard.avatarCropCancel")}
            </button>
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={() => onConfirm(crop)}
              disabled={busy}
            >
              {busy ? t("accountCard.saving") : t("accountCard.avatarCropConfirm")}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

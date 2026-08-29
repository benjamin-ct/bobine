import { useState, type DragEvent } from "react";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { MediaCard, Dropdown, EmptyState } from "../../../shared/components/index.ts";
import dropdownStyles from "../../../shared/components/Dropdown/Dropdown.module.css";
import { libraryItemToMediaItem } from "../../../shared/lib/libraryItem.ts";
import gridStyles from "../../../shared/styles/mediaGrid.module.css";
import type { LibraryItem } from "../../../core/types/library.ts";
import styles from "./WatchlistPanel.module.css";

type SortMode = "manual" | "title" | "year" | "note";
const SORTS: Array<{ id: SortMode; label: string }> = [
  { id: "manual", label: "Manuel" },
  { id: "title", label: "A → Z" },
  { id: "year", label: "Année" },
  { id: "note", label: "Note" },
];

function makeKey(item: LibraryItem): string {
  return `${item.mediaType}:${item.id}`;
}

export default function WatchlistPanel({ items }: { items: LibraryItem[] }) {
  const { reorderWatchlist } = useLibrary();
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; after: boolean } | null>(null);

  if (items.length === 0) {
    return <EmptyState label="Liste vide. Ajoutez des titres avec « Envie de voir »." />;
  }

  const sorted =
    sortMode === "manual"
      ? items
      : [...items].sort((a, b) => {
          if (sortMode === "title") {
            return a.title.localeCompare(b.title, "fr");
          }
          if (sortMode === "year") {
            return (b.date || "").localeCompare(a.date || "");
          }
          return (b.rating ?? -1) - (a.rating ?? -1);
        });

  const manual = sortMode === "manual";

  function onDragStart(key: string) {
    setDragKey(key);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>, key: string) {
    if (!manual || !dragKey || dragKey === key) {
      return;
    }
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientX - rect.left > rect.width / 2;
    setDropTarget({ key, after });
  }
  function onDrop(key: string) {
    if (dragKey && dragKey !== key && dropTarget) {
      reorderWatchlist(dragKey, key, dropTarget.after);
    }
    setDragKey(null);
    setDropTarget(null);
  }

  return (
    <div>
      <div className={styles.tools}>
        {manual && <span className={styles.dragHint}>Glissez pour réordonner</span>}
        <span className={styles.spacer} />
        <Dropdown
          label={<>Trier&nbsp;: {SORTS.find((s) => s.id === sortMode)?.label}</>}
          align="right"
        >
          <div className={dropdownStyles.head}>Trier par</div>
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${dropdownStyles.option} ${sortMode === s.id ? dropdownStyles.optionOn : ""}`}
              onClick={() => setSortMode(s.id)}
            >
              <span className={dropdownStyles.radio} /> {s.label}
            </button>
          ))}
        </Dropdown>
      </div>

      <div className={gridStyles.grid}>
        {sorted.map((item) => {
          const key = makeKey(item);
          return (
            <div
              key={key}
              draggable={manual}
              onDragStart={() => onDragStart(key)}
              onDragOver={(e) => onDragOver(e, key)}
              onDragLeave={() => setDropTarget((t) => (t?.key === key ? null : t))}
              onDrop={() => onDrop(key)}
              onDragEnd={() => {
                setDragKey(null);
                setDropTarget(null);
              }}
              className={`${manual ? styles.draggable : ""} ${dragKey === key ? styles.dragging : ""} ${
                dropTarget?.key === key
                  ? dropTarget.after
                    ? styles.dropAfter
                    : styles.dropBefore
                  : ""
              }`}
            >
              <MediaCard item={libraryItemToMediaItem(item)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

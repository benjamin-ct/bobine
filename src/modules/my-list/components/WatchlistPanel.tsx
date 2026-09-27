import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { MediaCard, Dropdown, EmptyState, Icon } from "../../../shared/components/index.ts";
import dropdownStyles from "../../../shared/components/Dropdown/Dropdown.module.css";
import { libraryItemToMediaItem } from "../../../shared/lib/libraryItem.ts";
import { neighborOf, useSortable } from "../../../shared/hooks/useSortable.ts";
import gridStyles from "../../../shared/styles/mediaGrid.module.css";
import type { LibraryItem } from "../../../core/types/library.ts";
import styles from "./WatchlistPanel.module.css";

type SortMode = "manual" | "title" | "year" | "note";
const SORTS: Array<{ id: SortMode; labelKey: string }> = [
  { id: "manual", labelKey: "watchlistPanel.sortManual" },
  { id: "title", labelKey: "watchlistPanel.sortTitle" },
  { id: "year", labelKey: "watchlistPanel.sortYear" },
  { id: "note", labelKey: "watchlistPanel.sortRating" },
];

function makeKey(item: LibraryItem): string {
  return `${item.mediaType}:${item.id}`;
}

export default function WatchlistPanel({ items }: { items: LibraryItem[] }) {
  const { t } = useTranslation();
  const { reorderWatchlist } = useLibrary();
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const manual = sortMode === "manual";
  const canSort = manual && items.length > 1;
  const byKey = new Map(items.map((item) => [makeKey(item), item]));
  // Glisser à la souris sur toute l'affiche, au doigt depuis la poignée ⋮⋮.
  const sortable = useSortable({
    keys: items.map(makeKey),
    enabled: canSort,
    onReorder: (next, moved) => {
      const { toKey, after } = neighborOf(next, moved);
      reorderWatchlist(moved, toKey, after);
    },
  });

  if (items.length === 0) {
    return <EmptyState label={t("watchlistPanel.emptyState")} />;
  }

  const sorted = manual
    ? sortable.order.map((key) => byKey.get(key)!)
    : [...items].sort((a, b) => {
        if (sortMode === "title") {
          return a.title.localeCompare(b.title, "fr");
        }
        if (sortMode === "year") {
          return (b.date || "").localeCompare(a.date || "");
        }
        return (b.rating ?? -1) - (a.rating ?? -1);
      });

  return (
    <div>
      <div className={styles.tools}>
        {canSort && <span className={styles.dragHint}>{t("watchlistPanel.dragHint")}</span>}
        <span className={styles.spacer} />
        <Dropdown
          label={
            <>
              {t("watchlistPanel.sortLabel")}&nbsp;:{" "}
              {t(SORTS.find((s) => s.id === sortMode)?.labelKey ?? "")}
            </>
          }
          align="right"
        >
          <div className={dropdownStyles.head}>{t("watchlistPanel.sortBy")}</div>
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${dropdownStyles.option} ${sortMode === s.id ? dropdownStyles.optionOn : ""}`}
              onClick={() => setSortMode(s.id)}
            >
              <span className={dropdownStyles.radio} /> {t(s.labelKey)}
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
              {...(canSort ? sortable.itemProps(key) : {})}
              className={`${styles.sortItem} ${canSort ? styles.draggable : ""} ${
                sortable.dragKey === key ? styles.dragging : ""
              }`}
            >
              <MediaCard item={libraryItemToMediaItem(item)} />
              {canSort && (
                <span className={styles.dragHandle} data-drag-handle aria-hidden>
                  <Icon name="dragHandle" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

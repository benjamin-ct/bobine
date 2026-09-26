import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { MediaCard, Dropdown, EmptyState, Icon } from "../../../shared/components/index.ts";
import dropdownStyles from "../../../shared/components/Dropdown/Dropdown.module.css";
import { libraryItemToMediaItem } from "../../../shared/lib/libraryItem.ts";
import { posterUrl, formatFullDate } from "../../../core/api/tmdb.ts";
import { useLocale } from "../../../core/context/LocaleContext.tsx";
import { posterAccentFromGenres } from "../../../shared/lib/posterAccent.ts";
import posterStyles from "../../../shared/styles/posterAccents.module.css";
import gridStyles from "../../../shared/styles/mediaGrid.module.css";
import type { CustomList, LibraryItem } from "../../../core/types/library.ts";
import ListShareControls from "./ListShareControls.tsx";
import styles from "./CustomListPanel.module.css";

interface CustomListPanelProps {
  list: CustomList;
  onDeleted: () => void;
}

type SortMode = "manual" | "title" | "year";
const SORTS: Array<{ id: SortMode; labelKey: string }> = [
  { id: "manual", labelKey: "customListPanel.sortManual" },
  { id: "title", labelKey: "customListPanel.sortTitle" },
  { id: "year", labelKey: "customListPanel.sortYear" },
];

type ViewMode = "grid" | "list";

function makeKey(item: LibraryItem): string {
  return `${item.mediaType}:${item.id}`;
}

export default function CustomListPanel({ list, onDeleted }: CustomListPanelProps) {
  const { t } = useTranslation();
  const { getListItems, deleteList, renameList, reorderList } = useLibrary();
  const { locale } = useLocale();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ key: string; after: boolean } | null>(null);
  const items = getListItems(list.id);

  function handleDelete() {
    if (window.confirm(t("customListPanel.confirmDelete", { name: list.name }))) {
      deleteList(list.id);
      onDeleted();
    }
  }

  function submitRename() {
    renameList(list.id, renameValue);
    setRenaming(false);
  }

  const manual = sortMode === "manual";
  const sorted =
    sortMode === "title"
      ? [...items].sort((a, b) => a.title.localeCompare(b.title, "fr"))
      : sortMode === "year"
        ? [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""))
        : items;

  function onDragStart(key: string) {
    setDragKey(key);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>, key: string) {
    if (!manual || !dragKey || dragKey === key) {
      return;
    }
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const after =
      viewMode === "grid"
        ? e.clientX - rect.left > rect.width / 2
        : e.clientY - rect.top > rect.height / 2;
    setDropTarget({ key, after });
  }
  function onDrop(key: string) {
    if (dragKey && dragKey !== key && dropTarget) {
      reorderList(list.id, dragKey, key, dropTarget.after);
    }
    setDragKey(null);
    setDropTarget(null);
  }
  function onDragEnd() {
    setDragKey(null);
    setDropTarget(null);
  }

  return (
    <div>
      <div className={styles.tools}>
        {renaming ? (
          <form
            className={styles.renameForm}
            onSubmit={(e) => {
              e.preventDefault();
              submitRename();
            }}
          >
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={40}
              autoFocus
            />
            <button type="submit">{t("customListPanel.rename")}</button>
            <button type="button" onClick={() => setRenaming(false)}>
              {t("customListPanel.cancel")}
            </button>
          </form>
        ) : (
          <span className={styles.hint}>
            {items.length
              ? `${list.name} · ${t("customListPanel.itemsCount", { count: items.length })}`
              : t("customListPanel.addHint")}
          </span>
        )}
        <span className={styles.spacer} />
        {items.length > 0 && (
          <>
            {manual && <span className={styles.dragHint}>{t("customListPanel.dragHint")}</span>}
            <div
              className={styles.viewToggle}
              role="group"
              aria-label={t("customListPanel.viewModeAriaLabel")}
            >
              <button
                type="button"
                className={`${styles.viewBtn} ${viewMode === "grid" ? styles.viewBtnOn : ""}`}
                aria-pressed={viewMode === "grid"}
                title={t("customListPanel.gridViewTitle")}
                onClick={() => setViewMode("grid")}
              >
                <Icon name="grid" />
              </button>
              <button
                type="button"
                className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnOn : ""}`}
                aria-pressed={viewMode === "list"}
                title={t("customListPanel.listViewTitle")}
                onClick={() => setViewMode("list")}
              >
                <Icon name="grip" />
              </button>
            </div>
            <Dropdown
              label={
                <>
                  {t("customListPanel.sortLabel")}&nbsp;:{" "}
                  {t(SORTS.find((s) => s.id === sortMode)?.labelKey ?? "")}
                </>
              }
              align="right"
            >
              <div className={dropdownStyles.head}>{t("customListPanel.sortBy")}</div>
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
          </>
        )}
        <ListShareControls listId={list.id} listName={list.name} />
        {!renaming && (
          <button type="button" className={styles.ghostBtn} onClick={() => setRenaming(true)}>
            <Icon name="edit" /> {t("customListPanel.renameButton")}
          </button>
        )}
        <button type="button" className={styles.ghostBtn} onClick={handleDelete}>
          <Icon name="trash" /> {t("customListPanel.deleteButton")}
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState label={t("customListPanel.emptyState", { name: list.name })} />
      ) : viewMode === "grid" ? (
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
                onDragEnd={onDragEnd}
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
      ) : (
        <div className={styles.rows}>
          {sorted.map((item) => {
            const key = makeKey(item);
            const accentKey = posterAccentFromGenres(item.genreIds, key);
            return (
              <div
                key={key}
                draggable={manual}
                onDragStart={() => onDragStart(key)}
                onDragOver={(e) => onDragOver(e, key)}
                onDragLeave={() => setDropTarget((t) => (t?.key === key ? null : t))}
                onDrop={() => onDrop(key)}
                onDragEnd={onDragEnd}
                className={`${styles.row} ${manual ? styles.draggable : ""} ${dragKey === key ? styles.dragging : ""} ${
                  dropTarget?.key === key
                    ? dropTarget.after
                      ? styles.rowDropAfter
                      : styles.rowDropBefore
                    : ""
                }`}
              >
                <Link to={`/media/${item.mediaType}/${item.id}`} className={styles.rowThumb}>
                  {item.posterPath ? (
                    <img src={posterUrl(item.posterPath, "w92") ?? undefined} alt={item.title} />
                  ) : (
                    <div
                      className={posterStyles[accentKey]}
                      style={{ width: "100%", height: "100%" }}
                    />
                  )}
                </Link>
                <Link to={`/media/${item.mediaType}/${item.id}`} className={styles.rowBody}>
                  <span className={styles.rowTitle}>{item.title}</span>
                  <span className={styles.rowSub}>
                    {item.mediaType === "movie"
                      ? t("navBar.mediaTypeMovie")
                      : t("navBar.mediaTypeSeries")}
                    {item.date
                      ? ` · ${formatFullDate(item.date, locale) || item.date.slice(0, 4)}`
                      : ""}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

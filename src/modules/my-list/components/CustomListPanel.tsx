import { useState } from "react";
import { useLibrary } from "../../../core/context/LibraryContext.tsx";
import { MediaCard, EmptyState } from "../../../shared/components/index.ts";
import { libraryItemToMediaItem } from "../../../shared/lib/libraryItem.ts";
import gridStyles from "../../../shared/styles/mediaGrid.module.css";
import type { CustomList } from "../../../core/types/library.ts";
import styles from "./CustomListPanel.module.css";

interface CustomListPanelProps {
  list: CustomList;
  onDeleted: () => void;
}

export default function CustomListPanel({ list, onDeleted }: CustomListPanelProps) {
  const { getListItems, deleteList, renameList } = useLibrary();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const items = getListItems(list.id);

  function handleDelete() {
    if (
      window.confirm(
        `Supprimer la liste « ${list.name} » ? Les titres eux-mêmes resteront dans vos autres listes.`
      )
    ) {
      deleteList(list.id);
      onDeleted();
    }
  }

  function submitRename() {
    renameList(list.id, renameValue);
    setRenaming(false);
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
            <button type="submit">Renommer</button>
            <button type="button" onClick={() => setRenaming(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <span className={styles.hint}>
            {items.length
              ? `${list.name} · ${items.length} titre${items.length > 1 ? "s" : ""}`
              : "Ajoutez des titres via « Ajouter à… » sur leur fiche."}
          </span>
        )}
        <span className={styles.spacer} />
        {!renaming && (
          <button type="button" className={styles.ghostBtn} onClick={() => setRenaming(true)}>
            ✏️ Renommer
          </button>
        )}
        <button type="button" className={styles.ghostBtn} onClick={handleDelete}>
          🗑️ Supprimer la liste
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          label={`« ${list.name} » est vide. Ouvrez un titre et utilisez « Ajouter à… » pour le ranger ici.`}
        />
      ) : (
        <div className={gridStyles.grid}>
          {items.map((item) => (
            <MediaCard key={`${item.mediaType}:${item.id}`} item={libraryItemToMediaItem(item)} />
          ))}
        </div>
      )}
    </div>
  );
}

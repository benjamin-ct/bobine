import { useState } from "react";
import { Link } from "react-router-dom";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import { useAuth } from "../../core/context/AuthContext.tsx";
import { PageHeader, ContinueWatchingRow, EmptyState } from "../../shared/components/index.ts";
import StatsPanel from "./components/StatsPanel.tsx";
import WatchlistPanel from "./components/WatchlistPanel.tsx";
import CustomListPanel from "./components/CustomListPanel.tsx";
import styles from "./MyListPage.module.css";

type Tab = "seen" | "want" | "progress" | string; // string = id de liste personnalisée

export default function MyListPage() {
  const { watched, watchlist, customLists, createList } = useLibrary();
  const { status: authStatus } = useAuth();
  const [tab, setTab] = useState<Tab>("seen");
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");

  if (authStatus !== "authenticated") {
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Votre cinémathèque"
          title="Ma liste"
          lead="Vos titres suivis : ce que vous avez vu, ce que vous voulez voir, et vos listes perso."
        />
        <div className={styles.card}>
          <span className={styles.k}>Compte</span>
          <p className={styles.hint}>
            Connecte-toi pour retrouver ta liste : elle n'a pas disparu, elle est simplement liée à
            ton compte.
          </p>
          <Link to="/connexion" className={styles.loginBtn}>
            Connexion
          </Link>
        </div>
      </div>
    );
  }

  const continuingSeries = watchlist.filter(
    (item) => item.mediaType === "tv" && (item.watchedEpisodes?.length || 0) > 0
  );
  const activeCustomList = customLists.find((l) => l.id === tab);

  function submitNewList() {
    const id = createList(newListName);
    if (id) {
      setNewListName("");
      setCreating(false);
      setTab(id);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Votre cinémathèque"
        title="Ma liste"
        lead={
          <>
            Vos titres suivis. Retrouvez vos préférences (plateformes, exclusions, notifications)
            dans{" "}
            <Link to="/profil" className={styles.profileLink}>
              votre profil
            </Link>
            .
          </>
        }
      />

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          className={`${styles.tab} ${tab === "seen" ? styles.tabActive : ""}`}
          onClick={() => setTab("seen")}
        >
          Déjà vu <span className={styles.count}>{watched.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "want" ? styles.tabActive : ""}`}
          onClick={() => setTab("want")}
        >
          Envie de voir <span className={styles.count}>{watchlist.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "progress" ? styles.tabActive : ""}`}
          onClick={() => setTab("progress")}
        >
          En cours <span className={styles.count}>{continuingSeries.length}</span>
        </button>
        {customLists.map((list) => (
          <button
            key={list.id}
            type="button"
            className={`${styles.tab} ${tab === list.id ? styles.tabActive : ""}`}
            onClick={() => setTab(list.id)}
          >
            {list.name} <span className={styles.count}>{list.itemKeys.length}</span>
          </button>
        ))}
        <button type="button" className={styles.newTab} onClick={() => setCreating((v) => !v)}>
          + Nouvelle liste
        </button>
      </div>

      {creating && (
        <form
          className={styles.newListForm}
          onSubmit={(e) => {
            e.preventDefault();
            submitNewList();
          }}
        >
          <input
            type="text"
            placeholder="Nom de la liste…"
            maxLength={40}
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            autoFocus
          />
          <button type="submit">Créer</button>
          <button type="button" onClick={() => setCreating(false)}>
            Annuler
          </button>
        </form>
      )}

      {tab === "seen" &&
        (watched.length === 0 ? (
          <EmptyState label="Tu n'as encore rien marqué comme vu." />
        ) : (
          <StatsPanel watched={watched} />
        ))}

      {tab === "want" && <WatchlistPanel items={watchlist} />}

      {tab === "progress" &&
        (continuingSeries.length === 0 ? (
          <EmptyState label="Rien en cours. Marquez des épisodes comme vus pour retrouver ici vos séries entamées." />
        ) : (
          <ContinueWatchingRow items={continuingSeries} />
        ))}

      {activeCustomList && (
        <CustomListPanel list={activeCustomList} onDeleted={() => setTab("want")} />
      )}
    </div>
  );
}

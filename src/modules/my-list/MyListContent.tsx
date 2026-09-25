import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../core/context/LibraryContext.tsx";
import { useAuth } from "../../core/context/AuthContext.tsx";
import { ContinueWatchingRow, EmptyState } from "../../shared/components/index.ts";
import { useResumableSeries } from "../../shared/hooks/useResumableSeries.ts";
import StatsPanel from "./components/StatsPanel.tsx";
import WatchlistPanel from "./components/WatchlistPanel.tsx";
import CustomListPanel from "./components/CustomListPanel.tsx";
import styles from "./MyListPage.module.css";

type Tab = "seen" | "want" | "progress" | string; // string = id de liste personnalisée
const FIXED_TABS: Tab[] = ["seen", "want", "progress"];

export default function MyListContent() {
  const { t } = useTranslation();
  const { watched, watchlist, customLists, createList } = useLibrary();
  const { status: authStatus } = useAuth();
  // Chaque liste perso a sa propre URL (/profil?tab=ma-liste&liste=<id>) :
  // c'est aussi là qu'est renvoyé le propriétaire qui ouvre le lien public de
  // sa propre liste (voir SharedListPage). Les onglets fixes gardent un état
  // local, sans paramètre.
  const [searchParams, setSearchParams] = useSearchParams();
  const [localTab, setLocalTab] = useState<Tab>("seen");
  const requestedList = searchParams.get("liste");
  const tab: Tab =
    requestedList && customLists.some((l) => l.id === requestedList) ? requestedList : localTab;

  function setTab(next: Tab) {
    setLocalTab(next);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (!FIXED_TABS.includes(next)) {
          params.set("liste", next);
        } else {
          params.delete("liste");
        }
        return params;
      },
      { replace: true }
    );
  }
  const [creating, setCreating] = useState(false);
  const [newListName, setNewListName] = useState("");

  const continuingSeries = useResumableSeries(watchlist);
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
    <div>
      {authStatus !== "authenticated" && (
        <div className={styles.authBanner}>
          <p className={styles.authBannerText}>{t("myListPage.authBannerText")}</p>
          <Link to="/connexion" className={styles.loginBtn}>
            {t("myListPage.login")}
          </Link>
        </div>
      )}

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          className={`${styles.tab} ${tab === "seen" ? styles.tabActive : ""}`}
          onClick={() => setTab("seen")}
        >
          {t("myListPage.tabSeen")} <span className={styles.count}>{watched.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "want" ? styles.tabActive : ""}`}
          onClick={() => setTab("want")}
        >
          {t("myListPage.tabWant")} <span className={styles.count}>{watchlist.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === "progress" ? styles.tabActive : ""}`}
          onClick={() => setTab("progress")}
        >
          {t("myListPage.tabProgress")}{" "}
          <span className={styles.count}>{continuingSeries.length}</span>
        </button>
        {customLists.map((list) => (
          <button
            key={list.id}
            type="button"
            className={`${styles.tab} ${tab === list.id ? styles.tabActive : ""}`}
            onClick={() => setTab(list.id)}
          >
            {list.name} <span className={styles.count}>{list.items.length}</span>
          </button>
        ))}
        <button type="button" className={styles.newTab} onClick={() => setCreating((v) => !v)}>
          {t("myListPage.newListTab")}
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
            placeholder={t("myListPage.newListPlaceholder")}
            maxLength={40}
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            autoFocus
          />
          <button type="submit">{t("myListPage.create")}</button>
          <button type="button" onClick={() => setCreating(false)}>
            {t("myListPage.cancel")}
          </button>
        </form>
      )}

      {tab === "seen" &&
        (watched.length === 0 ? (
          <EmptyState label={t("myListPage.emptySeen")} />
        ) : (
          <StatsPanel watched={watched} />
        ))}

      {tab === "want" && <WatchlistPanel items={watchlist} />}

      {tab === "progress" &&
        (continuingSeries.length === 0 ? (
          <EmptyState label={t("myListPage.emptyProgress")} />
        ) : (
          <ContinueWatchingRow items={continuingSeries} />
        ))}

      {activeCustomList && (
        <CustomListPanel list={activeCustomList} onDeleted={() => setTab("want")} />
      )}
    </div>
  );
}

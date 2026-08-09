# Bobine 🎬

Application pour découvrir des films et séries, savoir où les regarder en streaming (France), tirer un titre au hasard, et suivre ce que tu as déjà vu.

Les données (catalogue, affiches, plateformes de streaming) viennent de [TMDB](https://www.themoviedb.org/) (The Movie Database), qui agrège aussi les disponibilités JustWatch.

## Configuration

1. Crée un compte gratuit sur [themoviedb.org](https://www.themoviedb.org/) puis récupère ta clé API (v3) dans **Réglages → API**.
2. Ouvre `.env.local` à la racine du projet et remplace la valeur :

   ```
   VITE_TMDB_API_KEY=ta_cle_ici
   ```

3. Installe les dépendances puis lance le serveur de dev :

   ```bash
   npm install
   npm run dev
   ```

4. Ouvre l'URL affichée (généralement http://localhost:5173).

## Déploiement (Cloudflare Workers)

Le projet est configuré pour être déployé sur Cloudflare via `wrangler.jsonc`
(assets statiques + routing SPA). En connectant le repo GitHub dans le
dashboard Cloudflare (**Workers & Pages → Create → Connect to Git**), chaque
push sur `main` déclenche automatiquement :

| Étape | Commande |
|---|---|
| Build | `npm run build` |
| Déploiement | `npx wrangler deploy` |

**Important** : avant le premier déploiement, ajoute la variable
d'environnement `VITE_TMDB_API_KEY` dans les paramètres du projet côté
dashboard Cloudflare (section *Variables and Secrets*), avec ta clé TMDB.
Cette variable est utilisée par Vite **au moment du build**, donc elle doit
être définie côté Cloudflare — elle n'est jamais commitée dans le repo
(exactement comme `.env.local` en local).

Pour tester la configuration Wrangler localement sans rien déployer :

```bash
npm run build
npx wrangler deploy --dry-run
```

## Fonctionnalités

- **Découvrir** : parcourir films/séries, filtrable par genre, par durée max, et par n'importe laquelle des plateformes de streaming disponibles en France (liste complète tirée de TMDB, pas juste les grosses). Tri par popularité, note, ou date de sortie.
- **Recherche** : barre de recherche globale (films + séries).
- **Fiche détail** : synopsis, note, bande-annonce jouée en modal (sans quitter l'app), plateformes de streaming disponibles en France, titres similaires (`/recommendations` TMDB).
- **Aléatoire** : tire un titre au hasard selon tes filtres (genre, plateforme, durée, tri), en excluant (optionnellement) ce que tu as déjà vu. Affiche aussi la bande-annonce.
- **Ma liste** : deux listes séparées — "Envie de voir" (pile d'attente) et "Déjà vu" —, stockées localement dans le navigateur (localStorage), aucun compte requis.
  - **Stats** dans l'onglet "Déjà vu" : nombre de titres vus, répartition films/séries, genres préférés.
  - **Export / Import JSON** : bouton "Exporter" pour télécharger ta bibliothèque, "Importer" pour fusionner un fichier exporté (pratique pour changer d'appareil ou comparer ta liste avec quelqu'un d'autre).
- **PWA installable** : icône dédiée, s'installe comme une app depuis le navigateur (Chrome/Edge : icône d'installation dans la barre d'adresse ; Android : "Ajouter à l'écran d'accueil" ; iOS Safari : partager → "Sur l'écran d'accueil").

## Notes techniques

- React 19 + Vite + React Router + vite-plugin-pwa + Wrangler (déploiement Cloudflare Workers, assets statiques uniquement, pas de backend).
- Aucune base de données personnelle : le catalogue est interrogé en direct via l'API TMDB.
- Le suivi "vu / envie de voir" est stocké uniquement dans le navigateur (`localStorage`). Vider les données du site ou changer de navigateur réinitialise la liste — utilise Export/Import pour la déplacer.
- Les icônes PWA (`public/icon-*.png`) sont générées par `scripts/generate-icons.cjs` ; relance-le si tu veux changer le design.

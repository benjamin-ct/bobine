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

### Notifications push (optionnel)

Le Worker gère aussi les notifications push (nouveautés en streaming, sorties
dans tes genres préférés, grosses tendances du moment), via une tâche
planifiée quotidienne et une base D1. Pour les activer :

1. **Secrets du Worker** — dans le dashboard Cloudflare, sur le Worker
   `bobine` : **Settings → Variables and Secrets** (accessible maintenant que
   le Worker a un script, pas seulement des assets statiques). Ajoute :

   | Nom | Type | Valeur |
   |---|---|---|
   | `TMDB_API_KEY` | **Secret** | ta clé TMDB (même clé que `VITE_TMDB_API_KEY`, mais c'est une variable distincte — le Worker ne lit pas les variables de build) |
   | `VAPID_PRIVATE_KEY` | **Secret** | générée une fois avec `node -e "console.log(require('web-push').generateVAPIDKeys())"` |
   | `DEBUG_TRIGGER_KEY` | **Secret** | optionnel — une chaîne aléatoire, permet de déclencher manuellement la vérification via `POST /api/run-check` (ou une notif de test via `POST /api/test-notification`) avec l'en-tête `X-Debug-Key` |

   ⚠️ **Type "Secret" obligatoire**, pas "Texte" : Wrangler efface les
   variables de type "Texte" configurées depuis le dashboard à *chaque*
   déploiement si elles ne sont pas déclarées dans `wrangler.jsonc` (c'est le
   comportement documenté de Cloudflare). Les secrets, eux, survivent
   toujours aux déploiements.

   `VAPID_PUBLIC_KEY` et `VAPID_SUBJECT` n'ont plus besoin d'être configurées
   dans le dashboard : elles sont commitées directement dans `wrangler.jsonc`
   (`VAPID_PUBLIC_KEY` est faite pour être publique — c'est justement ce
   qu'on sert via `GET /api/vapid-public-key` — donc aucun risque à la
   committer ; adapte `VAPID_SUBJECT` à ton email si tu régénères tes
   propres clés).

2. La base D1 (`bobine-notifications`) et le cron (tous les jours à 7h UTC)
   sont déclarés dans `wrangler.jsonc` et se provisionnent automatiquement au
   déploiement — rien à faire côté dashboard pour ça.

3. Côté app, l'utilisateur active les notifications depuis **Ma liste**
   (bouton "Activer les notifications"). Fonctionne même app fermée, tant que
   le navigateur autorise les notifications pour le site.

**Pour tester qu'une notification arrive vraiment** (sans attendre le cron
quotidien ni qu'un vrai événement se produise) : une fois les notifications
activées dans l'app, avec `DEBUG_TRIGGER_KEY` configurée (voir tableau
ci-dessus) —

```bash
curl -X POST https://bobine.creusatbenjamin.workers.dev/api/test-notification \
  -H "X-Debug-Key: ta_valeur_de_DEBUG_TRIGGER_KEY"
```

Envoie une notification de test à tous les appareils abonnés, indépendamment
de toute logique métier (utile car le tout premier passage de la
vérification quotidienne ne notifie jamais rien : il se contente de prendre
une référence de ce qui est déjà disponible). `POST /api/run-check` (même
en-tête) déclenche à la place la vraie vérification quotidienne, si tu veux
tester la logique métier elle-même plutôt que juste la chaîne d'envoi.

Pour du développement local avec un Worker complet (D1 + secrets), crée un
`.dev.vars` (jamais commité) avec les mêmes clés que ci-dessus, puis :

```bash
npx wrangler d1 execute bobine-notifications --local --file=worker/schema.sql
npx wrangler dev
```

⚠️ En local, `wrangler dev` ne détecte pas toujours les nouveaux fichiers
générés par un `npm run build` lancé pendant qu'il tourne (assets mis en
cache disque dans `.wrangler/state/v3/cache`) : après un rebuild, arrête-le
(`Ctrl+C`) et relance `npx wrangler dev`, ou supprime ce dossier de cache si
le problème persiste.

### Comptes et synchronisation (optionnel)

Se connecter (bouton "Connexion" dans la barre de navigation) permet de
retrouver sa liste "envie de voir" / "déjà vu" sur plusieurs navigateurs et
appareils. Pas de mot de passe : un lien de connexion à usage unique est
envoyé par email (valable 15 minutes).

1. **Service d'envoi d'email** — le Worker utilise [Resend](https://resend.com)
   (compte gratuit). Dans le dashboard Cloudflare, sur le Worker `bobine` :
   **Settings → Variables and Secrets**, ajoute :

   | Nom | Type | Valeur |
   |---|---|---|
   | `RESEND_API_KEY` | **Secret** | ta clé API Resend |
   | `RESEND_FROM_EMAIL` | Texte (optionnel) | adresse d'envoi, ex. `Bobine <connexion@tondomaine.com>` — nécessite un domaine vérifié dans Resend. Sans cette variable, l'app utilise `onboarding@resend.dev` (fonctionne sans domaine vérifié, en test uniquement). |

   Sans `RESEND_API_KEY` configurée (ex. en local sans `.dev.vars`), aucun
   email n'est envoyé : l'API renvoie directement le lien de connexion dans
   sa réponse (`devLink`), affiché sur la page de connexion, pour pouvoir
   tester le flux sans boîte mail. Ce cas ne se présente jamais en
   production tant que le secret est configuré.

2. La base D1 (même base que les notifications push) stocke les comptes,
   liens de connexion, sessions, et la bibliothèque synchronisée — déclarée
   dans `worker/schema.sql`, provisionnée automatiquement au déploiement.

3. À la première connexion sur un appareil, la bibliothèque locale
   (`localStorage`) et celle du compte sont **fusionnées** (rien n'est
   perdu) puis renvoyées au serveur. Aux connexions suivantes sur ce même
   appareil, le serveur fait autorité (il reflète le dernier appareil ayant
   synchronisé). Se déconnecter ne supprime rien en local : les données
   restent disponibles hors connexion.

## Fonctionnalités

- **Découvrir** : parcourir films/séries, filtrable par genre et par n'importe laquelle des plateformes de streaming disponibles en France (liste complète tirée de TMDB, pas juste les grosses). Tri par popularité, note, ou année (croissant/décroissant). Les résultats s'accumulent en **scroll infini** : la page suivante se charge automatiquement en approchant du bas (pas de bouton, pas de pagination).
  - **Filtres avancés** (repliables) : année de sortie (min/max — ex. "tous les films de 2025"), note (min/max), nombre de votes minimum, durée (min/max), pays de production.
- **Recherche** : barre de recherche globale — films, séries, **et personnes** (acteurs, réalisateurs). Les résultats s'affichent **en direct** dans un menu déroulant dès 2 caractères tapés (pas besoin de valider), avec affiche/photo, titre et année ; un lien "Voir tous les résultats" renvoie vers la page de recherche complète. Cliquer sur une personne ouvre sa fiche avec sa filmographie complète (comme acteur/actrice, et comme réalisateur/scénariste).
- **Fiche détail** : synopsis, note, bande-annonce jouée en modal (sans quitter l'app), plateformes de streaming disponibles en France, bouton "🔁 Similaire" qui saute directement aux recommandations.
- **Aléatoire** : tire un titre au hasard selon tes filtres (genre, plateforme, année de sortie min/max), en excluant (optionnellement) ce que tu as déjà vu. Affiche aussi la bande-annonce.
- **Ma liste** : deux listes séparées — "Envie de voir" (pile d'attente, bouton **or** ★) et "Déjà vu" (bouton **vert** ✔) —, stockées localement dans le navigateur (localStorage), aucun compte requis. Se connecter (optionnel, voir [Comptes et synchronisation](#comptes-et-synchronisation-optionnel)) synchronise cette liste entre navigateurs et appareils.
  - **Stats visuelles** dans l'onglet "Déjà vu" : donut films/séries, temps de visionnage total mis en avant, genres préférés, aperçu "Vus récemment".
  - **Stats** dans l'onglet "Déjà vu" : nombre de titres vus, répartition films/séries, top 5 des genres préférés, et un aperçu "Vus récemment".
  - **Export / Import JSON** : bouton "Exporter" pour télécharger ta bibliothèque, "Importer" pour fusionner un fichier exporté (pratique pour changer d'appareil ou comparer ta liste avec quelqu'un d'autre).
- **PWA installable** : icône dédiée, s'installe comme une app depuis le navigateur (Chrome/Edge : icône d'installation dans la barre d'adresse ; Android : "Ajouter à l'écran d'accueil" ; iOS Safari : partager → "Sur l'écran d'accueil").
- **Notifications push** (optionnel, voir [Configuration des notifications push](#notifications-push-optionnel)) : préviens-toi quand un titre de ta liste "Envie de voir" arrive en streaming, pour les nouveautés dans tes genres préférés, et pour les grosses sorties du moment — même app fermée.
- **Retour en haut de page** : un bouton flottant "↑" apparaît après un peu de scroll sur n'importe quelle page. La page remonte aussi automatiquement en haut en changeant d'onglet, et cliquer sur l'onglet actif (ou le logo "Bobine" depuis l'accueil) remonte en haut même sans changer de page.
- **Comptes et synchronisation** (optionnel, voir [Comptes et synchronisation](#comptes-et-synchronisation-optionnel)) : connexion par lien magique (pas de mot de passe), pour retrouver sa liste "envie de voir" / "déjà vu" sur plusieurs navigateurs et appareils.

## Notes techniques

- React 19 + Vite + React Router + vite-plugin-pwa + Wrangler (déploiement Cloudflare Workers).
- Le catalogue est interrogé en direct via l'API TMDB, aucune donnée de catalogue n'est dupliquée côté serveur.
- Le suivi "vu / envie de voir" est stocké dans le navigateur (`localStorage`) — ça reste la source de vérité hors connexion. Vider les données du site ou changer de navigateur sans être connecté réinitialise la liste — utilise Export/Import pour la déplacer manuellement, ou connecte-toi pour une synchronisation automatique.
- Exceptions au "tout côté client" : les **notifications push** ont besoin d'un minimum d'état côté serveur (base D1 `worker/schema.sql`) — abonnement push, copie de la liste "envie de voir" et des genres favoris, pour que la tâche planifiée quotidienne (`worker/scheduled.js`) puisse vérifier les nouveautés même quand l'app est fermée. Les **comptes** (même base D1) stockent l'email, les liens de connexion à usage unique, les sessions, et — pour les utilisateurs connectés seulement — une copie de la bibliothèque pour la synchronisation.
- Les icônes PWA (`public/icon-*.png`) sont générées par `scripts/generate-icons.cjs` ; relance-le si tu veux changer le design.

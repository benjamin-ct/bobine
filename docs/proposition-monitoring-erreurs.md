# Proposition : observabilité (erreurs, usage, disponibilité)

> Ticket Trello : "Mettre en place des metrics d'erreur". Ce document reste une **proposition** — rien n'est mis en
> place à ce stade. Cette version répond aux retours du 2026-09-02 : recommandation ferme (plus un menu d'options),
> réponse directe à "on serait en capacité de quoi et où", et un plan de migration one-shot avec la liste exacte de
> ce qu'il y a à préparer côté humain.

## 1. Réponse directe : on aurait quoi, et où

Une fois la Phase unique décrite en section 4 mise en œuvre, en un seul PR/déploiement :

| Besoin                     | Outil                                                 | Ce qu'on voit concrètement                                                                                                                                                                                                          | Où                                                                       |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Erreurs (centralisé)       | **Sentry** (plan gratuit)                             | Chaque erreur client (React) ou worker remonte automatiquement : stack trace, route, regroupement par erreur similaire, recherche/filtre par message, route, date, fréquence — équivalent CloudWatch Logs Insights pour les erreurs | Interface web Sentry (recherche type moteur de recherche sur les events) |
| Erreurs (alerte immédiate) | **Sentry → Discord**                                  | Notification dans un salon Discord dédié dès qu'une **nouvelle** erreur (ou une régression) apparaît, avec lien direct vers l'event Sentry — pas de spam à chaque occurrence répétée                                                | Salon Discord dédié (ex. `#erreurs-prod`)                                |
| Usage / fonctionnalités    | **Cloudflare Web Analytics** + **Analytics Engine**   | Visiteurs uniques, pages vues, et événements custom (ajout à une liste, notification activée, recherche...)                                                                                                                         | Dashboard Grafana (voir ligne suivante)                                  |
| Disponibilité              | **Route `/api/health` + GitHub Actions (cron 5 min)** | Ping périodique ; alerte Discord immédiate si le site ne répond pas, et message de rétablissement quand ça revient                                                                                                                  | Même salon Discord dédié                                                 |
| Dashboard unique           | **Grafana Cloud** (plan gratuit)                      | Un board unique avec 3 sections : tendance des erreurs (source Sentry), usage/traffic (source Cloudflare), disponibilité (historique des checks) — vue d'ensemble dans le temps                                                     | `<votre-org>.grafana.net`                                                |

Tout est gratuit à cette échelle, aucun développement d'outil maison : uniquement de la configuration et de
l'instrumentation légère (quelques appels SDK/API), sur des services qui s'intègrent nativement entre eux
(Sentry a une intégration Discord native ; Grafana a des plugins de datasource Sentry et Cloudflare tout faits).

## 2. Constat actuel

- Aucune dépendance d'observabilité dans `package.json` (pas de Sentry, PostHog, Datadog...).
- Aucun binding Cloudflare dédié au monitoring dans `wrangler.jsonc` (pas d'Analytics Engine, pas de Logpush) : seul
  binding présent, `DB` (D1).
- Le logging existant se limite à des `console.error`/`console.warn` non structurés et non uniformisés, dispersés
  côté client (`src/core/context/*Context.tsx`) et côté worker (`worker/scheduled.ts`, `worker/index.ts`) —
  invisibles en dehors d'un `wrangler tail` lancé manuellement.
- Le bot Discord utilisé par le pipeline Trello (`DISCORD_TOKEN` / `DISCORD_CHANNEL_ID`) ne vit aujourd'hui que dans
  le conteneur `infra/trello-claude` — ce ne sont **pas** des secrets GitHub Actions, et l'app Cloudflare Worker n'y a
  pas accès. Toute alerte Discord depuis le worker ou depuis une GitHub Action nécessite donc soit ses propres
  identifiants (nouveau webhook ou bot), soit la réutilisation de `DISCORD_TOKEN`/`DISCORD_CHANNEL_ID` ajoutés comme
  secrets GitHub Actions (voir section 4).
- La page confidentialité affirme explicitement que "Bobine n'utilise à ce jour aucun outil d'analytics ni traceur
  publicitaire" (`src/modules/legal/PrivacyPolicyPage.tsx`) — **toute solution impliquant un outil tiers de mesure
  d'audience nécessitera une mise à jour de cette page avant mise en prod** (cf. section 5).

## 3. Pourquoi cette combinaison plutôt que d'autres

- **Sentry plutôt que Cloudflare Workers Logs seul** : les logs Cloudflare natifs ont une rétention courte, pas de
  regroupement/alerting, et ne couvrent pas le client React. Sentry est le seul outil de la liste qui couvre
  proprement navigateur **et** worker, avec regroupement automatique des erreurs similaires et recherche — c'est
  l'équivalent "CloudWatch" demandé. Plan gratuit : ~5k événements/mois, largement suffisant à ce trafic.
- **Grafana Cloud plutôt qu'une page admin maison** : demande explicite de ne pas développer d'outil interne. Grafana
  Cloud gratuit fournit un board prêt à l'emploi avec des plugins de datasource officiels pour Sentry et Cloudflare —
  configuration une fois, pas de maintenance de code ensuite.
- **GitHub Actions + Discord plutôt qu'UptimeRobot** : réutilise des minutes GitHub Actions déjà consommées par la CI
  et le canal Discord déjà en place comme habitude d'alerting sur ce projet, plutôt que d'ajouter un compte tiers de
  plus à gérer.
- **Analytics Engine plutôt qu'un outil de tracking tiers pour les événements custom** : reste 100% Cloudflare, pas de
  SDK supplémentaire, et pas de nouvel outil à déclarer légalement au-delà de Web Analytics (qui, lui, est sans
  cookies et RGPD-friendly par nature).

## 4. Plan de migration one-shot

Objectif : une seule PR qui active tout d'un coup (instrumentation code + config CI + config Cloudflare), une fois
que les comptes/identifiants ci-dessous sont prêts. Chaque étape "à préparer" est à faire une seule fois, avant le
merge de la PR d'implémentation.

### 4.1. Ce qu'il y a à préparer (côté humain, hors code)

1. **Compte Sentry** (gratuit, sentry.io) → créer un projet type "Cloudflare Workers" (ou générique JavaScript) →
   récupérer le **DSN** du projet.
2. **Intégration Discord de Sentry** : dans le projet Sentry, section Alertes/Intégrations → connecter le serveur
   Discord et choisir le salon dédié (créer `#erreurs-prod` s'il n'existe pas déjà) → configurer une règle d'alerte
   "nouvelle erreur / régression" (pas "chaque event", pour éviter le bruit).
3. **Compte Grafana Cloud** (gratuit, grafana.com) → récupérer l'URL de l'instance (`<org>.grafana.net`) et un token
   d'API pour ajouter les datasources.
4. **Webhook ou bot Discord pour le healthcheck** : soit créer un webhook Discord dédié au salon `#erreurs-prod`
   (le plus simple, une URL à copier depuis les paramètres du salon), soit ajouter `DISCORD_TOKEN` et
   `DISCORD_CHANNEL_ID` (déjà utilisés par le pipeline Trello) comme **secrets GitHub Actions** du dépôt.
5. **Secrets à ajouter** (dashboard Cloudflare pour le worker, `gh secret set` pour GitHub Actions) :
   - Cloudflare (Secrets, pas `vars`, comme `TMDB_API_KEY`) : `SENTRY_DSN`.
   - GitHub Actions : `SENTRY_AUTH_TOKEN` (upload des source maps au build), `DISCORD_WEBHOOK_URL` (ou
     `DISCORD_TOKEN`/`DISCORD_CHANNEL_ID`) pour le healthcheck. `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`
     existent déjà.

### 4.1 bis. Réponses aux questions posées sur la mise en route

- **Écran d'accueil Grafana Cloud ("How do you want to get started?")** : choisir **"Visualize existing data"**
  (dernière tuile, en bas à droite). Les autres tuiles (app monitoring, infra monitoring, base de données...)
  supposent d'installer un agent Grafana (Alloy) sur une infra à nous, ce qui ne s'applique pas ici — on ne fait que
  brancher deux sources externes déjà existantes (Sentry, Cloudflare Analytics) en datasources, ce que couvre cette
  option (ou, à défaut, "Skip setup" puis Connections → Data sources plus tard). Aucune donnée n'est à saisir sur cet
  écran pour l'instant : le détail de configuration des deux datasources (Sentry, Cloudflare) est fait dans la PR
  d'implémentation (étape 5 du 4.2), une fois le code en place.
- **Le token généré à la création du compte Grafana Cloud** : c'est un token d'API/Access Policy Grafana Cloud, utilisé
  uniquement si on provisionne les datasources par API/Terraform plutôt qu'à la main dans l'UI. Rien à en faire dans
  l'immédiat : le conserver dans un gestionnaire de mots de passe. Ce n'est **pas** le même type de token que ceux
  demandés côté Sentry ou Cloudflare pour connecter les datasources (ceux-là seront créés séparément, côté
  Sentry/Cloudflare, au moment de l'étape 5 du 4.2).
- **Brancher Sentry à GitHub** : il y a deux intégrations GitHub distinctes côté Sentry, à ne pas confondre.
  - Celle déjà en place via `SENTRY_AUTH_TOKEN` (secret GitHub Actions) sert uniquement à uploader les source maps au
    build — déjà fait, rien de plus à faire pour ça.
  - L'intégration **Sentry → GitHub** (Sentry : Settings → Integrations → GitHub) est différente et optionnelle : elle
    relie les erreurs aux commits/PR (suggestion du commit suspect, de l'assigné probable, commentaire automatique sur
    la PR qui corrige un bug). Gratuite, recommandée pour le triage, mais pas bloquante — elle peut être connectée
    maintenant (elle n'aura simplement rien à relier tant que le code d'instrumentation n'est pas mergé) ou plus tard,
    au choix.

### 4.2. Ce qui serait fait dans la PR d'implémentation, une fois ce qui précède prêt

1. Ajouter le SDK Sentry (client React + worker), avec un wrapper de log unique (`src/core/logger.ts` ou équivalent)
   qui remplace tous les `console.error`/`console.warn` existants — logs uniformisés, avec contexte structuré
   (route, sévérité, éventuel id utilisateur).
2. Activer le binding **Analytics Engine** dans `wrangler.jsonc`, et instrumenter les points d'usage clés (ajout à
   une liste, activation des notifications, recherche...).
3. Activer **Cloudflare Web Analytics** (snippet + activation dashboard).
4. Ajouter la route `/api/health` (worker) et un workflow GitHub Actions planifié (cron ~5 min) qui l'appelle et
   poste sur Discord en cas d'échec, avec message de rétablissement au retour au vert.
5. Configurer Grafana Cloud : datasource Sentry (plugin officiel) + datasource Cloudflare (API GraphQL
   Analytics/Analytics Engine), et un dashboard avec les 3 sections (erreurs / usage / disponibilité).
6. Mettre à jour la politique de confidentialité (section 5 ci-dessous) dans la même PR, puisqu'à ce stade les outils
   sont connus et nommés.

Chaque sous-étape reste techniquement indépendante et pourrait être scindée en tickets si préféré, mais l'objectif
de cette section est de permettre un déploiement en une seule fois si c'est ce qui est souhaité.

## 5. Point d'attention légal

La mise en œuvre ci-dessus (Sentry, Cloudflare Web Analytics) implique de mettre à jour la page confidentialité
(`src/modules/legal/PrivacyPolicyPage.tsx`), qui affirme actuellement qu'aucun outil d'analytics n'est utilisé.
Concrètement, à ajouter lors de la PR d'implémentation : mention de Sentry (finalité : suivi et diagnostic des
erreurs techniques) et de Cloudflare Web Analytics (finalité : mesure d'audience anonyme, sans cookies), avec mise à
jour de la date en haut de page. Analytics Engine (événements custom internes, sans donnée personnelle identifiante)
ne nécessite a priori pas de mention distincte, mais à confirmer selon la nature exacte des événements retenus en
Phase usage.

## 6. Prochaine étape

Ce document est de nouveau soumis pour validation humaine. Si cette recommandation convient, l'étape suivante est de
préparer les comptes/identifiants listés en 4.1, puis de lancer le développement de la PR d'implémentation décrite
en 4.2 (un seul ticket `A faire`, ou plusieurs si un découpage par étape est préféré).

# Proposition : observabilité (erreurs, usage, disponibilité)

> Ticket Trello : "Mettre en place des metrics d'erreur". Ce document est une **proposition**, pas une implémentation
> — rien n'est mis en place à ce stade, conformément à la demande du ticket. Objectif : dresser un état des lieux,
> comparer les options réalistes, et proposer une trajectoire, en restant gratuit et le plus possible intégré à
> Cloudflare ou aux outils déjà en place.

## 1. Constat actuel

- Aucune dépendance d'observabilité dans `package.json` (pas de Sentry, PostHog, Datadog...).
- Aucun binding Cloudflare dédié au monitoring dans `wrangler.jsonc` (pas d'Analytics Engine, pas de Logpush) : seul
  binding présent, `DB` (D1).
- Le logging existant se limite à des `console.error`/`console.warn` non structurés, dispersés côté client
  (`src/core/context/*Context.tsx`) et côté worker (`worker/scheduled.ts`, `worker/index.ts`) — invisibles en dehors
  d'un `wrangler tail` lancé manuellement.
- Aucune table D1 de type `events`/`analytics_events` : pas de tracking d'usage en base.
- La page confidentialité affirme explicitement que "Bobine n'utilise à ce jour aucun outil d'analytics ni traceur
  publicitaire" (`src/modules/legal/PrivacyPolicyPage.tsx`) — **toute solution impliquant un outil tiers de
  mesure d'audience nécessitera une mise à jour de cette page avant mise en prod** (cf. section 5).
- Le dashboard Cloudflare (Workers, D1) expose déjà, sans aucun code à écrire, des métriques infra basiques :
  volume de requêtes, taux d'erreurs 5xx du Worker, temps CPU, requêtes D1 — mais rien de spécifique à l'application
  (pas de détail par route/fonctionnalité, pas de contexte métier sur les erreurs, pas de suivi d'usage).

## 2. Besoins à couvrir

1. **Erreurs applicatives** : être notifié qu'une erreur survient, avec assez de contexte (stack, route, user
   éventuellement) pour la diagnostiquer sans attendre un signalement utilisateur.
2. **Usage / traffic** : nombre de visiteurs, pages vues, fonctionnalités utilisées (ex. ajout à une liste,
   notifications activées).
3. **Disponibilité** : être alerté si le site ou l'API worker est down, sans dépendre d'un utilisateur qui le
   remonte.
4. **Un board / dashboard** consultable pour visualiser ces trois axes dans la durée.

Contrainte transverse : rester gratuit (ou quasi), en priorisant ce qui est nativement disponible sur Cloudflare ou
déjà utilisé par le projet (Discord, GitHub Actions), avant d'ajouter un nouvel outil tiers.

## 3. Options étudiées

| Besoin | Option | Coût | Ce qu'elle apporte | Limites |
| --- | --- | --- | --- | --- |
| Erreurs | **Cloudflare Workers Logs** (observability native, activable dans `wrangler.jsonc`) | Gratuit sur le plan Workers actuel, rétention limitée (~jours) | Logs structurés interrogeables depuis le dashboard Cloudflare, sans SDK tiers | Pas d'agrégation/alerting avancé, rétention courte, ne couvre que le worker (pas le client React) |
| Erreurs | **Sentry (plan gratuit)** | Gratuit jusqu'à ~5k événements/mois, 1 projet | Stack traces avec source maps, regroupement d'erreurs, alerting (email/Slack/Discord via webhook), couvre client **et** worker | Outil tiers hors Cloudflare ; au-delà du quota gratuit ça devient payant ; nécessite d'ajouter un SDK et de builder les uploads de source maps |
| Erreurs + usage | **Cloudflare Workers Analytics Engine** (binding natif, écriture de data points custom) | Gratuit, inclus dans le plan Workers actuel avec un volume d'écriture quotidien généreux | Permet d'enregistrer soi-même des événements custom (erreur avec tags, feature utilisée, etc.), interrogeables en SQL via l'API GraphQL Cloudflare | Nécessite d'instrumenter le code soi-même (pas de SDK plug-and-play) ; pas d'UI de dashboard prête à l'emploi, il faut soit interroger l'API à la demande, soit brancher un outil de visualisation |
| Usage / traffic | **Cloudflare Web Analytics** | Gratuit | Pages vues, visiteurs uniques, sans cookies (compatible RGPD) ; juste un snippet à ajouter, activable en un clic dashboard | Implique de déclarer un outil de mesure d'audience dans la politique de confidentialité (actuellement elle dit explicitement qu'il n'y en a pas) ; ne couvre pas les "fonctionnalités utilisées" (pas d'événements custom) |
| Usage détaillé | **Analytics Engine + événements custom** (ex. "item ajouté à une liste", "notification activée") | Gratuit (même binding que ci-dessus) | Mesure précise des fonctionnalités réellement utilisées, sans dépendre d'un outil externe ni de cookies | Même limite que ci-dessus : instrumentation manuelle, pas de dashboard visuel out-of-the-box |
| Disponibilité | **Health check externe via GitHub Actions (cron) → alerte Discord** | Gratuit (minutes GitHub Actions déjà utilisées par la CI, webhook Discord déjà en place pour Trello) | Ping périodique d'une route de santé (`/api/health` à créer), alerte immédiate dans un salon Discord dédié si le site ne répond pas | Fréquence limitée par le cron GitHub Actions (minimum réaliste ~5 min) ; pas de a niveau SLA garanti |
| Disponibilité | **UptimeRobot (plan gratuit)** | Gratuit jusqu'à 50 moniteurs, intervalle 5 min | Solution clé en main, historique de disponibilité, alerte email/Discord/Slack | Outil tiers de plus à gérer, alors que l'option GitHub Actions ci-dessus réutilise l'existant |
| Dashboard global | **Grafana Cloud (plan gratuit)** branché sur l'API Analytics Engine / GraphQL Cloudflare | Gratuit jusqu'à un quota de séries/requêtes largement suffisant à cette échelle | Un vrai board visuel unique (erreurs, usage, disponibilité) sans booster de l'existant | Configuration initiale (datasource, requêtes) à faire une fois ; nouvel outil externe (lecture seule) |
| Dashboard global | **Page admin interne** (React, dans l'app) interrogeant directement l'API Analytics Engine | Gratuit | Zéro outil externe, cohérent avec "le plus possible tout intégré" | Développement custom à maintenir (UI de graphes) |

## 4. Proposition retenue

Approche en couches, en partant de ce qui est gratuit et déjà disponible, avant d'ajouter quoi que ce soit de nouveau :

**Phase 0 — quick win, zéro développement**
Se servir dès maintenant du dashboard Cloudflare existant (Workers → Metrics, D1 → Metrics) pour la visibilité infra
de base (taux d'erreur 5xx, latence, requêtes D1). Aucune action de code requise.

**Phase 1 — erreurs applicatives**
Activer **Cloudflare Workers Logs** côté worker (configuration `wrangler.jsonc`, pas de code applicatif à écrire) pour
avoir des logs structurés et interrogeables. Si le besoin de regroupement d'erreurs / alerting s'avère insuffisant
avec les logs bruts, ajouter **Sentry (plan gratuit)** côté client et worker en complément — c'est le seul outil de
la liste qui couvre proprement les erreurs React côté navigateur avec source maps.

**Phase 2 — usage et fonctionnalités**
Instrumenter les points d'usage clés (ajout/retrait de liste, activation des notifications, recherche...) via le
binding **Workers Analytics Engine**, en écrivant un data point à chaque événement métier significatif. C'est
l'option qui couvre le mieux "fonctionnalités utilisées" sans dépendre d'un outil de mesure d'audience classique.

**Phase 3 — traffic global**
Activer **Cloudflare Web Analytics** pour le comptage de pages vues / visiteurs, en parallèle de la mise à jour de la
politique de confidentialité (section 5).

**Phase 4 — disponibilité**
Ajouter une route `/api/health` légère côté worker, et un workflow GitHub Actions planifié qui l'appelle
périodiquement et poste une alerte dans un salon Discord dédié en cas d'échec — en réutilisant l'intégration Discord
déjà en place pour ce pipeline Trello.

**Phase 5 — dashboard**
Une fois les données custom (Analytics Engine) disponibles, décider entre une page admin interne (zéro dépendance
externe, mais développement à maintenir) et Grafana Cloud gratuit (dashboard prêt à l'emploi, configuration
ponctuelle). À trancher selon le temps qu'on veut y consacrer — les deux sont viables et gratuites à cette échelle.

Chaque phase est indépendante et peut être découpée en ticket séparé si cette proposition est validée.

## 5. Point d'attention légal

Dès que la Phase 3 (Web Analytics) ou toute solution impliquant un outil de mesure d'audience/erreur tiers (ex.
Sentry) est mise en œuvre, la page confidentialité (`src/modules/legal/PrivacyPolicyPage.tsx`) devra être mise à
jour : elle affirme actuellement qu'aucun outil d'analytics n'est utilisé. Cette mise à jour n'est pas ambiguë une
fois l'outil choisi (nom de l'outil + finalité à ajouter), mais elle est volontairement laissée hors scope de cette
proposition puisque rien n'est encore implémenté à ce stade.

## 6. Prochaine étape

Ce document est soumis pour validation humaine avant de découper la phase retenue en ticket(s) de développement
dans `A faire`.

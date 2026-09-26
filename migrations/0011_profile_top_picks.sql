-- Top 5 du profil partagé choisi à la main, façon « films favoris » de
-- Letterboxd (ticket « Possibilité de voir/partager son profil ») : tableau
-- JSON ordonné de clés "mediaType:id" (5 au plus), pris parmi les titres
-- vus. NULL = aucun choix : la page publique retombe alors sur le calcul
-- automatique (titres vus les mieux notés).
ALTER TABLE users ADD COLUMN top_picks TEXT;

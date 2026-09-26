-- Top 5 du profil partagé choisi à la main, façon « films favoris » de
-- Letterboxd (ticket « Possibilité de voir/partager son profil ») : tableau
-- JSON ordonné (5 au plus) des métadonnées d'affichage de chaque titre
-- ({ id, mediaType, title, posterPath, date }), vu ou pris dans le
-- catalogue. NULL = aucun choix : la page publique retombe alors sur le
-- calcul automatique (titres vus les mieux notés).
ALTER TABLE users ADD COLUMN top_picks TEXT;

# Recommandations nutritionnelles mangerbouger.fr (Santé publique France, PNNS)

> **Rôle** : source des règles d'équilibre (§6.3 de la conception). Les contrôles retenus pour le menu sont fixés dans la conception, ce fichier en donne l'origine et le détail.
> **Règle de lecture** : chaque seuil chiffré se revérifie sur mangerbouger.fr avant d'être écrit dans le code (voir la limite de méthode ci-dessous).

Recherche faite le 2026-11-12, pour la composition automatique de menus de dîners (famille : 2 adultes, 2 enfants de 5 et 8 ans, batch cooking 4-5 dîners).

Limite de méthode : les pages ont été lues avec l'outil WebFetch, qui renvoie un résumé produit par un petit modèle et non le texte brut. Les valeurs chiffrées ci-dessous viennent de ces résumés. Elles sont cohérentes entre pages et avec une recherche web séparée, mais une relecture humaine d'un chiffre critique reste prudente avant de le coder en dur. Le site signalait aussi un bandeau « plusieurs pages hors ligne suite à une faille de sécurité » : certaines pages étaient indisponibles.

## Pages lues

Préfixe `R` = `https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite`

| Page | URL | Lue en entier |
|---|---|---|
| Recommandations adultes (index augmenter / aller vers / réduire) | https://www.mangerbouger.fr/manger-mieux/a-tout-age-et-a-chaque-etape-de-la-vie/les-recommandations-alimentaires-pour-les-adultes | oui (index sans chiffres) |
| Augmenter les fruits et légumes | R/augmenter/augmenter-les-fruits-et-legumes | oui |
| Augmenter les légumes secs | R/augmenter/augmenter-les-legumes-secs | oui |
| Augmenter les fruits à coque non salés | R/augmenter/augmenter-les-fruits-a-coque-non-sales-noix-noisettes-amandes-etc | oui |
| Augmenter le fait maison | R/augmenter/augmenter-le-fait-maison | oui (sans chiffres) |
| Aller vers les féculents complets | R/aller-vers/aller-vers-les-feculents-complets | oui |
| Aller vers les poissons gras et maigres en alternance | R/aller-vers/aller-vers-les-poissons-gras-et-maigres-en-alternance | oui |
| Aller vers l'huile de colza, de noix et d'olive | R/aller-vers/aller-vers-l-huile-de-colza-de-noix-et-d-olive | oui |
| Aller vers les produits laitiers (suffisante mais limitée) | R/aller-vers/aller-vers-une-consommation-de-produits-laitiers-suffisante-mais-limitee | oui |
| Réduire la viande (porc, bœuf, veau, mouton, agneau, abats) | R/reduire/reduire-la-viande-porc-baeuf-veau-mouton-agneau-abats | oui |
| Réduire la charcuterie | R/reduire/reduire-la-charcuterie | oui |
| Réduire les produits salés et le sel | R/reduire/reduire-les-produits-sales-et-le-sel | oui |
| Réduire boissons sucrées, aliments gras/sucrés/salés/ultra-transformés | R/reduire/reduire-les-boissons-sucrees-aliments-gras-sucres-sales-et-ultra-transformes | oui |
| Réduire les produits Nutri-Score D et E | R/reduire/reduire-les-produits-avec-un-nutri-score-d-et-e | oui (sans chiffres) |
| Réduire l'alcool | R/reduire/reduire-l-alcool | oui (hors sujet menus) |
| Enfants et ados de 4 à 17 ans | https://www.mangerbouger.fr/manger-mieux/a-tout-age-et-a-chaque-etape-de-la-vie/enfants-et-adolescents-de-4-a-17-ans | oui, mais page quasi vide (pas de chiffres) |
| De 4 à 11 ans, les portions s'adaptent à l'âge | https://www.mangerbouger.fr/manger-mieux/a-tout-age-et-a-chaque-etape-de-la-vie/enfants-et-adolescents-de-4-a-17-ans/de-4-a-11-ans-les-portions-s-adaptent-a-l-age-de-votre-enfant | oui |
| Manger équilibré, ça veut dire quoi | https://www.mangerbouger.fr/manger-mieux/se-faire-plaisir-en-mangeant-equilibre/manger-equilibre-ca-veut-dire-quoi-et-comment-y-arriver | oui, mais contenu vide (hors ligne) |
| La Fabrique à menus (page d'accueil) | https://www.mangerbouger.fr/manger-mieux/la-fabrique-a-menus/ | NON : HTTP 503 (recette.mangerbouger.fr : connexion refusée). Description issue d'une recherche web seulement |
| Guide parents 4-11 ans (PDF, 40 p.) | https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf | NON : PDF illisible (pas de pdftotext), seulement l'extrait d'un moteur de recherche |
| « L'essentiel des recommandations alimentaires » (PDF) | https://www.mangerbouger.fr/content/show/1597/file/L%E2%80%99essentiel%20des%20recommandations%20alimentaires.pdf | NON : PDF illisible |

Aucune page Santé publique France externe n'a été lue. Le résumé de recherche web d'un second passage (légumes secs 2 fois par semaine, 5 fruits et légumes, une petite poignée de fruits à coque) concorde avec les pages ci-dessus.

Pages du site sans chiffres : pas de page dédiée aux « légumineuses » distincte de « légumes secs » ; pas de page dédiée volaille (elle est dans la page viande) ; les matières grasses n'ont aucune limite chiffrée en g/jour.

## Règles par famille d'aliments

### Fruits et légumes
- Au moins 5 fruits et légumes par jour, par exemple 3 portions de légumes et 2 fruits, ou 4 de légumes et 1 fruit. Source : R/augmenter/augmenter-les-fruits-et-legumes
- Une portion adulte = 80 à 100 g (une tomate moyenne, un bol de soupe, une pomme, une banane). Repère : la taille du poing. Même source.
- Un plat composé de plusieurs légumes ne compte que pour 1 portion ; un petit bol de soupe mélangée = 1 portion ; un petit bol de compote = 1 portion. Même source.
- Ne comptent pas comme portion : jus de fruits (limite 1 verre par jour, de préférence pressé), fruits séchés (occasionnels), yaourts et biscuits aux fruits. Les fruits à coque ont leur propre règle. Même source.
- Frais, surgelés, conserves, bocaux, crus ou cuits conviennent. Même source.
- Pour les enfants : en proposer à chaque repas. Même source.

### Légumes secs (légumineuses : lentilles, haricots, pois chiches, pois cassés, fèves)
- Au moins 2 fois par semaine. Source : R/augmenter/augmenter-les-legumes-secs
- Se servent avec légumes, céréales (pâtes, riz, semoule) ou avec de la volaille, du poisson ou de la viande. Même source.
- Introduire progressivement (ballonnements possibles) et boire assez d'eau. Même source.
- Bocaux, conserves, surgelés acceptés ; lentilles corail en 10 minutes. Même source.

### Féculents complets
- Pain complet ou aux céréales, pâtes, semoule et riz complets : « au choix au moins une fois par jour ». Source : R/aller-vers/aller-vers-les-feculents-complets
- Pâtes, pain, riz, semoule, pommes de terre peuvent être consommés tous les jours ; privilégier les versions complètes ou semi-complètes ; le semi-complet est accepté si le complet est mal toléré. Même source.
- Limiter les sauces grasses et le fromage ajouté. Même source.
- Repère fibres : objectif d'au moins 25 g par jour (seules 8 % des femmes et 17 % des hommes l'atteignent). Même source.

### Fruits à coque
- Une petite poignée par jour de fruits à coque non salés, non sucrés, sans chocolat (noix, noisettes, amandes, pistaches). Source : R/augmenter/augmenter-les-fruits-a-coque-non-sales-noix-noisettes-amandes-etc
- Avant 6 ans : jamais entiers (risque de fausse route et d'étouffement), les incorporer en poudre. Même source.
- Enfants : les intégrer plusieurs fois par semaine aux préparations (salades, gâteaux). Même source.

### Poisson
- 2 fois par semaine, dont un poisson gras (sardines, maquereau, hareng, saumon). Portion = 100 g. Source : R/aller-vers/aller-vers-les-poissons-gras-et-maigres-en-alternance
- Surgelé et conserve acceptés ; éviter panés ou en sauce (souvent gras). Même source.
- Jusqu'à 6 ans : aucun poisson ni coquillage cru. Même source.

### Viande rouge et volaille
- Priorité à la volaille ; autres viandes (porc, bœuf, veau, mouton, agneau, abats) : pas plus de 500 g par semaine (environ 3 à 4 steaks). Source : R/reduire/reduire-la-viande-porc-baeuf-veau-mouton-agneau-abats
- Volaille : aucun plafond chiffré. Page : il n'est « pas nécessaire » de manger viande, volaille, poisson ou œufs tous les jours ; alterner avec légumes secs et céréales. Même source.
- La viande (comme poisson, œufs) est un élément du plat, pas sa base : sa quantité doit rester inférieure à celle de l'accompagnement (légumes et/ou féculents). Même source.
- Morceaux maigres (escalope de veau, filet maigre de porc, bavette, steak haché 5 % de matières grasses) ; volaille sans peau. Même source.
- Limiter nuggets et cordons bleus (gras, salés, souvent ultra-transformés). Même source.
- Portion adulte de viande ou poisson : environ 100 g (ou 2 œufs). Source : page 4-11 ans.
- Rythme conseillé : varier dans la semaine entre viande, volaille, poisson, œufs et légumes secs (page viande ci-dessus).

### Charcuterie
- Maximum 150 g par semaine (environ 3 tranches de jambon blanc). Jambon blanc et jambon de volaille préférables. Source : R/reduire/reduire-la-charcuterie
- Compte comme charcuterie : saucisses (porc ou volaille), lardons, bacon, viandes en conserve, jambons secs et crus. Même source.

### Produits laitiers
- 2 par jour pour les adultes, 3 par jour pour les enfants. Source : R/aller-vers/aller-vers-une-consommation-de-produits-laitiers-suffisante-mais-limitee
- Une portion = un yaourt nature, ou un verre de lait de 150 mL, ou 30 g de fromage (ou fromage râpé dans pâtes, gratins, quiches). Même source.
- Ne comptent pas : crème fraîche, beurre, desserts lactés (crèmes desserts, flans). Même source.
- Varier (yaourt, lait, fromage blanc, fromages) ; fromages fondus et à tartiner souvent gras, salés, pauvres en calcium. Même source.
- À partir de 4 ans, lait demi-écrémé acceptable. Même source.

### Matières grasses
- Huile, beurre, margarine : quotidiens mais en petites quantités ; préférer huile de colza, de noix, d'olive ; beurre plutôt cru ou sur les tartines. Source : R/aller-vers/aller-vers-l-huile-de-colza-de-noix-et-d-olive
- Mesure : 1 c. à café = 5 mL, 1 c. à soupe = 15 mL. Pas de quantité maximale en g ou c. à soupe par jour sur la page. Même source.
- Cuissons sans gras ajouté recommandées : étouffée, vapeur, gril, papillote. Même source.

### Sel
- Adultes : 5 g de sel par jour au maximum (environ 2 g de sodium). Source : R/reduire/reduire-les-produits-sales-et-le-sel
- Sel iodé préféré ; saler modérément l'eau de cuisson ; épices et herbes pour le goût ; le sel « caché » (pain, fromage, charcuterie, plats préparés, bouillon, soupe) est la principale source. Même source.
- Repères à environ 1 g de sel : 1 rondelle de saucisson, 1 bol de soupe, 4 tranches de pain, 1 part de pizza. Même source.
- Aucune valeur chiffrée enfants 4-11 ans trouvée sur la page (seulement : aucun sel ajouté avant 1 an).

### Sucre, boissons, ultra-transformés
- Limiter boissons sucrées, aliments gras, sucrés, salés et ultra-transformés ; viser fait maison ; produits frais ou surgelés nature. Source : R/reduire/reduire-les-boissons-sucrees-aliments-gras-sucres-sales-et-ultra-transformes
- Ultra-transformés : le site ne donne pas de définition formelle ; signal = beaucoup d'additifs (lettre E suivie de trois chiffres) ; choisir la liste d'additifs la plus courte. Même source.
- Produits sucrés pour enfants : les introduire le plus tard possible, en petites quantités. Même source.
- Limiter les produits Nutri-Score D et E (aucun seuil chiffré). Même source et R/reduire/reduire-les-produits-avec-un-nutri-score-d-et-e
- Eau : seule boisson recommandée ; sodas, sirops, jus, nectars : adultes 1 verre par jour au maximum, enfants de moins de 11 ans 1/2 verre. Même source.
- Fait maison : « Privilégiez le fait maison quand c'est possible », sans chiffre. Source : R/augmenter/augmenter-le-fait-maison
- Aliments de saison, locaux et bio : cités dans l'index, sans chiffre (pages non lues en détail).

## Enfants (5 et 8 ans)

Source principale : https://www.mangerbouger.fr/manger-mieux/a-tout-age-et-a-chaque-etape-de-la-vie/enfants-et-adolescents-de-4-a-17-ans/de-4-a-11-ans-les-portions-s-adaptent-a-l-age-de-votre-enfant, plus les pages de famille d'aliments ci-dessus.

- Toute la famille peut manger le même menu ; seules les quantités changent selon l'âge.
- 4 à 6 ans : environ la moitié d'une portion adulte. 7 à 11 ans : la portion augmente peu à peu jusqu'à la portion adulte.
- Repères : poing de l'enfant pour légumes, fruits, légumes secs, féculents ; paume de sa main pour viande, volaille, poisson.
- Viande, volaille ou poisson : 4-6 ans = 1 œuf ou 50 g ; dès 7 ans on augmente progressivement vers 100 g (ou 2 œufs) vers 11 ans.
- Fruits et légumes : à chaque repas ; portion adulte 80-100 g, moitié pour 4-6 ans.
- Produits laitiers : 3 par jour (contre 2 pour les adultes).
- Poisson : 50 g à 4-6 ans ; pas de cru ni coquillage jusqu'à 6 ans.
- Fruits à coque : pas entiers avant 6 ans (poudre ; l'enfant de 5 ans est concerné, celui de 8 ans non).
- Charcuterie avant 11 ans : exceptionnelle, sauf jambon blanc ou de volaille de temps en temps.
- Viandes hors volaille : le plafond de 500 g par semaine est donné « dès 11 ans » ; avant, le site dit seulement de privilégier la volaille et de limiter les autres viandes, sans plafond enfant chiffré.
- Boissons sucrées et jus : 1/2 verre au maximum avant 11 ans ; caféine à éviter totalement.
- Resservir seulement si l'enfant le demande, avec légumes, légumes secs ou féculents complets/semi-complets.
- Régimes amaigrissants à proscrire chez l'enfant.
- Non trouvé sur le site : besoins énergétiques (kcal) ou quantité de sel par âge pour 4-11 ans.

## La Fabrique à menus

Page principale inaccessible (HTTP 503), donc non lue. D'après une recherche web (non vérifiée par lecture de la page) : outil gratuit du PNNS qui génère des menus de la semaine pour la famille, avec liste de courses, filtres (sans viande, sans poisson, sans porc, sans œufs), et fiches recette avec valeurs nutritionnelles (calories, matières grasses, glucides, fibres, sel, protéines, grammes de fruits et légumes et de légumes secs). Les critères exacts d'équilibre de l'outil ne sont pas connus. Pistes à relire quand le site est rétabli : https://www.mangerbouger.fr/manger-mieux/la-fabrique-a-menus/ et https://www.mangerbouger.fr/manger-mieux/la-fabrique-a-menus/recettes

## Traduction pour un menu de 4-5 dîners

### A. Vient explicitement du site, mais les valeurs sont hebdomadaires ou quotidiennes (le dîner n'en porte qu'une part)
Ces plafonds et minima valent pour toute la semaine ou toute la journée, pas pour les seuls dîners. Un vérificateur sur les dîners ne peut en contrôler qu'une partie.
- Légumes secs : au moins 2 fois par semaine. Vérifiable : compter les dîners avec légumes secs (>= 2 sur 4-5 dîners est une borne sûre).
- Poisson : 2 fois par semaine dont un gras. Vérifiable : compter les dîners avec poisson (portion 100 g adulte, 50 g à 5 ans).
- Viandes hors volaille : max 500 g par semaine (adultes, dès 11 ans). Vérifiable : somme des grammes de bœuf, porc, veau, agneau, abats sur les dîners <= 500 g.
- Charcuterie : max 150 g par semaine. Vérifiable : somme sur les dîners <= 150 g.
- Priorité à la volaille parmi les viandes. Vérifiable : volaille >= autres viandes en nombre de plats.
- Viande/poisson : quantité inférieure à l'accompagnement (légumes et/ou féculents) dans le plat. Vérifiable si les recettes ont des grammes.
- Portion de légume : 80-100 g adulte ; moitié pour 4-6 ans.
- Sel : 5 g par jour maximum. Vérifiable seulement si la recette a une teneur en sel.
- Matières grasses : préférer colza, noix, olive. Vérifiable : type d'huile dans la recette.
- Aucun plat prêt ou ultra-transformé ; privilégier les recettes maison. Vérifiable : drapeau « ingrédient transformé » sur les ingrédients (liste d'additifs, nuggets, cordons bleus).
- Nutri-Score D/E : limiter. Vérifiable seulement pour des produits emballés renseignés.

### B. Interprétation (non écrite sur le site sous cette forme)
- « Légumes à chaque repas » : le site dit « en proposer à chaque repas » pour les enfants ; on en déduit au moins 1 portion de légume (ou fruit) par dîner, soit 4-5 sur la semaine. Le minimum de 5 par jour (3 légumes + 2 fruits) ne se règle pas sur un seul dîner : proposer de viser 2 portions de légumes au dîner est une hypothèse de répartition, pas une règle du site.
- Féculent complet au moins une fois par jour : si le déjeuner restant (restes) compte, un dîner avec féculent complet par jour est plausible ; exiger un féculent complet à chaque dîner serait plus strict que le site.
- Produits laitiers 2/3 par jour : le dîner peut en apporter 1 (fromage dans un gratin, yaourt en dessert) ; vérifier qu'il n'y a pas plus d'un fromage riche en sel et gras par dîner est une hypothèse.
- Fruits à coque : une poignée par jour ; au dîner, pas de quantité imposée. Contrôle suggéré : maximum de 1-2 recettes avec noix/amandes dans la semaine pour répondre au « plusieurs fois par semaine » des enfants (interprétation). Pour l'enfant de 5 ans, en poudre ou hachés finement, jamais entiers.
- Proportion des protéines : le site dit qu'on n'a pas à manger viande, volaille, poisson ou œufs tous les jours et qu'on alterne ; on déduit une répartition sur 5 dîners du type : 2 poisson (dont 1 gras), 2 légumes secs ou œufs, 1 volaille ou viande (interprétation, une des nombreuses combinaisons conformes).
- Les restes servant au déjeuner du lendemain : les plafonds hebdomadaires (viande rouge 500 g, charcuterie 150 g) devraient inclure ces restes. Une marge de sécurité (compter le plat servi deux fois pour le calcul total) est une interprétation prudente.
- Portions enfants : la moitié d'une portion adulte pour le 5 ans ; pour le 8 ans, entre la moitié et la portion adulte (le site dit « augmente peu à peu »), donc coefficient de 0,5 à 1 selon une interprétation linéaire non précisée sur le site.
- Variété : « varier », « alterner » est écrit sans seuil ; un contrôle comme « pas deux fois la même protéine principale deux soirs de suite » est une interprétation.

### C. Ce qui n'est pas vérifiable avec le site seul
- Quantité maximale de matières grasses ajoutées, de sucre ajouté, besoin énergétique : absents.
- Nombre de repas végétariens par semaine : le site ne donne pas de nombre, seulement « alterner » et légumes secs 2 fois par semaine.
- Œufs : aucune fréquence hebdomadaire trouvée dans les pages lues (seulement leur place comme alternative à la viande, 1 œuf = portion 4-6 ans, 2 œufs = portion adulte).

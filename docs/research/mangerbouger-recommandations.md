# Recommandations nutritionnelles mangerbouger.fr (Santé publique France, PNNS)

> **Rôle** : source des règles d'équilibre (§6.3 de la conception). Les contrôles retenus pour le menu sont fixés dans la conception, ce fichier en donne l'origine et le détail. Le projet ne reprend pas tout : la recommandation sur le poisson (2 fois par semaine, dont un gras) n'est pas contrôlée, par décision de l'utilisateur du 2026-11-13 (voir conception §6.3).
> **Règle de lecture** : les seuils chiffrés de la section « Citations vérifiées (2026-11-13) » ci-dessous sont recopiés du texte brut des pages (HTML téléchargé avec `curl`), avec l'URL exacte. Ce sont ceux à coder. Un chiffre qui n'y figure pas se revérifie sur mangerbouger.fr avant d'être écrit dans le code.

Recherche faite le 2026-11-12, pour la composition automatique de menus de dîners (famille : 2 adultes, 2 enfants de 5 et 8 ans, batch cooking 4-5 dîners).

Limite de méthode : la recherche du 2026-11-12 a lu les pages avec l'outil WebFetch, qui renvoie un résumé produit par un petit modèle et non le texte brut. **Mise à jour du 2026-11-13** : les 12 pages qui portent des seuils chiffrés ont été retéléchargées en HTML brut avec `curl`, et chaque seuil de la section « Citations vérifiées » a été relu contre ce texte. Tous les chiffres de ce fichier qui viennent de ces 12 pages sont confirmés ; aucune valeur n'a été corrigée. Les seuils non vérifiés sur le texte brut sont listés à la fin de la section « Citations vérifiées ». Le même jour, le guide parents 4-11 ans (PDF) a été lu avec Quartz PDFKit et la page « Manger équilibré » avec Chrome sans fenêtre. Le site signalait aussi un bandeau « plusieurs pages hors ligne suite à une faille de sécurité » : certaines pages étaient indisponibles.

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
| Manger équilibré, ça veut dire quoi | https://www.mangerbouger.fr/manger-mieux/se-faire-plaisir-en-mangeant-equilibre/manger-equilibre-ca-veut-dire-quoi-et-comment-y-arriver | oui, relue avec Chrome le 2026-11-13 : liste d'articles, pas de chiffre (voir « Compléments ») |
| La Fabrique à menus (page d'accueil) | https://www.mangerbouger.fr/manger-mieux/la-fabrique-a-menus/ | NON : HTTP 503 (recette.mangerbouger.fr : connexion refusée). Description issue d'une recherche web seulement |
| Guide parents 4-11 ans (PDF, 40 p.) | https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf | oui, relu le 2026-11-13 (texte extrait avec Quartz PDFKit, voir « Compléments ») |
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

## Citations vérifiées (2026-11-13)

Méthode : chaque page a été téléchargée en HTML brut avec `curl -sL`, convertie en texte, puis chaque citation ci-dessous a été retrouvée mot pour mot dans ce texte (`grep -F`). Date de consultation : 2026-11-13. Les guillemets « » inclus dans une citation sont ceux du site. Les pages des recommandations n'affichent pas de date de publication ; la page 4-11 ans indique « Date de publication le 10/06/2024 », « Modifié le 11/06/2024 ».

Résultat : aucune valeur du fichier n'est contredite par le site. Le guide 4-11 ans (sous-section « Compléments ») confirme les mêmes valeurs et ajoute deux nuances.

- **Fruits et légumes, par jour** : au moins 5 portions par jour, soit 3 de légumes et 2 de fruits, ou 4 de légumes et 1 de fruit.
  - Citation : « Au moins 5 fruits et légumes par jour, par exemple 3 portions de légumes et 2 fruits ou 4 de légumes et 1 fruit. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-fruits-et-legumes
- **Fruits et légumes, taille d'une portion adulte** : 80 à 100 g.
  - Citation : « Une portion « adulte », c’est l’équivalent de 80 à 100 grammes. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-fruits-et-legumes
- **Fruits et légumes, portion enfant** : 4 à 6 ans : environ la moitié de la portion adulte ; 7 à 11 ans : augmente jusqu'à la portion adulte.
  - Citation : « Pour les enfants, entre 4 et 6 ans, la portion est d’environ la moitié de celle d’un adulte. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-fruits-et-legumes
- **Fruits et légumes, enfants, fréquence** : à chaque repas.
  - Citation : « habituez les enfants à manger des fruits et légumes à chaque repas »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-fruits-et-legumes
- **Légumes secs** : au moins 2 fois par semaine.
  - Citation : « Consommer des légumes secs (lentilles, haricots, pois chiches…) au moins 2 fois par semaine car ils sont naturellement riches en fibres. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-legumes-secs
- **Féculents complets** : au moins une fois par jour, au choix parmi pain complet ou aux céréales, pâtes, semoule, riz complets.
  - Citation : « Le pain complet ou aux céréales, les pâtes, la semoule et le riz complets : au choix au moins une fois par jour. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-les-feculents-complets
- **Fibres** : au moins 25 g par jour.
  - Citation : « seules 8 % des femmes adultes et 17% des hommes atteignent la recommandation d’au moins 25g de fibres/jour »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-les-feculents-complets
- **Fruits à coque** : une petite poignée par jour ; avant 6 ans, jamais entiers (en poudre).
  - Citation : « Consommer une petite poignée par jour de fruits à coque non salés (et non sucrés et sans chocolat): noix, noisettes, amandes et pistaches »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-fruits-a-coque-non-sales-noix-noisettes-amandes-etc
- **Fruits à coque, enfants** : plusieurs fois par semaine ; pas entiers avant 6 ans.
  - Citation : « Avant les 6 ans de votre enfant, ne les donnez pas entiers en raison du risque de fausse route et d’étouffement mais mélangez-les en poudre à vos préparations. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/augmenter/augmenter-les-fruits-a-coque-non-sales-noix-noisettes-amandes-etc
- **Poisson, fréquence** : 2 fois par semaine, dont 1 poisson gras.
  - Citation : « 2 fois par semaine, dont un poisson gras (sardines, maquereau, hareng, saumon). »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-les-poissons-gras-et-maigres-en-alternance
- **Poisson, portion adulte** : 100 g.
  - Citation : « Une portion de poisson équivaut à 100g, un petit pavé de saumon ou une boite de sardine. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-les-poissons-gras-et-maigres-en-alternance
- **Poisson, portion enfant 4 à 6 ans** : 50 g.
  - Citation : « Entre 4 et 6 ans, la portion est d’environ la moitié de celle d’un adulte, une portion de 50 g de poisson suffit, »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-les-poissons-gras-et-maigres-en-alternance
- **Viande hors volaille (porc, bœuf, veau, mouton, agneau, abats)** : au plus 500 g par semaine ; priorité à la volaille.
  - Citation : « Privilégier la volaille et limiter les autres viandes (porc, bœuf, veau, mouton, agneau, abats) à 500g par semaine. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-viande-porc-baeuf-veau-mouton-agneau-abats
- **Viande hors volaille, équivalent** : environ 3 ou 4 steaks pour 500 g.
  - Citation : « 500g de viande hors volaille par semaine, cela correspond à environ 3 ou 4 steaks. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-viande-porc-baeuf-veau-mouton-agneau-abats
- **Viande hors volaille, enfants** : le plafond de 500 g vaut à partir de 11 ans ; avant, le site ne donne pas de plafond chiffré.
  - Citation : « A partir de 11 ans, comme pour les adultes, limitez les viandes hors volaille à 500 g maximum par semaine. »
  - URL : https://www.mangerbouger.fr/manger-mieux/a-tout-age-et-a-chaque-etape-de-la-vie/enfants-et-adolescents-de-4-a-17-ans/de-4-a-11-ans-les-portions-s-adaptent-a-l-age-de-votre-enfant
- **Viande, volaille, poisson, œufs : pas tous les jours** : alterner avec les légumes secs et les céréales.
  - Citation : « Il n’est pas nécessaire de manger de la volaille, de la viande, du poisson ou des œufs tous les jours, on peut alterner avec des aliments qui apportent plutôt des protéines végétales comme par exemple des légumes secs ou des produits céréaliers (au mieux complets ou semi-complets). »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-viande-porc-baeuf-veau-mouton-agneau-abats
- **Viande, poisson, œufs : place dans le plat** : quantité inférieure à celle de l'accompagnement.
  - Citation : « Ils se consomment donc en quantité inférieure à celle de l'accompagnement (légumes et/ou féculents). »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-viande-porc-baeuf-veau-mouton-agneau-abats
- **Viande, volaille, poisson, portion enfant** : 4 à 6 ans : 1 œuf ou 50 g ; vers 11 ans : environ 100 g (ou 2 œufs), soit la portion adulte.
  - Citation : « Entre 4 et 6 ans, un œuf ou une portion de 50 g de volaille, viande ou de poisson suffit »
  - URL : https://www.mangerbouger.fr/manger-mieux/a-tout-age-et-a-chaque-etape-de-la-vie/enfants-et-adolescents-de-4-a-17-ans/de-4-a-11-ans-les-portions-s-adaptent-a-l-age-de-votre-enfant
- **Charcuterie** : au plus 150 g par semaine.
  - Citation : « Limiter la charcuterie à 150g par semaine. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-charcuterie
- **Charcuterie, équivalent et contenu** : environ 3 tranches de jambon blanc ; saucisses, lardons, bacon, viandes en conserve, jambons secs et crus en font partie.
  - Citation : « Cela correspond à environ 3 tranches de jambon blanc ou de jambon de volaille. Les saucisses de porc ou de volaille, les lardons, le bacon, les viandes en conserve, les jambons secs et crus font partie de la charcuterie. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-charcuterie
- **Charcuterie, enfants** : avant 11 ans : exceptionnelle, sauf jambon blanc ou de volaille de temps en temps ; dès 11 ans : 150 g par semaine.
  - Citation : « En dehors du jambon blanc ou de volaille de temps en temps, la charcuterie ne doit être consommée qu’exceptionnellement. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-la-charcuterie
- **Produits laitiers** : 2 par jour pour les adultes, 3 par jour pour les enfants.
  - Citation : « 2 par jour pour les adultes et 3 pour les enfants. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-une-consommation-de-produits-laitiers-suffisante-mais-limitee
- **Produits laitiers, une portion** : un yaourt nature, ou 150 mL de lait, ou 30 g de fromage.
  - Citation : « Un produit laitier c’est par exemple un yaourt nature, un verre moyen de lait (150mL), un morceau de fromage (30g) ou du fromage râpé sur les pâtes, gratins et quiches… »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-une-consommation-de-produits-laitiers-suffisante-mais-limitee
- **Sel** : au plus 5 g par jour pour un adulte (2 g de sodium).
  - Citation : « Il est recommandé de ne pas consommer plus de 5g de sel par jour pour un adulte, soit l’équivalent de 2 g de sodium »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-les-produits-sales-et-le-sel
- **Boissons sucrées et jus** : au plus 1 verre par jour ; enfants de moins de 11 ans : 1/2 verre.
  - Citation : « dans tous les cas, pas plus d’un verre par jour. Pour les enfants de moins de 11 ans, pas plus d’1/2 verre. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-les-boissons-sucrees-aliments-gras-sucres-sales-et-ultra-transformes
- **Matières grasses ajoutées** : aucun seuil chiffré : « en petites quantités », huile de colza, de noix ou d'olive de préférence.
  - Citation : « Les matières grasses ajoutées – huile, beurre et margarine – peuvent être consommées tous les jours en petites quantités. Privilégiez l’huile de colza, de noix et d’olive. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/aller-vers/aller-vers-l-huile-de-colza-de-noix-et-d-olive
- **Nutri-Score D et E** : aucun seuil chiffré : limiter.
  - Citation : « Limitez les produits avec un Nutri-Score D et E. »
  - URL : https://www.mangerbouger.fr/l-essentiel/les-recommandations-sur-l-alimentation-l-activite-physique-et-la-sedentarite/reduire/reduire-les-boissons-sucrees-aliments-gras-sucres-sales-et-ultra-transformes

### Compléments : guide parents 4-11 ans (PDF) et article « varier son alimentation sur la semaine »

Lus le 2026-11-13. Le guide est un PDF de 40 pages (même programme PNNS que le site), converti en texte avec Quartz PDFKit (`pdftotext` n'est pas installé) ; les citations sont recopiées après remplacement des retours à la ligne par des espaces. Les numéros de page sont ceux du PDF.

Écarts trouvés : aucune valeur chiffrée contredite. Deux nuances sont signalées ci-dessous : le poisson (« dont un gras » sur le site, « en alternant gras et maigre » dans le guide) et la portion de légumes de l'enfant.

- **Guide 4-11 ans : fruits et légumes** : à chaque repas, pour atteindre au moins 5 par jour à l'âge adulte.
  - Citation : « Pour qu’il atteigne progressivement au moins 5 fruits et légumes par jour à l’âge adulte, habituez votre enfant à manger chaque jour des fruits et légumes aux repas. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 12 du PDF)
- **Guide 4-11 ans : taille d'une portion** : moitié de la portion adulte entre 4 et 6 ans ; elle augmente jusqu'à la portion adulte entre 7 et 11 ans.
  - Citation : « Entre 4 et 6 ans, la portion est d’environ la moitié de celle d’un adulte. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 34 du PDF)
- **Guide 4-11 ans : légumes, légumes secs, féculents complets, nombre de portions** : une portion à tout âge, repère = la main de l'enfant, puis on ressert selon l'appétit. ÉCART de lecture : le guide ne divise pas ces portions par deux ; la page « fruits et légumes » dit 80 à 100 g chez l'adulte et la moitié à 4-6 ans (voir plus haut). Les deux se rejoignent si « une portion » veut dire un poing d'enfant, ce que dit aussi la page 4-11 ans.
  - Citation : « Pour les fruits et légumes, les légumes secs et les produits céréaliers complets ou semi-complets : à tout âge, servez une portion et resservez selon l’appétit. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 35 du PDF)
- **Guide 4-11 ans : légumes secs** : au moins 2 fois par semaine (même valeur que le site).
  - Citation : « Légumes secs (lentilles, haricots, pois chiches, etc.) au moins 2 fois par semaine car ils sont naturellement riches en fibres et contiennent des protéines végétales. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 28 du PDF)
- **Guide 4-11 ans : féculents complets** : au moins une fois par jour (même valeur que le site).
  - Citation : « Le pain complet ou aux céréales, les pâtes, la semoule et le riz complets : au choix au moins une fois par jour car ils sont naturellement riches en fibres. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 29 du PDF)
- **Guide 4-11 ans : poisson, fréquence** : 2 fois par semaine. ÉCART de formulation : le site dit « dont un poisson gras », le guide dit « en alternant poisson gras et poisson maigre ». Garder « 2 fois par semaine, dont 1 gras » est la lecture la plus stricte et compatible avec les deux.
  - Citation : « Le poisson : deux fois par semaine en alternant poisson gras (sardines, maquereau, hareng, saumon) et poisson maigre. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 27 du PDF)
- **Guide 4-11 ans : portion adulte de viande, poisson, œufs** : 100 g, ou 2 œufs (même valeur que le site).
  - Citation : « Une portion adulte, c’est : 100 g de volaille, poisson ou viande ou 2 œufs. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 35 du PDF)
- **Guide 4-11 ans : portion de viande, poisson, œufs à 4-6 ans** : 1 œuf ou 50 g (même valeur que le site).
  - Citation : « un œuf ou une portion de 50 g de volaille, d’autre viande ou de poisson suffit »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 35 du PDF)
- **Guide 4-11 ans : viande hors volaille et charcuterie à partir de 11 ans** : 500 g et 150 g par semaine au plus, « comme pour les adultes » (même valeur que le site).
  - Citation : « À partir de 11 ans : comme pour les adultes, limitez les viandes hors volaille à 500 g maximum par semaine et la charcuterie à 150 g maximum par semaine. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 35 du PDF)
- **Guide 4-11 ans : viande avant 11 ans** : priorité à la volaille, pas de plafond chiffré pour les autres viandes (cohérent avec le fichier).
  - Citation : « Privilégier la volaille et limiter les autres viandes (porc, bœuf, veau, mouton, agneau, abats). »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 22 du PDF)
- **Guide 4-11 ans : charcuterie avant 11 ans** : exceptionnelle, sauf jambon blanc ou de volaille de temps en temps (même valeur que le site).
  - Citation : « En dehors du jambon blanc ou de volaille de temps en temps, la charcuterie ne doit être consommée qu’exceptionnellement. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 22 du PDF)
- **Guide 4-11 ans : alterner les protéines dans la semaine** : alterner volaille, autres viandes, poisson, œufs et légumes secs (écrit sans chiffre).
  - Citation : « Pour instaurer de bonnes habitudes alimentaires dès l’enfance, et pour toute la famille, vous pouvez alterner dans la semaine volaille, autres viandes, poisson, œufs et légumes secs. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 22 du PDF)
- **Guide 4-11 ans : composition du plat principal** : une portion de légumes et une portion de féculents ou de légumes secs, avec volaille, poisson, œufs ou viande (écrit sans chiffre).
  - Citation : « Prévoyez toujours une portion de légumes et une autre de féculents ou de légumes secs en plat principal, accompagnées à midi ou le soir de volaille, de poisson, d’œufs ou de viande. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 25 du PDF)
- **Guide 4-11 ans : produits laitiers** : 3 par jour pendant l'enfance, 2 par jour à l'âge adulte (même valeur que le site).
  - Citation : « 3 produits laitiers par jour pendant l’enfance et l’adolescence ; ils apportent du calcium et sont essentiels à la croissance et la bonne minéralisation des os. Ensuite, à l’âge adulte, 2 produits laitiers par jour seront suffisants. »
  - URL : https://www.mangerbouger.fr/content/show/2132/file/DT05-414-24B%20148-5fx210_GUIDE_40P_MANGER_BOUGER_4-11_ANS_bd_v2.pdf (page 18 du PDF)
- **Page « Manger équilibré » (article « Comment varier son alimentation sur la semaine ? ») : échelle de temps** : l'équilibre se juge sur la semaine, pas sur un repas (appui pour les contrôles hebdomadaires).
  - Citation : « Cet équilibre alimentaire ne se construit pas sur un repas ou sur une journée mais plutôt sur la semaine. »
  - URL : https://www.mangerbouger.fr/manger-mieux/se-faire-plaisir-en-mangeant-equilibre/manger-equilibre-ca-veut-dire-quoi-et-comment-y-arriver/comment-varier-son-alimentation-sur-la-semaine
- **Même article : plat principal** : viande, volaille, poisson ou œufs : composant du plat, jamais l'élément dominant (même idée que la page viande).
  - Citation : « Viandes, volaille, poissons ou œufs peuvent être des composants du plat principal mais non l’élément dominant. »
  - URL : https://www.mangerbouger.fr/manger-mieux/se-faire-plaisir-en-mangeant-equilibre/manger-equilibre-ca-veut-dire-quoi-et-comment-y-arriver/comment-varier-son-alimentation-sur-la-semaine

Seuils et pages **non** vérifiés sur le texte brut :

- La Fabrique à menus (https://www.mangerbouger.fr/manger-mieux/la-fabrique-a-menus/) : HTTP 503 et page « Site en Maintenance », y compris avec Chrome sans fenêtre (3 essais espacés, 2026-11-13). Aucun critère d'équilibre de l'outil n'est connu.
- Le PDF « L'essentiel des recommandations alimentaires » : non téléchargé ; aucun chiffre du fichier n'en dépend (le guide 4-11 ans, lui, est lu, voir ci-dessus).
- Les pages sans seuil chiffré, relues avec Chrome sans fenêtre (JavaScript exécuté) : l'index des recommandations adultes n'est qu'une liste de liens (Augmenter, Aller vers, Réduire) ; « Manger équilibré, ça veut dire quoi » n'est qu'une liste d'articles (les deux citations ci-dessus viennent de l'article « Comment varier son alimentation sur la semaine ? »). Fait maison, Nutri-Score D et E et alcool ne portent aucun chiffre. Le fait maison dit seulement « Privilégiez le fait maison quand c’est possible. ».
- Les valeurs de la section « Traduction pour un menu de 4-5 dîners » (sous-sections B et C) sont des interprétations du projet, pas des phrases du site, et ne se vérifient pas par citation.
- Les repères de sel par aliment (1 g de sel par rondelle de saucisson, etc.), le jus limité à 1 verre dans la page fruits et légumes et les repères poing / paume de la main enfant sont relus sur le texte brut mais ne sont pas cités ci-dessus : ils ne sont pas des seuils de contrôle.

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

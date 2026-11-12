# Règles du batch cooking selon cuisine-addict.com (Sandra Thomann)

> **Rôle** : source des règles de méthode du batch cook (§6.1 de la conception). On en tire le texte de règles du prompt et les tables de conservation de `core`.
> **Règle de lecture** : quand deux pages donnent des durées différentes (section 3.9), retenir la plus courte. Les recettes restent hors du projet : seules les règles sont reprises.

Extraction faite le 2026-11-12 à partir du HTML des pages (curl + extraction de texte). Toutes les pages ci-dessous ont été récupérées avec un code HTTP 200 et lues jusqu'à la fin du texte de l'article.

## Pages lues

Pages demandées :

| Slug | Lue en entier |
|---|---|
| `batch-cooking-mode-demploi` | oui |
| `comment-faire-son-menu-de-batch-cooking` | oui |
| `faq-batch-cooking-questions-reponses` | oui |
| `comment-bien-rechauffer-les-plats-de-mon-batch-cooking` | oui |
| `quels-sont-les-aliments-quil-ne-faut-pas-rechauffer-pourquoi-quels-risques` | oui |
| `batch-cooking-mes-menus-et-recettes-pour-toute-lannee` | oui pour le texte (sommaire, liens, définition). La liste des ~115 menus a été ignorée volontairement. Aucune règle propre à cette page. |
| `guide-de-conservation-congelation` | oui (existe) |
| `batch-cooking-le-bon-plan-pour-faire-des-economies-sur-son-budget-courses` | oui |
| `dossiers` | oui, mais seule la liste des liens est utile (la page n'est qu'un index) |

Pages ajoutées, trouvées dans la section « Spécial Batch Cooking » et « Tout sur la conservation » de `/dossiers/` ou liées depuis les pages ci-dessus :

| Slug | Lue en entier |
|---|---|
| `zoom-sur-le-batch-cooking` | oui |
| `combien-de-temps-conserver-les-plats-batch-cooking` | oui |
| `comment-bien-conserver-ses-aliments-au-refrigerateur` | oui |
| `zoom-sur-la-congelation` | oui |
| `la-conservation-sous-vide-avantages-duree-conservation-astuces` | oui |
| `faq-conservation-sous-vide` | oui |
| `comment-conserver-les-plats-de-mon-batch-cooking-quels-contenants-choisir` | oui |
| `menus-pour-annee` | oui (page « menus équilibrés » de l'autrice, peu de règles batch ; une seule règle utile, citée en 8) |

Section « Spécial Batch Cooking » de `/dossiers/` : `quels-sont-les-aliments-quil-ne-faut-pas-rechauffer...`, `comment-bien-rechauffer...`, `batch-cooking-mode-demploi`, `comment-faire-son-menu-de-batch-cooking`, `faq-batch-cooking-questions-reponses`, `batch-cooking-mes-menus-et-recettes-pour-toute-lannee`. Toutes lues.

Non lus : `comparatif-meilleures-machines-sous-vide` (test de matériel, hors sujet), les podcasts et la vidéo FAQ (audio/vidéo, non accessibles en texte), les pages de menus individuels et recettes (on veut des règles, pas des recettes). Les pages « Bocaux et stérilisation » (`sterilisation-...`, `comment-conserver-les-courgettes`, `comment-conserver-les-tomates...`) n'ont pas été lues : hors périmètre batch cooking.

## Convention

- Chaque puce = une règle, suivie de la source entre parenthèses (slug abrégé, voir la table ci-dessous).
- « **Règle de l'autrice** » = énoncé explicite de Sandra Thomann. « **Officiel** » = recommandation attribuée à un organisme (ANSES, etc.) ou à la santé publique. Sans mention, c'est une règle de l'autrice.
- Aucune recommandation ANSES nommée n'apparaît dans ces pages. Les seules mentions externes sont « les organismes de santé publique » (portions, voir 1.7) et des normes de la chaîne du froid citées sans source précise.
- Les durées sont celles du texte, données par l'autrice « à titre indicatif, pour des adultes en bonne santé ». Elle précise être « plutôt plus prudente que pas assez ».

Slugs abrégés utilisés :
`mode-emploi` = batch-cooking-mode-demploi ; `menu` = comment-faire-son-menu-de-batch-cooking ; `faq` = faq-batch-cooking-questions-reponses ; `rechauffer` = comment-bien-rechauffer-les-plats-de-mon-batch-cooking ; `ne-pas-rechauffer` = quels-sont-les-aliments-quil-ne-faut-pas-rechauffer... ; `guide-conservation` = guide-de-conservation-congelation ; `combien-de-temps` = combien-de-temps-conserver-les-plats-batch-cooking ; `frigo` = comment-bien-conserver-ses-aliments-au-refrigerateur ; `congelation` = zoom-sur-la-congelation ; `sous-vide` = la-conservation-sous-vide-... ; `faq-sous-vide` = faq-conservation-sous-vide ; `contenants` = comment-conserver-les-plats-...-quels-contenants-choisir ; `budget` = batch-cooking-le-bon-plan-pour-faire-des-economies... ; `zoom-batch` = zoom-sur-le-batch-cooking ; `menus-annee` = menus-pour-annee.

---

## 1. Composition du menu

### 1.1 Nombre de plats et de portions

- Le batch sert aux **soirs de semaine**. Le week-end est hors batch (plus de temps, sorties). (faq)
- Elle prépare **4 plats pour la semaine = 16 portions**, qu'elle juge « largement » suffisant pour 5 soirs. Elle était passée de 5 à 4 plats parce que les restes s'accumulaient, qu'on avait parfois envie de sortir ou de craquer pour autre chose, et que le congélateur se remplissait « ce qui n'est pas du tout le but ». (faq)
- Dans ses livres, elle propose toujours **5 plats par semaine** pour lundi-vendredi. (faq)
- Il faut **raisonner en portions, pas en plats** : « on peut manger 2 fois la même chose dans la semaine », il n'est pas obligatoire de préparer un plat différent par repas. (menu, faq)
- Formule de calcul : nombre de personnes x nombre de repas x nombre de jours. Exemples de l'autrice : 2 personnes le soir = 10 portions ; 4 personnes midi et soir = 40 portions. (faq) Application à 4 personnes, dîners seulement, 5 soirs : 4 x 1 x 5 = **20 portions** (calcul déduit de sa formule, pas écrit tel quel).
- Pour plus de portions : (a) multiplier les quantités (ex. x2 = 32 portions, « ne prend pas beaucoup plus de temps » mais on risque de manger plusieurs fois la même chose) ; (b) ajouter des plats (16 + 2 plats pour 4 personnes = 24 portions, « un peu plus de temps ») ; (c) si le volume est très grand, **scinder en 2 sessions de 3 jours** plutôt que 5-6 h en cuisine. (faq)
- Structure type donnée en hiver pour 5 repas : 1 soupe accompagnée d'une salade composée, 1 plat en sauce, 1 gratin, 1 tarte salée accompagnée de crudités, 1 viande accompagnée de légumes et féculents. Elle conseille d'imaginer des catégories par semaine et de garder ses anciens menus. (zoom-batch)
- Pour avoir des repas de midi sans manger deux fois la même chose d'affilée : doubler les portions et décaler les jours (le repas du lundi soir est resservi le mercredi midi), ou congeler les portions en plus pour se constituer un stock. (faq)

### 1.2 Équilibre

- Quantités recommandées **par repas et par portion, citées comme venant des « organismes de santé publique »** (**Officiel**, organisme non nommé) : 80 à 100 g minimum de légumes (à volonté, cuits ou crus) ; 100 g de protéines animales (viande, poisson, œufs) ou végétales (association céréales/légumineuses) ; des féculents selon le type (100 g de pâtes, 80 g de pommes de terre, 2 tranches de pain complet). Les féculents ne sont « pas nécessaires » sans activité sportive ; on peut augmenter féculents et protéines en cas de sport. (menu)
- Ses menus sont prévus pour 16 portions ; autant de lecteurs les trouvent trop copieux que trop justes. La portion dépend de l'activité et des habitudes : à adapter. (menu)
- Hors batch, sur ses menus de la semaine : de saison, pas trop de viande, au moins 1 fois du poisson par semaine. (**Règle de l'autrice**, pour ses menus perso, pas pour le batch.) (menus-annee)

### 1.3 Mutualisation d'ingrédients et de préparations

- « L'un des principes du batch » : utiliser un **même ingrédient ou une même préparation dans plusieurs plats**. « Ne vous éparpillez pas trop ! » (menu)
- Gain de temps supplémentaire avec des **préparations communes** : une béchamel utilisée dans 2 plats ; des légumes vapeur cuits sur plusieurs étages avec d'autres légumes. Exemples cités : sauce bolognaise -> pâtes, lasagnes, chili ; ratatouille -> chakchouka ou sauce mixée ; purée de légumes -> accompagnement, hachis parmentier, brandade, croquettes. (menu)
- Éplucher et couper tous les légumes en début de séance, puis répartir « la moitié » ou « un tiers » à l'œil entre les recettes. Ne pas peser la répartition (« on n'est pas à 10 g d'oignon près »). (mode-emploi)

### 1.4 Ingrédient phare et saisonnalité

- Regarder les fruits et légumes du moment et en choisir **1 ou 2 comme « ingrédient phare »** du menu. Tenir une liste par saison des ingrédients de saison que l'on aime. (menu) Exemples d'automne cités : courges, champignons, choux. (menu)
- Regarder les promotions du magasin habituel pour orienter le choix (ex. escalopes de poulet, lots de légumes). (menu)
- Le batch dépend des saisons : ses recettes sont classées par saison parce que les produits de saison sont meilleurs et moins chers. (budget)
- Si c'est le premier batch : faire l'**inventaire** placards/congélateur/frigo et vider le stock dans les premiers menus (viande congelée, légumes en bocal). (menu)

### 1.5 Plats à éviter ou à faire au dernier moment

- Les plats sont destinés à être réchauffés : certaines préparations sont « à oublier ou à faire en dernière minute » (omelette, cuisson des pâtes, steak grillé). (menu)
- **Pâtes** : ne pas les préparer d'avance (bouillie au réchauffage ; cuisson courte, faisable pendant que le plat réchauffe). Seule exception : les gratins de pâtes. (combien-de-temps)
- **Risotto** : plat « minute », jamais réchauffé (pâteux, compact, trop cuit). On peut préparer d'avance le bouillon et les échalotes. (combien-de-temps) (La congélation du risotto est notée « +/- », déconseillée, voir 3.4.)
- **Viandes grillées individuelles** (steak, côtes d'agneau) : cuisson minute (réchauffées elles durcissent et sèchent). La viande reste crue au frigo, bien emballée, et se consomme vite. Elle préfère conserver du poulet cuit ou un rôti entier plutôt que des steaks ou côtelettes cuits. (combien-de-temps)
- **Poisson** : quasi absent de ses menus batch. Très fragile (« conservation 2 jours max »), meilleur préparé minute. Il est réservé au week-end (acheté frais, cuisiné, mangé de suite). Exceptions : conserves (thon, sardines), poisson surgelé (saumon, cabillaud), ajouté au dernier moment, ou plat à manger en premier. (faq)
- **Fruits de mer** : rares dans ses batch. Astuce : crevettes surgelées ajoutées directement le jour du réchauffage, sans décongélation, le reste du plat (sauce) étant préparé d'avance. (ne-pas-rechauffer)
- **Pommes de terre** : elle ne conseille pas de les préparer en avance (supportent mal la conservation, s'oxydent ; pas de risque sanitaire mais mauvais au goût). (ne-pas-rechauffer) Mais des plats préparés à base de pomme de terre (gratin, purée, hachis) restent dans ses menus, voir durées en 3.1.
- **Œufs cuits seuls** (omelette, œuf au plat) : à faire minute. Œufs durs : à manger froids. (ne-pas-rechauffer)
- **Féculents** : elle préfère préparer d'avance les féculents « complets » (riz complet, légumineuses) que les « blancs » (cuisson courte, faisables minute au réchauffage ; moins bonne tenue). (combien-de-temps)
- **Soupes avec crème et plats avec œufs/crème** : préparer seulement bouillon et légumes au batch, et ajouter la crème au moment du réchauffage. (combien-de-temps, guide-conservation)
- **Gratins** : ne pas gratiner pendant le batch, ajouter le fromage râpé le jour J (voir 4 et 5). (rechauffer)

### 1.6 Ordre de consommation dans la semaine

- Manger **en premier** les plats avec des aliments fragiles (poisson, viande). Congeler tout de suite les plats qui attendront **plus de 4 jours**. (faq)
- Exemple de l'autrice : batch le samedi, repas du lundi au vendredi -> lundi, mardi, mercredi au réfrigérateur ; jeudi et vendredi au congélateur. (faq)
- « Les plats végétariens composés uniquement de légumes sont ceux qui se tiennent le plus longtemps : **privilégiez-les pour la fin de la semaine** dans votre menu de batch. » (combien-de-temps)
- Règle de l'ingrédient le plus fragile : la durée de conservation d'un plat est celle de son ingrédient le plus fragile, dans l'ordre **poisson - œufs - produits laitiers - viande - légumes - féculents et céréales**. (combien-de-temps)
- Autre formulation (billet plus ancien) : la plupart des plats se gardent « facilement 4 jours » au frigo (sauf poisson et viande) ; garder les préparations pour les 3 jours à venir au frigo, congeler les autres juste après refroidissement, les sortir la veille au soir. (zoom-batch) Ce billet est ancien et la FAQ dit « 4 jours ».
- Si on congèle un plat, il faut compter 12 à 24 h de décongélation au frigo, donc une journée de conservation en plus avant de le manger. (congelation)

### 1.7 Choix des recettes et points de cuisson

- Le gain de temps commence au choix des recettes ; il représente « la moitié » du temps gagné, l'autre moitié est l'organisation. (menu)
- **Panacher les modes de cuisson** : ne pas choisir 3 recettes qui passent au four, mais 1 ou 2 au four, 1 ou 2 sur la plaque, 1 au cuit-vapeur, 1 au robot cuiseur si on en a (non indispensable), pour cuire en simultané. (menu)
- **Une seule cuisson longue par menu** (« de préférence pas plus d'une »). (menu)
- Tenir compte de la conservation au moment de choisir : certaines préparations se congèlent mal (pommes de terre, légumes gorgés d'eau) : les consommer en premier ou s'en passer. (menu)
- Éviter de choisir des plats pour lesquels on ne veut pas de réchauffage (voir ci-dessus). Idée reçue : certains plats sont même meilleurs réchauffés (plats mijotés). (rechauffer)

---

## 2. Organisation de la session

- **Lire le déroulé en entier deux fois** : une fois avant les courses, une fois juste avant la séance. Repérer les préparations en amont (tremper des légumineuses, faire une marinade). (mode-emploi)
- **Préparer tous les ingrédients avant de cuisiner** : peser les légumineuses, réunir les légumes, sortir les épices, ôter les emballages. Ne pas avoir à fouiller les placards (utiliser la table de salle à manger, une desserte, un bac sur une chaise). (mode-emploi, menu)
- Les durées de ses menus incluent épluchage, découpe, réalisation et cuisson ; elles **excluent vaisselle et rangement** et supposent les ingrédients prêts et pesés. (mode-emploi) Durée indicative : « je ne sais pas qui a décrété que le batch c'est 2 heures » ; le temps dépend de l'habitude, du matériel ; au début, attendre plus de temps ; ne pas se comparer. (faq) Le titre de la page menu parle d'une organisation « en 2 heures ». (menu)
- **Ordre des tâches** (**Règle de l'autrice**, menu) :
  1. Laver, éplucher et couper tous les légumes.
  2. S'il y a une cuisson longue (« pas plus d'une par menu »), préparer ses ingrédients en premier et lancer la cuisson tout de suite, avant de préparer le reste.
  3. Faire cuire en parallèle sur plusieurs points de cuisson (voir 1.7).
- **Four** : « optimisez votre four en mettant **deux plats en même temps** avec une cuisson en **chaleur tournante** ». Pour tout ce qui passe au four, elle **portionne avant cuisson** et enfourne plusieurs plats en même temps. (menu, faq)
- Cuisson vapeur : rentabiliser sur plusieurs étages avec d'autres légumes. (menu)
- Si le batch est trop long : **batcher en deux fois** (ex. 2 sessions de 3 jours pour de gros volumes). (menu, faq)
- Lave-vaisselle : le faire tourner la veille et le vider avant la séance, y mettre la vaisselle au fur et à mesure. Sans lave-vaisselle, laver les gros ustensiles au fur et à mesure. (mode-emploi)
- **Les cuissons à terminer pendant le batch** : finir totalement la cuisson d'une quiche pendant la séance (pour la conservation et parce qu'il est difficile de la finir une fois froide). (rechauffer)
- Refroidir rapidement chaque plat sorti de cuisson (voir 3.1 et 3.6), donc prévoir de la place de refroidissement (grille, fenêtre, bain d'eau froide). (frigo)
- Adapter : les temps de cuisson et l'assaisonnement dépendent du matériel, de la taille des morceaux, de la qualité des ingrédients ; goûter, ajuster, surveiller les cuissons (feu, couvercle, liquide). (mode-emploi)
- Les poids de féculents/légumineuses sont donnés **crus** sauf indication contraire dans la liste de courses. Si une recette ne dit pas de les cuire d'abord, ils s'ajoutent crus. (mode-emploi)
- Pour les légumes comptés en pièces (1 tomate, 1 poireau) : pas de poids précis, le calibre importe peu (100 g d'écart ne change rien). Si une boîte de maïs fait 200 g au lieu de 150 g, mettre le tout. (mode-emploi)

---

## 3. Conservation

### 3.1 Règles générales de conservation

- Le plat se conserve **aussi longtemps que son ingrédient le plus fragile** (ordre en 1.6). La cuisson **ne prolonge pas la DLC** d'un produit. (combien-de-temps)
- Les durées supposent des produits frais, une chaîne du froid respectée et un plat qui n'a pas « traîné » à température ambiante. En cas d'odeur ou de goût bizarre : ne pas consommer. Plus de prudence pour les personnes fragiles (jeunes enfants, personnes âgées, malades). (combien-de-temps)
- **Ne jamais laisser des aliments crus ou cuits plus de 2 heures à température ambiante** ; refroidir vite et mettre au frigo ou au congélateur dans un récipient adapté, **dans les 2 heures maximum** après préparation (encore plus vite si la pièce est chaude). (guide-conservation, ne-pas-rechauffer)
- Règle de l'autrice : un reste oublié sur le plan de travail toute la nuit ne se consomme plus ; une DLC dépassée va à la poubelle ou au compost ; retourner un pot à chaud n'est pas une stérilisation. (ne-pas-rechauffer)
- **Ne pas mettre d'aliment chaud au frigo** (il fait monter la température). Refroidir rapidement avant : plat sur une grille, dehors protégé, fond de la casserole dans l'eau froide. (frigo, guide-conservation)
- Réglage du frigo : **pas plus de 4 °C**. Zones : partie la plus froide (+2 à +4 °C) pour viande crue, hachée, poisson, crustacés, plats préparés ; zone intermédiaire (+5 à +7 °C) pour viande, poisson et légumes cuits, potages maison, produits laitiers frais, sauces ; bac à légumes (+8 à +10 °C) ; portes (+5 à +15 °C) pour beurre et boissons. (frigo)
- Ne pas surcharger le frigo (l'air froid doit circuler). Nettoyage mensuel. Bien emballer les aliments (odeurs, contaminations). (frigo, guide-conservation)
- Les plats batch sont notés par l'autrice dans ses menus avec un temps « optimal » : « vous pouvez vous fier à minima aux nombre de jours que je donne ». (sous-vide, faq-sous-vide)
- Autres durées frigo (viande crue, produits bruts), pour mémoire : viande crue du boucher ou pré-emballée entamée 2 jours ; abats frais, viande hachée du boucher (y compris saucisses) 24 h ; fruits de mer et poissons crus 1 à 2 jours ; viande cuite bien emballée 3 à 5 jours ; légumes cuits bien emballés 3 à 5 jours ; pâtisserie avec lait et œufs 3 à 4 jours ; restes de conserve 2 jours. (frigo) Dans un autre article : bœuf cru 4 à 5 jours, porc cru 3 à 4 jours, poulet cru 1 à 2 jours, abats et hachée crue du boucher 24 h ; cru, poisson/crustacés/mollusques pas plus de 24 h, congeler sinon. (combien-de-temps)

### 3.2 Durées au réfrigérateur et sous vide (boîte hermétique / sous vide)

Tableau issu de `guide-conservation` et `combien-de-temps`. Quand les deux pages diffèrent, les deux valeurs sont données (voir 3.9).

| Plat | Frigo (boîte hermétique) | Sous vide |
|---|---|---|
| Plat cuisiné à base de poisson | 1 à 2 jours | 4 à 5 jours |
| Crustacés cuits / coquillages cuits | 1 à 2 jours | 4 à 5 jours |
| Préparation de farce crue (viande hachée, aromates, œuf) | 1 à 2 jours (`guide-conservation`) ou 1 jour (`combien-de-temps`) | 3 à 4 jours |
| Plat cuit à base de viande hachée (boulettes, légumes farcis) | 3 jours | 6 à 8 jours |
| Mijotés, viandes en sauce (bourguignon, chili, bolognaise) | 3 à 4 jours | 8 à 10 jours |
| Volaille cuite | 3 à 4 jours | 10 jours |
| Viandes grillées sans sauce | 4 à 5 jours | 10 à 12 jours |
| Quiches (œufs, crème, viande) | 3 à 4 jours (`guide-conservation`) ; 3/4 j (tableau général de `combien-de-temps`) ; 2 à 3 jours (liste « plats préparés » de `combien-de-temps`) | 6 jours (5 à 6 jours dans la liste « plats préparés ») |
| Préparations à base d'œufs/crème (sauce, garniture de quiche) | 2 à 3 jours | 4 à 5 jours (5 à 6 jours dans `combien-de-temps`) |
| Gratin de légumes simple (tian) | 5 jours | 15 jours |
| Gratin avec béchamel | 2 à 3 jours | 5 à 6 jours |
| Gratin avec pâtes (lasagnes, cannellonis) et/ou viande | 3 à 4 jours | 6 à 7 jours (6 à 8 pour gratin viande) |
| Soupes, potages, bouillons de légumes ou viande | 5 jours | 10 jours |
| Soupe/potage avec crème | 3 jours (`guide-conservation`) ; 2 jours « crème / viande » (`combien-de-temps`) | 5 jours |
| Légumes poêlés ou rôtis | 5 jours | 15 jours |
| Légumes racines râpés (carottes, betteraves) | 3 à 4 jours | 10 jours |
| Choux (fleurettes de chou-fleur, brocoli) | 4 à 5 jours | 10 jours |
| Salade lavée, essorée, triée | 3 à 4 jours | 1 semaine |
| Légumes gorgés d'eau (tomates, concombres) | 2 jours | 5 à 6 jours |
| Champignons de Paris crus entiers | 3 à 4 jours | 7 à 8 jours |
| Champignons crus coupés | 1 à 2 jours (citronnés) | 4 jours |
| Champignons poêlés | 1 à 2 jours | 5 à 6 jours |
| Riz complet cuit | 5 à 7 jours | 10 jours |
| Riz blanc cuit | 5 jours | 10 jours |
| Pâtes cuites | 5 jours | 10 jours |
| Légumineuses cuites (lentilles, pois chiches, haricots) | 5 à 7 jours | 10 jours |
| Pommes de terre cuites à l'eau | 24 heures | 2 à 3 jours |
| Pommes de terre sautées ou en purée | 2 jours | 4 jours |
| Gratin de pommes de terre (dauphinois, parmentier) | 3 à 4 jours (`guide-conservation`) ; 2 à 3 jours (liste de `combien-de-temps`) | 6 jours (5 à 6 jours dans la liste) |
| Sauce tomate cuisinée | 3 à 4 jours | 6 à 8 jours |
| Sauce béchamel (beurre et lait) | 2 à 3 jours (tend à figer et à devenir grumeleuse) ; 4/5 jours sous vide | |
| Blanc d'œuf cru | 1 semaine | - |
| Jaune d'œuf cru | 2 à 3 jours | - |
| Œufs durs | 1 semaine | - |
| Omelette, œuf au plat | Non : à consommer de suite | Non |
| Crème fraîche, lait | 3 à 5 jours | - |
| Crêpes | 2 jours (pâte crue) ; 3/4 jours cuites | 4 jours |
| Gaufres | 3 jours | 6 jours |
| Pâtisserie avec lait/œufs | 3 à 4 jours | 7 jours |
| Compote de pomme | 7 jours | 15 jours |
| Yaourt maison | 10 jours | - |

Source de la table : (guide-conservation, combien-de-temps).

- Œufs frais entiers 3 semaines à 1 mois ; œufs durs 1 semaine non écalés, 2 jours écalés. (frigo)
- Œufs frais non préparés : 3 semaines dans leur coquille. (combien-de-temps) Les œufs n'ont pas besoin du frigo tant qu'ils sont en coquille. (frigo)
- Produits de la mer cuits : « à consommer de préférence sous 1 jour, maximum 2 » s'ils sont extra frais. (combien-de-temps)
- Durées indicatives pour adultes en bonne santé ; au-delà, saveur ou texture peuvent changer, mais « en cas de doute, ne consommez pas ». (guide-conservation)

### 3.3 Sous vide : règles

- Le sous vide **prolonge** la durée de 3 à 5 fois (exemple : plat de viande 3 jours -> jusqu'à 1 semaine). (sous-vide, frigo)
- Tableau de l'autrice (normal -> sous vide) : plats cuisinés avec viande 3 j -> 8/10 j ; plats avec œufs ou crème 3/4 j -> 8/10 j ; plats de légumes seuls 4/5 j -> 10/12 j ; soupes 5 j -> 15 j ; salade verte, crudités 2/3 j -> 10/15 j ; viande fraîche crue 3/5 j -> 6/9 j ; poisson frais 2/3 j -> 4/5 j ; charcuterie ouverte 4/6 j -> 10/15 j ; herbes fraîches 2/3 j -> 10/15 j. (sous-vide) Ces valeurs diffèrent un peu du tableau de `guide-conservation` (voir 3.9).
- Sous vide jusqu'à 15 jours selon ingrédients : on peut prévoir les plats une semaine à l'avance. (faq-sous-vide)
- **Le sous vide ne remplace pas le frigo** : un aliment qui doit être au frigo reste au frigo sous vide ; la seule conservation à température ambiante est la stérilisation en bocaux. (faq-sous-vide)
- Les durées partent d'un produit frais, mis sous vide dans le respect des règles d'hygiène ; **« la conservation sous vide n'arrête pas le temps »** : un plat entamé le dernier jour de sa durée frigo ne peut pas être gardé 8 jours de plus sous vide. Les durées sont pour des plats maison à base de produits bruts frais ; pour un plat industriel, suivre sa date. (faq-sous-vide)
- Seule la congélation « met en pause » (et seulement pour un plat jamais congelé auparavant) ; après décongélation, la péremption reprend où elle s'était arrêtée (s'il restait 1 jour, manger dans les 24 h). (faq-sous-vide)
- Mettre les aliments **le plus froids possible** sous vide (pas de vapeur d'eau). Liquides : contenant assez grand. Étiqueter avec la date. Mains, contenants propres et secs. (frigo)
- Aliments crus qui fermentent (choux, haricots, oignons, ail) : les blanchir avant ou vérifier le vide régulièrement. Champignons frais : sous vide seulement s'ils sont surgelés. Fromage bleu : pas sous vide. (faq-sous-vide)
- Remettre sous vide **le plus vite possible** après avoir prélevé une portion ; chaque ouverture réduit la durée (les durées sont données sans remise en contact avec l'air). (faq-sous-vide)
- Plats en sauce : possibles en **boîtes** (pas en sachets), sans remplir à ras bord. Boîtes en verre : propres, pas besoin de stériliser. (faq-sous-vide)
- Elle privilégie les boîtes réutilisables aux sachets jetables. (guide-conservation, faq-sous-vide)
- Autres durées sous vide données dans `frigo` : fromages 14 (frais) à 60 jours ; légumes crus 7 à 20 jours ; fruits frais 14 à 20 jours ; viande crue du boucher 6 à 9 jours ; viande hachée du boucher 4 à 5 jours ; fruits de mer et poissons crus 4 à 6 jours ; viande cuite 10 à 15 jours ; légumes cuits 8 à 15 jours ; pâtisserie lait/œufs 6 à 10 jours. (frigo)
- Positionnement : le sous vide est « parfaitement adapté au batch », permet de batcher pour 2 semaines et évite la question « congélable ou non ». Mais « rien n'est indispensable à la pratique du batch ». Surcoût : budget au moins triplé par rapport à des boîtes classiques. (sous-vide, contenants)

### 3.4 Congélation : quoi congeler, durées, conseils

Tableau de `guide-conservation` (complété par `combien-de-temps` et `congelation`). « +/- » = déconseillé mais possible.

| Aliment / plat | Congélation ? | Conseil | Durée |
|---|---|---|---|
| Gratins de légumes | Oui | Sans le fromage de préférence ; décongélation lente au frigo, ajouter le fromage, four à 160 °C | 3 mois |
| Quiches et tartes | Oui | Découper en parts une fois refroidi, congeler à plat sur une plaque puis regrouper en boîte ; ne pas décongeler, four à 160 °C | 3 mois |
| Chili, bolognaise | Oui | | 3 mois |
| Lasagnes cuites | Oui (« Oui » dans `guide-conservation`, « déconseillée » dans la liste de `combien-de-temps` pour gratins de pâtes) | | 3 mois |
| Ragoûts | Oui, sauf à base de pomme de terre | | 3 mois |
| Risotto | +/- | Je déconseille ; si besoin, sous-cuire et ajouter du bouillon | 3 mois |
| Bouillon | Oui | Petits moules à glaçons | 3 mois |
| Soupes aux légumes | Oui | Ajouter de l'eau, re-mixer | 3 mois |
| Soupes avec crème | +/- | La crème se sépare : ajouter la crème après | 3 mois |
| Boulettes de viande crues ou cuites | Oui | Sur plaque d'abord, puis boîte | 3 mois |
| Pièces de viande crue | Oui | Emballer hermétiquement (brûlure du froid) | 6 à 12 mois |
| Poissons crus | Oui | Sécher à l'essuie-tout, emballer hermétiquement | 3 à 5 mois |
| Viande cuite | Oui | Mêmes recommandations ; la viande crue décongelée puis cuite à cœur peut être recongelée | 3 mois |
| Poisson cuit | Oui selon ingrédients | | 2 à 3 mois |
| Crustacés, coquillages | Oui, de préférence cuits et décortiqués | | 2 à 3 mois |
| Salades vertes, choux à feuilles | Non | | - |
| Légumes riches en eau (tomate, concombre) | Non | | - |
| Légumes racines | Oui | Éplucher, couper, blanchir 5 min | jusqu'à 1 an |
| Choux (brocoli, chou-fleur) | Oui | Fleurettes, blanchir 5 min | jusqu'à 1 an |
| Légumes rôtis ou poêlés | Oui | Décongélation lente au frigo | 3 mois |
| Champignons crus | Oui | Brosser, couper en lamelles | 6 mois |
| Champignons cuits | Oui | | 3 mois |
| Riz, pâtes | Non | Texture dure puis pâteuse (mais `combien-de-temps` donne « Oui » pour le riz blanc cuit, voir 3.9) | - |
| Quinoa, boulgour | +/- | Devient dur, réchauffer doucement avec du liquide | 3 mois |
| Pomme de terre crue ou cuite seule | Non | Noircit, pâteuse | - |
| Purée ou gratin de pomme de terre | Déconseillé | Devient pâteux, farineux ; mais « beaucoup de personnes en congèlent » | 3 mois |
| Légumineuses cuites | Déconseillé | Mieux vaut les garder sèches | - |
| Blanc d'œuf cru | Oui | | 9 mois |
| Jaune d'œuf cru | Oui | Bien battu (ajouter un peu de sel ou de sucre) | 4 mois |
| Œufs durs, omelette | Non | Caoutchouteux | - |
| Crème fraîche, lait | Oui | Tend à se séparer | 3 mois |
| Vinaigrette huile/vinaigre | Oui | Re-mélanger | 3 mois |
| Vinaigrette yaourt, mayonnaise | Non | Texture granuleuse | - |
| Béchamel | +/- | Déconseillée | 3 mois |
| Sauce tomate | Oui | | 6 mois |
| Sauce avec viande (bolognaise) | Oui | | 3 mois |

Source : (guide-conservation, combien-de-temps).

- Durées générales de congélation maison (autre page) : bœuf, volaille, gibier 12 mois ; fruits et légumes 8 à 10 mois ; poisson 3 à 5 mois ; plats préparés maison 2 à 3 mois ; pain 1 mois. (congelation)
- **Règle de l'autrice : ne pas garder les plats congelés plus de 2 mois** (la congélation préserve les vitamines jusqu'à 5/6 semaines). (faq, sous-vide) Les tableaux donnent 3 mois pour la plupart des plats ; il faut choisir (voir 3.9).
- Pour la composition d'un menu avec congélation : éviter ou consommer en premier les aliments qui se congèlent mal (pommes de terre, légumes gorgés d'eau). (menu)
- Ne pas congeler : pastèque, melon, concombre, tomates (grande teneur en eau) ; pommes de terre crues ; œufs entiers en coquille ; bouteille pleine de liquide ; fromages frais ; yaourts ; sauces émulsionnées (mayonnaise, tartare, hollandaise). (congelation)
- **Plats congelés**, signalés dans ses menus comme congelables ; le verre convient car il passe du congélateur au frigo et au four. (faq)

### 3.5 Congélation : comment

- Congeler **le plus frais possible**, rapidement après l'achat ou la préparation. Mais on peut congeler un plat préparé la veille ou quelques jours avant : la congélation ne fait que stopper la prolifération, qui reprend au même niveau à la décongélation. Exemple : légumes poêlés (5 j au frigo) congelés au bout de 2 jours, à consommer dans les 3 jours après sortie. (congelation)
- **N'ajouter au congélateur que des préparations complètement refroidies**, idéalement passées au frigo (+/- 4 °C) avant. (faq, congelation)
- Contenants hermétiques ; hygiène : mains, ustensiles, récipients propres et secs ; **petites portions** (saisies plus vite, moins de gros cristaux) ; **étiqueter** (nom + date). (congelation)
- Liquides : ne pas trop remplir, laisser de la marge (au moins 3 cm dans une bouteille). (congelation)
- Pour les aliments qui collent (boulettes, parts de quiche, gaufres, cookies, petits fruits) : congeler d'abord à plat sur une plaque (~24 h pour les fruits), puis regrouper en boîte. (guide-conservation, congelation)
- Blanchir les légumes avant congélation : 5 à 10 minutes maximum à l'eau bouillante (environ 250 g par litre d'eau), puis eau froide avec glaçons, égoutter, sécher soigneusement. (congelation) (le guide dit « blanchir 5 minutes »)
- Viande et poisson : produits « ultra frais » ; éponger au papier absorbant ; emballer individuellement. (congelation)
- Congélateur à **-18 °C minimum**, constant. (guide-conservation) Plats riches en matière grasse : se gardent moins longtemps (oxydation). (guide-conservation)
- Panne de courant : un congélateur plein garde le froid environ 48 h, à moitié plein 24 h, porte fermée. Si encore dur et givré : recongeler possible (prudence avec le poisson). Si décongelé : produits crus restés sous 4 °C -> cuire à cœur puis consommer ou recongeler ; aliments déjà cuits -> jeter ; si +4 °C dépassés -> jeter. (congelation)
- La congélation ne tue pas les bactéries, elle les met « en sommeil ». (congelation)
- Ne pas congeler pour congeler : elle a réduit à 4 plats pour ne pas remplir le congélateur. (faq)

### 3.6 Décongélation et recongélation

- **Décongeler au frigo** (jamais à température ambiante), 12 à 24 h avant selon la quantité, ou fonction décongélation du micro-ondes. (congelation, guide-conservation, rechauffer : « sortez-les la veille »)
- Un produit décongelé se consomme **dans les 3 jours**. (congelation)
- **Ne jamais recongeler** un produit décongelé, sauf produit **cru** décongelé puis **cuit à cœur**, qui peut être recongelé après refroidissement. (faq, congelation, guide-conservation)
- Certains plats se cuisent ou se réchauffent directement sans décongélation : quiches et tartes en parts, feuilletés individuels, plats préparés, petits fruits et légumes, gaufres, croque-monsieur, gâteaux simples. (rechauffer, congelation, guide-conservation)
- Crêpes : décongeler à température ambiante ou four doux (exception dans le tableau). (guide-conservation)
- Pain cuit et viennoiseries : réchauffer au four 10 à 15 minutes à 150 °C. Pâte à pain crue : décongeler au frigo puis refaire une levée. (guide-conservation)

### 3.7 Contraintes particulières par type d'aliment (frigo)

- Aliments qui ne vont pas au frigo : tomates (perdent leur saveur), pommes de terre, oignons/ail/échalotes entiers, courges et courgettes, bananes, concombres entiers, œufs en coquille, etc. (frigo)
- Crudités d'avance : légumes racines (carotte, betterave) et choux râpés ou découpés en boîte hermétique ; filet de jus de citron sur les carottes. Éviter de découper trop à l'avance les légumes gorgés d'eau (tomate, concombre) sauf sous vide. (combien-de-temps)
- Salade : après lavage, rincer à l'eau froide avec 1 c. à soupe de vinaigre blanc (dans un saladier), essorer, boîte hermétique garnie de papier absorbant (à renouveler). (combien-de-temps)
- Champignons : ne pas les garder trop longtemps ; l'autrice les consomme sous 24 à 48 h. (ne-pas-rechauffer)

### 3.8 Hygiène et signaux d'alerte

- Signaux d'alerte : emballage endommagé, opercule bombée, odeur anormale, moisissures ; en cas de doute, ne pas consommer. (frigo)
- Poisson cuit : se fier à l'odeur. (combien-de-temps)
- Mieux vaut jeter un plat douteux que risquer une intoxication. (combien-de-temps)

### 3.9 Incohérences à connaître entre les pages

Si un générateur doit choisir une valeur, la plus prudente est indiquée en gras ; ce choix est une proposition, pas une règle de l'autrice.

- Quiche au frigo : 3 à 4 jours (`guide-conservation`) / 3/4 j (`combien-de-temps`, tableau légumes) / 2 à 3 jours (`combien-de-temps`, liste « plats préparés »). Prudent : **2 à 3 jours**.
- Soupe avec crème : 3 jours (`guide-conservation`) / 2 jours (`combien-de-temps`, « crème / viande »). Prudent : **2 jours**.
- Gratin de pomme de terre : 3 à 4 jours (`guide-conservation`) / 2 à 3 jours (`combien-de-temps`, liste). Prudent : **2 à 3 jours**.
- Farce crue : 1 à 2 jours (`guide-conservation`) / 1 jour (`combien-de-temps`). Prudent : **1 jour**.
- Poisson/crustacés/coquillages crus : 1 à 2 jours (`frigo`) / pas plus de 24 h (`combien-de-temps`).
- Riz blanc cuit congélation : « Oui » (`combien-de-temps`) vs riz/pâtes « Non » (`guide-conservation`).
- Plats préparés congelés : 3 mois (tableaux), « 2 à 3 mois » (`congelation`), « pas plus de 2 mois » (`faq`, `sous-vide`).
- Gratins de pâtes (lasagnes) : « Oui » (`guide-conservation`) vs « Déconseillée » (liste `combien-de-temps`) ; gratins avec béchamel : 3 mois (`guide-conservation`, sauce +/-) vs « déconseillé » (`combien-de-temps`).
- Plats batch en général : « 4 jours » (`faq`, `zoom-batch`) vs durées par plat de 2 à 5 jours (les tableaux). Les tableaux sont plus précis.
- Pâte à tarte crue : 2 mois (`guide-conservation`), pas de contradiction connue ailleurs.

---

## 4. Réchauffage

### 4.1 Principes

- **Réchauffer n'est pas recuire.** Erreur la plus courante : micro-ondes à une puissance trop élevée. (rechauffer)
- **Micro-ondes : 600 W maximum**, contenant adapté, **petits intervalles**, mélanger et remettre si pas assez chaud. (rechauffer)
- Four ou casserole : température douce, **sans ébullition**. (rechauffer)
- L'autrice réchauffe la plupart de ses plats au micro-ondes (pour ne pas préchauffer le four) ; seuls les « feuilletés » vont au four pour rester croustillants. Plats en sauce tels quels ; gratins avec un peu de crème ou de bouillon, ou les précuire et gratiner au dernier moment. (faq)
- Robot cuiseur / multicuiseur avec fonction réchauffage : température généralement limitée à **80 °C**. (rechauffer)
- Les temps et températures du texte sont à adapter à son four. (rechauffer)

### 4.2 Méthode par type de plat

- **Plats mijotés, en sauce, soupes** : à la casserole (méthode la plus douce, permet de rallonger la sauce épaissie), de préférence casserole large à fond épais, feu doux, en remuant régulièrement. (rechauffer)
- **Quiches, tourtes, feuilletés** : four pour garder le croustillant. Sortir du frigo le temps de préchauffer le four à **150/160 °C**, puis enfourner **15/20 minutes**. Couvrir de papier cuisson si le dessus dore trop. Toujours finir la cuisson de la quiche pendant le batch. (rechauffer)
- **Gratins, lasagnes** : four, **130/140 °C**, après avoir sorti le plat du frigo le temps de préchauffer ; ajouter du liquide (bouillon ou crème) dans le plat pour ne pas dessécher ; surveiller (dépend de la taille). Elle ne gratine pas pendant le batch et ajoute le fromage râpé le jour J. (rechauffer) (Dans le guide de congélation, gratin décongelé : four à 160 °C jusqu'à ce que ce soit chaud.)
- **Céréales et légumineuses nature** : casserole avec un filet d'eau ou d'huile, feu doux, remuer ; ou à la vapeur (évite de dessécher). (rechauffer)
- **Plats congelés** : décongeler la veille au frigo avant de réchauffer. Exceptions réchauffées directement : quiches et tartes en parts, feuilletés individuels (four 150/160 °C) ; gaufres et croque-monsieur directement du congélateur au grille-pain ou gaufrier (attention que la garniture ne coule pas). (rechauffer)
- **Quinoa, boulgour congelés** : réchauffer doucement en rajoutant du liquide. (guide-conservation)
- **Soupes congelées** : ajouter un peu d'eau et/ou re-mixer ; à décongeler 24 h au frigo ou directement à la casserole. (guide-conservation, combien-de-temps)
- **Risotto congelé** (déconseillé) : sous-cuire puis ajouter du bouillon au réchauffage. (guide-conservation)
- **Petites portions** : plats en verre allant au micro-ondes. (faq)

### 4.3 Aliments à ne pas réchauffer ou avec précautions : explications de l'autrice

Note de cadrage : elle conteste les listes « aliments toxiques réchauffés » du web (titres racoleurs) et dit s'être documentée. **Les risques décrits ci-dessous sont ceux qu'elle expose, sans citation d'étude ni de source officielle.**

- **Épinards** (et navet, céleri, laitue, betterave) : riches en nitrates qui peuvent se transformer en nitrites si les épinards cuits sont mal conservés (**pas mis au frigo dans les 2 heures**) **et** mal réchauffés (micro-ondes trop fort). Taux faible, sans danger pour un adulte en bonne santé, mais risque pour les bébés et personnes fragilisées. Conclusion : réchauffables si bien conservés, sans micro-ondes pleine puissance, et pas pour des personnes fragiles. (ne-pas-rechauffer)
- **Pomme de terre** : le risque vient d'un séjour prolongé à température ambiante. Refroidir vite, au frais dans les **2 heures maximum**. Et elle ne conseille pas de la préparer d'avance (oxydation, goût). (ne-pas-rechauffer)
- **Œufs** : l'œuf cuit seul ne se réchauffe pas (digestion difficile, texture et odeur) ; œufs durs froids ; omelettes et œufs au plat minute. Les préparations à base d'œufs (quiche) sont réchauffables : finir la cuisson au batch, réchauffage doux. (ne-pas-rechauffer)
- **Poulet** : si bien cuit à cœur, refroidi et conservé : réchauffage doux possible (viande un peu plus sèche) ; poulet rôti restant : de préférence froid en sandwich ou salade ; escalopes en sauce : réchauffables doucement. Si pas assez cuit (rosé) : ne pas finir au micro-ondes (cuisson non uniforme, ne détruit pas toujours les salmonelles) mais au four ou à la poêle. **Bien cuire totalement la viande préparée en avance.** (ne-pas-rechauffer)
- **Fruits de mer** : déconseillé de les réchauffer car « réchauffé = conservé plus d'un jour », et ils se dégradent vite (risque d'intoxication). Réservés au week-end/plats minute ; option crevettes surgelées ajoutées au réchauffage. (ne-pas-rechauffer)
- **Riz** : réchauffable ; le risque vient de plusieurs heures à température ambiante après cuisson. Prépare du riz d'avance presque chaque semaine, conservé au frigo. (ne-pas-rechauffer)
- **Champignons** : elle en réchauffe régulièrement, surtout en sauce, sans souci ; risque = ballonnements, pas intoxication ; consommer sous 24 à 48 h ; si on digère mal, ajouter les champignons frais au réchauffage. (ne-pas-rechauffer)
- Rappel général de l'autrice : respecter les normes d'hygiène et la chaîne du froid, surtout pour les personnes à risque ; ne pas se laisser influencer par le « sensationnalisme ». (ne-pas-rechauffer)

---

## 5. Ce qui se prépare le jour J (à faire au dernier moment)

- **Pâtes** (cuites pendant que le plat réchauffe), **risotto**, **omelette / œufs au plat**, **steak et pièces de viande individuelles grillées**, **poisson frais** (week-end). (menu, combien-de-temps, faq)
- **Gratinage** : fromage râpé ajouté au réchauffage, le jour J. (rechauffer)
- **Crème** dans les soupes et préparations : ajoutée au réchauffage. (combien-de-temps)
- **Crevettes surgelées** : ajoutées dans le plat au réchauffage, sans décongélation. (ne-pas-rechauffer)
- **Champignons frais** : peuvent être ajoutés au réchauffage d'une sauce si l'on digère mal les réchauffés. (ne-pas-rechauffer)
- **Accompagnements « du placard »** à préparer en dernière minute pour le service (riz, pâtes sèches, céréales, quinoa, boulgour, etc.). (faq) Elle prépare aussi d'avance le riz complet et les légumineuses, voir 1.5.
- Dans ses menus publiés : une rubrique « ce qu'il vous reste à faire dans la semaine ». (menus-annee) (Le contenu précis n'est pas détaillé dans les pages lues.)
- Pour la finition croustillante : quiches, tourtes, feuilletés réchauffés au four ; gaufres et croque-monsieur au grille-pain. (rechauffer)
- Sortir du congélateur la veille au soir les plats à décongeler (12 à 24 h). (zoom-batch, congelation)

---

## 6. Contenants et matériel

### 6.1 Contenants

- **Verre avec couvercle** (préféré au plastique) : polyvalent (préparer, cuire, stocker), se nettoie bien, ne marque pas avec la sauce tomate, durable, pas de micro-particules de plastique. Les boîtes plastiques existantes peuvent être gardées pour d'autres usages. (contenants, faq)
- Exigence principale : **fermeture hermétique** ; passage au frigo, congélateur, micro-ondes et lave-vaisselle ; idéalement aussi au four. Vérifier les pictogrammes sous la boîte (risque d'éclatement si le verre n'est pas prévu pour le congélateur ; la mention « conservation » peut indiquer qu'il ne va pas au four). (contenants, faq)
- Commencer avec les boîtes que l'on a déjà, remplacer ensuite. Acheter en lots. (contenants)
- Bocaux et bouteilles en verre de récupération : sauces, vinaigrettes, soupes. (contenants, frigo)
- **Tailles recommandées** (contenance, usage) : (contenants)
  - environ 0,5 L : sauces, vinaigrettes, crudités râpées ;
  - environ 1 L : portions individuelles ou éléments à assembler dans la semaine ;
  - environ 2 L : 2 portions de plats en sauce, céréales, soupes ;
  - environ 3 L avec couvercle hermétique : gratins pour 4 personnes ;
  - plat à tarte avec couvercle (tourtière).
- Son équipement : contenants moyens pour 2 portions (soirs ou congélation) ; petits pour 1 portion (midi ou congélation) ; très grands plats à gratin (4 à 6 portions). Elle **portionne avant la cuisson** pour ce qui va au four. (faq, contenants)
- Déterminer le nombre de contenants d'après le nombre de portions et de repas, et la part à congeler. Choisir la taille pour optimiser la place dans le frigo. (contenants, zoom-batch)
- Congélation : contenants lavables et réutilisables (verre de préférence), fermant hermétiquement ; ne pas trop remplir (liquides gonflent). (congelation)
- Sous vide : boîtes réutilisables plutôt que sachets ; verre borosilicate (sans couvercle) pour le four ; couvercle plastique non four. (faq-sous-vide)
- Les boîtes sous vide sont **facultatives** et coûtent au moins 3 fois plus cher. (contenants)
- Autres : boîtes plastique ventilées (fruits, légumes, herbes), tissus enduits de cire d abeille réutilisables (Be Wrap) à la place du film alimentaire. (contenants, frigo)
- Frigo : prévoir 50 L par personne avec un minimum de 100 L (base indiquée par l'autrice). (frigo)

### 6.2 Matériel de cuisine

- **Au moins 3 bons couteaux** : couteau d'office, couteau de chef ou santoku d'au moins 20 cm, couteau scie de taille moyenne. La découpe des légumes est la principale perte de temps. (mode-emploi)
- Cuiseur vapeur, robot cuiseur : utiles mais « non indispensables ». « Rien n'est indispensable à la pratique du batch, une batterie de cuisine de base et de bons couteaux suffisent. » (menu, sous-vide)
- Lave-vaisselle vide avant la séance. (mode-emploi)
- Épicerie de base à avoir en permanence (placards) : épices (sel, poivre, gros sel, muscade, curry, garam masala, coriandre, curcuma, cannelle ; en option paprika, cumin, piment doux, graines de moutarde, gingembre ; herbes de Provence, thym, laurier), bouillon cube ; condiments (miel, sirop d'érable, moutardes, Worcestershire, sauce de poisson, sauce soja) ; féculents et légumineuses (riz basmati, long, rond ; pâtes sèches ; lentilles vertes et corail ; quinoa, boulgour, blé) ; huiles et vinaigres (beurre, huile d'olive, huile neutre, huile de coco, vinaigre balsamique, vinaigre de cidre) ; bases (lait, farine, fécule, chapelure, sucres, levure, vanille). (faq) Ce sont « essentiellement des condiments d'assaisonnement et des accompagnements à préparer en dernière minute ».

---

## 7. Budget et courses

- Le batch fait baisser la note par quatre mécanismes (budget) :
  1. **Fait maison** : cuisiner des produits bruts, surtout en plus grandes quantités, coûte beaucoup moins cher que du plat traiteur ; goûters/desserts maison aussi.
  2. **N'acheter que le nécessaire** : menu et liste de courses établis à l'avance, pas de craquage en rayon, pas de courses d'appoint en milieu de semaine (supérette souvent plus chère).
  3. **Produits de saison** : meilleurs et moins chers (éviter de payer les tomates et courgettes d'été en hiver « 3 fois le prix »).
  4. **Anti-gaspillage** : quantités exactes, cuisson immédiate, plus de légumes qui moisissent au bac, congélation repérée tout de suite.
- Faire un **inventaire** des stocks et utiliser en priorité ce que l'on a déjà dans les premiers menus ; ensuite n'acheter que ce dont le menu a besoin. (menu)
- Regarder les **promotions** du magasin habituel pour choisir les ingrédients phares. (menu)
- Utiliser un seul four, une seule vaisselle : économies d'énergie. (budget, faq)
- « En cuisinant tout de suite tous vos ingrédients, vous ne conservez plus d'aliments crus dans votre réfrigérateur » : moins de risque de gâchis. (faq)
- Pour 1 ou 2 personnes : cuisiner des plats congelables, au bout de 1 à 2 semaines on a un roulement de plats maison au congélateur. (budget)
- Ses menus publiés donnent la liste de courses et le prix pour 4 personnes. (zoom-batch) (Aucun chiffre de budget n'est donné dans les pages règles. Les montants sont dans les menus individuels, non lus.)
- Gaspillage : en moyenne 30 kg d'aliments jetés par habitant et par an (chiffre cité sans source). (sous-vide)

---

## 8. Autres points utiles

- **Principe général** : le batch cooking = préparer plusieurs plats en une session pour la semaine ; gain de temps, économie, praticité. Le soir, on ne fait qu'assembler et réchauffer. (faq)
- **Ne pas se comparer** : les durées de ses menus sont indicatives ; au début, le batch prend plus de temps. (faq, menu)
- **Garder le sens critique** : goûter, ajuster l'assaisonnement, surveiller les cuissons, ajouter du liquide si sec. (mode-emploi)
- **Hygiène de base**: mains, ustensiles, plan de travail, récipients propres et secs. (congelation)
- **Équipement du frigo** : emplacement loin du four/radiateur, 4 °C max, nettoyage mensuel (bicarbonate, vinaigre blanc, eau chaude). (frigo)
- **Gâteaux et goûters batch** : privilégier les gâteaux secs et les préparations simples (quatre-quarts, gâteau au yaourt) ; les crèmes et fruits se conservent moins. (combien-de-temps)
- **Personnes fragiles** (jeunes enfants, personnes âgées, malades) : plus de prudence sur durées de conservation et réchauffage (nitrites des épinards, etc.). (combien-de-temps, ne-pas-rechauffer)
- Petit déjeuner salé et goûter : préférences personnelles de l'autrice, pas des règles de batch. (menus-annee)
- Les articles de la section sont des guides de l'autrice ; aucune norme officielle (ANSES, DGAL) n'y est citée nominativement. Seuls les repères de portions viennent de « organismes de santé publique » (non nommés) ; certaines mentions (frigo à 4 °C, -18 °C au congélateur, 2 heures à température ambiante, chaîne du froid) correspondent à des repères d'hygiène courants, mais **le texte ne les attribue pas à un organisme**.
- Informations absentes des pages : température de cuisson à cœur des viandes (sauf « bien cuite à cœur », rosé = insuffisant) ; durée de vie d'un plat après la sortie du frigo ; règles sur le réchauffage multiple d'un même plat ; durée en jours après décongélation pour chaque plat (seulement « 3 jours » en général) ; coût chiffré d'un menu dans les pages de règles. Ne pas inventer.

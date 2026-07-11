# Shop+ — le parcours à pied (WO-4.1)

Ouvrez l'aperçu dans Expo Go (voir PREVIEW.md à la racine). Le bandeau
« Aperçu — bac à sable » reste visible : tout ici est un essai, rien n'est
réel. En bas de chaque écran : « Données d'essai — rien ici n'est réel. » et
« Recommencer la démo » (remet tout à zéro, un seul geste). « Retour » en
haut à gauche revient toujours en arrière.

## Le chemin, étape par étape

1. **Accueil.** Vous voyez : Shop+, la promesse (« Choisissez de beaux
   produits, partagez votre lien, gagnez votre part. »), et UN bouton
   principal : « Voir les opportunités ». En dessous, discret : « Mes gains ».
   *Test 5 secondes : je suis revendeuse, ce bouton me montre quoi vendre.*
2. **Les opportunités.** Une liste qui DÉFILE : sept produits d'essai (pagne
   wax, karité, Faso Dan Fani…), chacun avec son repère de quartier, et
   d'abord « Votre gain net : 1 600 F » en grand vert — le net TOUJOURS avant
   tout (la vraie règle d'argent, jamais le brut seul) — puis, plus petit,
   « Prix pour la cliente : 9 200 F ». Action : « Créer ma sélection ».
   *Test 5 secondes : voilà ce que je peux vendre, et ce que chaque produit
   me rapporte vraiment.*
3. **Ma sélection.** La même liste, mais on touche pour choisir : le produit
   choisi prend un contour vert et affiche « Choisi » ; en bas, le compte
   (« Produits choisis : 2 »). Action : « Voir ma vitrine ».
   *Test 5 secondes : je touche ce que je veux vendre, je vois ce que j'ai pris.*
4. **Aperçu de ma vitrine.** Ce que verront vos clientes : les produits
   choisis avec LEUR prix (9 200 F…) — jamais votre gain, jamais la
   commission : le prix cliente ne porte aucune trace de votre part. Si rien
   n'est choisi : « Votre vitrine attend ses premiers produits. Revenez en
   choisir. » — un état vide digne, pas une erreur. Action : « Créer mon lien
   de vente ». *Test 5 secondes : c'est ma boutique vue par ma cliente.*
5. **Le moment du lien signé.** En carte : `shop-plus.demo/s/awa-essai` avec,
   juste dessous, « Lien d'essai — il ne s'ouvre pas. » (impossible de le
   confondre avec un vrai lien). L'explication : « Ce lien porte votre nom.
   Chaque vente passée par ce lien vous est comptée. » Action : « Voir mes
   gains ». *Test 5 secondes : ce lien est à moi, chaque vente me revient.*
6. **Mes gains.** En très grand : « Votre gain net (essai) : 9 520 F » — le
   net d'abord, toujours le plus gros chiffre. Dessous, le détail honnête :
   gain brut (commission + marge) 11 900 F · part Shop+ (20 %) − 2 380 F ·
   votre net 9 520 F. Puis la preuve simple, l'exemple canon : produit vendu
   10 000 F → gain brut 2 500 F · part Shop+ (20 %) − 500 F · **votre net
   2 000 F**. Et la suite dite en mots simples : « Séra livre. L'argent suit
   les règles. Votre part vous revient. »
   *Test 5 secondes : je sais exactement ce que je touche, et pourquoi.*

Depuis « Mes gains », « Les opportunités » relance un tour ; « Recommencer la
démo » remet le monde et le chemin à zéro.

## Ce qui est volontairement absent
Aucun paiement réel, aucun réseau, aucun vrai lien : le lien affiché ne
s'ouvre pas et le dit. Chaque franc affiché sort de la vraie cascade d'argent
(le fichier de graines est généré par `computeWaterfall` et re-vérifié au
franc près par les tests) — la démo obéit aux règles, elle ne les invente pas.

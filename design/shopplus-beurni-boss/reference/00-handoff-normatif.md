# En-têtes Boutique — Série 6 · Burkina Faso cinématique — HANDOFF

Ce fichier transforme les cinq maquettes « Beurni Boss » en spécifications d’implémentation mobile web, en français, avec mesures, couleurs, états de données et règles de repli explicites.  
La maquette autonome de chaque style, recadrée à **360×800 px**, constitue le contrat visuel de pixels ; le présent relevé en est la traduction technique normative.  
En cas d’écart entre un effet photoréaliste de la maquette et une solution web robuste, la règle écrite ci-dessous prévaut afin de préserver lisibilité, honnêteté des données, performance et comportement à **320 px**.

## Les 5 styles

- **MASQUE — planches Bwa** : `#EFE9DC`, `#141414`, `#C8332A`; damiers, cibles concentriques, chevrons, cadres orthogonaux et lumière muséale. Les références Bwa sont **abstraites** : aucun masque cérémoniel précis n’est reproduit.
- **HARMATTAN — contre-jour de poussière** : `#F7D6A6→#DE8A52`, `#4E2C18`, `#FFF7EA`; soleil voilé, dunes, poussière en suspension, acacias et oiseaux en silhouette.
- **BALAFON — nuit de concert** : `#2E1B2E`, `#160D18`, `#E8B476→#C98A3B`, `#B886D9`; projecteurs croisés, touches de balafon, résonateurs, portée musicale et cadre-tambour.
- **SÉANCE — grand écran de Ouaga** : `#171226`, `#0D0916`, `#E8B84B`, `#B89AE8`; faisceau de projecteur, pellicule 35 mm, ampoules de marquise, ticket de cinéma et silhouette urbaine.
- **CAURIS — lagune & porte-bonheur** : `#145248`, `#0E3E36`, `#D9B87A`, `#C8F0DE`, `#FFF7E8`; rayons sous-marins, anneaux de vague, bulles, coquillages cauris et banc de sable.

# PARTIE A — RELEVÉS PAR STYLE

## 1. MASQUE — planches Bwa

**1. Palette.** Le fond principal du héros est `#EFE9DC`. La barre d’application est `#FFFFFF`, avec icônes `#141414`, wordmark « Shop » `#141414`, signe « + » `#C8332A` et badge panier `#C8332A` avec texte `#FFFFFF`. Le nom de boutique utilise `#141414` et son dernier segment `#C8332A`. Les textes secondaires sont `#2A2927`; les métadonnées atténuées `#5A554D`. Les aplats rituels et la bande de confiance sont `#141414`; les séparateurs sont `#EFE9DC` à `.42`. Les cercles d’icônes sont `#EFE9DC`, anneau `#C8332A`, pictogramme `#141414`, micro-accent `#C8332A`. La page sous l’en-tête est `#F6F1E7`. Le wash lumineux est un `linear-gradient(112deg, transparent 0 25%, rgba(255,255,255,.32) 42%, rgba(255,255,255,.08) 63%, transparent 78%)`; le vignettage est `rgba(20,20,20,.12)`.

**2. Motif / décor.** Le héros mesure `246 px` de haut à 360 px et `236 px` à 320 px. Un damier Bwa abstrait occupe la base du cadre photo : bande `18 px`, cases `14×14 px`, alternance `#141414/#EFE9DC`, décalage d’une demi-case sur la seconde rangée. Une cible concentrique décorative de `30 px` comprend trois anneaux de `2 px` espacés de `4 px`; elle est placée `top: 34 px; left: 12 px`. Un bloc de chevrons à angle droit, `44×96 px`, pas horizontal `12 px`, trait `4 px`, est ancré `right: -8 px; top: 84 px`; il reste hors de la colonne de texte. Un fantôme de planche verticale, `74×206 px`, opacité `.075`, se place `left: 204 px; top: 18 px`, sans détail figuratif identifiable. Une frise géométrique de `8 px` termine le héros, motif `16 px` répétitif. Aucun rayon de coin dans le héros ; seuls les éléments de preuve peuvent avoir `2 px` maximum.

**3. Couche cinéma.** Sous toutes les couches textuelles, poser un wash diagonal clair incliné à `112°`, puis une ombre latérale `linear-gradient(90deg, rgba(20,20,20,.08), transparent 32%, transparent 70%, rgba(20,20,20,.11))`. Ajouter deux bandes d’ombre douce, chacune `58 px` de large, rotation `-11°`, opacité `.08`, à `left: 142 px` et `left: 244 px`. Aucun bokeh. Le vignettage est un pseudo-élément plein cadre, `box-shadow: inset 0 0 42px rgba(20,20,20,.12)`. Les silhouettes, le fantôme de planche et les chevrons sont dans une couche `z-index: 0`; la photo est `z-index: 1`; les textes et preuves sont `z-index: 2`. Aucune chaîne ne repose directement sur un motif à contraste variable.

**4. Type.** Le conteneur du héros porte `container-type: inline-size`. Le nom utilise `font-family: "Barlow Condensed", "Arial Narrow", sans-serif`, `font-weight: 800`, `line-height: .88`, `letter-spacing: -.025em`, `font-size: clamp(38px, 13.8cqw, 52px)`. Au-delà de `14` caractères, taille fixe `38 px` à 360 et `34 px` à 320, deux lignes maximum. Le dernier segment, extrait par `/[^ \-]+$/`, est enveloppé dans `.name-tail`, `display:inline-block; white-space:nowrap; color:#C8332A`; l’espace précédent est insécable afin de ne jamais laisser le segment accentué seul. « Bienvenue » utilise `"Caveat", cursive`, `700`, `26 px`, `#141414`, avec soulignement zigzag SVG `74×7 px`, trait `#C8332A`, épaisseur `2 px`. Les métadonnées sont en `"Inter", sans-serif`, `600`, `13 px/17 px`; le proof chip `11.5 px/14 px`; le label de badge `12 px/14 px`, capitales. Le wordmark « Shop+ » utilise `"Inter"`, `800`, `26 px`, le « + » `#C8332A`.

**5. Photo.** Le cadre est rectangulaire, `144×206 px`, placé `right: 12 px; top: 20 px`. Il comporte, de l’extérieur vers l’intérieur, un trait `2 px #141414`, un entre-filet `5 px #EFE9DC`, puis un trait `2 px #141414`; aucune bordure arrondie. La bande damier `18 px` est intégrée au bas du cadre sans recouvrir la zone visage. L’image est `object-fit: cover; object-position: 50% 26%`; ombre `8px 10px 0 rgba(20,20,20,.10)`. La colonne de texte fait `calc(100% - 168px)`, `min-height: 206 px`, `padding-left: 16 px`. Dans les mockups de handoff, un aplat gris `#B8B8B8` remplace la photo réelle et un anneau pointillé `2 px #C8332A`, diamètre `58 px`, indique la zone de visage. Si `cover` est absent, afficher le monogramme « B » dans le cadre avec damier et cible, sans réserver un vide.

**6. Preuve / pastille.** État **COMPLET** (`deliveredCount ≥ 1`) : à l’emplacement visuel des avatars et du faux « +1,2k », afficher un chip rectangulaire `138×34 px`, fond `#141414`, bord `1 px #141414`, ombre dure `3px 3px 0 #C8332A`, texte `#EFE9DC`, rayon `2 px`, libellé « `{N} ventes livrées par Séra` ». Si `reviewCount ≥ 3`, ajouter à droite ou en dessous un chip `82×26 px`, fond `#EFE9DC`, bord `1 px #141414`, étoile `#C8332A`, texte `#141414`, libellé « `{rating} · {N} avis` ». État **MINIMAL** (`deliveredCount = 0`) : badge « Nouvelle vendeuse » en planche noire `132×32 px`, coins `0`, ombre `3px 3px 0 #C8332A`, rotation `-1.5deg`, texte blanc avec « vendeuse » rouge. Règle d’honnêteté : les visages et le « +1,2k clientes satisfaites » des images sont **convertis** en preuve réelle ; preuve et badge ne sont jamais affichés ensemble.

**7. Rangée.** La bande de confiance mesure `74 px`, fond `#141414`, trois colonnes égales `1fr 1fr 1fr`, padding horizontal `12 px`. Chaque cercle fait `30 px`, fond `#EFE9DC`, bord `2 px #C8332A`, icône `16 px #141414`. Titres : `"Inter" 700`, `10.5 px/12.5 px`, `#EFE9DC`; sous-titres : `8.5 px/10.5 px`, `rgba(239,233,220,.72)`. Séparateurs verticaux `1 px`, hauteur `42 px`, `rgba(239,233,220,.28)`. La structure complète fait `56 px` app bar + `246 px` héros + `74 px` confiance = `376 px` à 360 ; à 320, `52 + 236 + 72 = 360 px`. Une bande de contenu de `52 px`, fond `#F6F1E7`, commence ensuite ; aucun décor du héros ne la chevauche.

**8. Écarts vs image.**
1. Les avatars et le nombre « +1,2k » deviennent une preuve serveur réelle basée sur `deliveredCount`.
2. « Nouvelle vendeuse » n’apparaît qu’à zéro vente livrée ; elle disparaît dès la première livraison.
3. Les textures de papier, reliefs et ombres de masque sont remplacés par gradients CSS, motifs répétitifs et SVG décoratifs.
4. Aucun masque cérémoniel précis n’est copié ; seuls damier, chevrons, cibles et contrastes géométriques sont conservés.
5. Les produits, sections « nouveautés » et pieds de page visibles dans l’image sont hors périmètre et doivent être recadrés.
6. Le nombre de chevrons et les détails de bijoux sont simplifiés à 320 px.
7. Les effets de lumière ne passent jamais derrière les chaînes courantes.

## 2. HARMATTAN — contre-jour de poussière

**1. Palette.** Le héros utilise `linear-gradient(180deg, #F7D6A6 0%, #EEB26F 44%, #DE8A52 100%)`. La barre d’application est `#F8DFC0`; icônes `#4E2C18`; wordmark « Shop » `#4E2C18`, « + » `#D96F24`; badge panier `#D96F24/#FFF7EA`. Le texte principal est `#4E2C18`; le dernier segment du nom est `#FFF7EA` avec `text-shadow: 0 2px 14px rgba(78,44,24,.28)`. Les textes secondaires sont `#5B341F`; métadonnées `#6A432C`. Le soleil est `#FFE7A8`; poussière `#FFF4D7`. La bande de confiance est `#4E2C18`; cercles `#F7D6A6`; icônes `#4E2C18`; page `#FFF8EE`. Les arcs de dunes utilisent `#D98547`, `#C86F3D` et `rgba(255,231,168,.55)`.

**2. Motif / décor.** Un disque solaire de `112 px` se place `right: 42 px; top: 22 px`, bord lumineux `2 px rgba(255,247,234,.85)`. Deux arcs de dunes sont des pseudo-éléments elliptiques de largeur `230 px` et `260 px`, hauteur `74 px` et `90 px`, placés `bottom: -42 px; left: -28 px` et `bottom: -54 px; right: -52 px`; ils sont coupés par `overflow:hidden`. Un sentier de vent pointillé, trait `2 px`, dash `5 7`, suit une courbe SVG de `170×70 px`, `left: -8 px; top: 112 px`, opacité `.50`. Deux acacias en silhouettes linéaires occupent `left: 4 px; bottom: 20 px`, largeur `82 px`, et `right: 10 px; bottom: 34 px`, largeur `46 px`, opacité `.32`. Deux calaos, traits `1.5 px`, largeur `32 px`, sont à `right: 18 px; top: 58 px`. Référence culturelle : saison sèche et lumière de Ouagadougou, sans transformer le décor en paysage touristique.

**3. Couche cinéma.** La lumière principale est un halo radial `radial-gradient(circle at 72% 18%, rgba(255,247,234,.95) 0 8%, rgba(255,231,168,.52) 26%, transparent 56%)`. Ajouter un contre-jour `linear-gradient(18deg, transparent 22%, rgba(255,247,234,.20) 43%, transparent 67%)`. Quatorze bokehs sont générés par radial gradients : diamètres `4, 6, 8, 10, 12, 14, 18 px`, opacités `.10–.28`, répartis hors des zones de texte. Une poussière fine est un motif de points `1 px` tous les `17 px`, opacité `.12`. Le vignettage chaud utilise `inset 0 0 52px rgba(92,48,23,.18)`. Toutes ces couches restent sous le texte et ne portent jamais de libellé.

**4. Type.** Nom en `"Cormorant Garamond", Georgia, serif`, `700`, `line-height:.86`, `letter-spacing:-.035em`, `font-size: clamp(36px, 13.2cqw, 50px)`. Au-delà de `14` caractères : `38 px` à 360, `34 px` à 320. Le dernier segment `/[^ \-]+$/` est `#FFF7EA`, `white-space:nowrap`, groupé avec l’espace précédent. « Bienvenue » en `"Fraunces", Georgia, serif`, italique `600`, `24 px`, `#A94F24`, souligné par une route pointillée de `88×2 px`, dash `4 5`. Métadonnées en `"Inter" 600`, `13 px/17 px`; preuve `11.5 px`; badge `12 px`. Wordmark « Shop+ » en `"Cormorant Garamond" 700`, `28 px`, « + » `#D96F24`.

**5. Photo.** Portrait circulaire de `132 px`, `right: 18 px; top: 18 px`, `border: 2px solid rgba(255,247,234,.88)`, halo extérieur `0 0 0 8px rgba(255,231,168,.24), 0 0 28px rgba(255,231,168,.54)`. Image `cover / 50% 24%`. Le disque solaire se trouve derrière, décalé de `10 px`, mais le visage reste lisible. Colonne de texte `calc(100% - 154px)`, `min-height: 210 px`, padding `16 px`. Placeholder de mockup : disque gris `#B9B1A6`, anneau visage pointillé `2 px #D96F24`, diamètre `58 px`. Sans photo, afficher un monogramme « B » brun au centre du halo, avec sentier de vent et poussière, sans zone vide.

**6. Preuve / pastille.** État **COMPLET** : capsule `150×38 px`, fond `rgba(255,247,234,.78)`, bord `1 px rgba(78,44,24,.22)`, texte `#4E2C18`, rayon `19 px`, ombre `0 8px 18px rgba(78,44,24,.12)`, libellé « `{N} ventes livrées par Séra` ». Évaluation : chip `88×26 px`, fond `rgba(78,44,24,.88)`, étoile `#FFE7A8`, texte `#FFF7EA`, seulement si `reviewCount ≥ 3`. État **MINIMAL** : tampon solaire circulaire `82 px`, bord pointillé `2 px #D96F24`, rayons `12×7 px` autour, fond `rgba(255,231,168,.76)`, texte `#A94F24`, rotation `2deg`. Les avatars et « +1,2k » sont remplacés par ces données réelles ; aucun cumul badge + preuve.

**7. Rangée.** Bande `74 px`, fond `#4E2C18`; cercles `30 px` remplis `#F7D6A6`, icônes `#4E2C18`, liseré `1 px rgba(255,231,168,.60)`. Titres `10.5 px/12.5 px`, `#FFF7EA`; sous-titres `8.5 px/10.5 px`, `rgba(247,214,166,.72)`. Séparateurs `rgba(247,214,166,.28)`. Structure : `56 + 246 + 74 = 376 px`; à 320 : `52 + 236 + 72 = 360 px`. Bande de contenu `52 px`, fond `#FFF8EE`, bord supérieur `1 px rgba(78,44,24,.08)`.

**8. Écarts vs image.**
1. Le faux volume de clientes devient le nombre réel de ventes livrées.
2. Le badge solaire est exclusif au compte sans historique.
3. La poussière, les rayons, le soleil et les dunes sont recréés sans image de fond ni blur.
4. Les silhouettes de monuments trop spécifiques sont supprimées ; seules silhouettes urbaines génériques et végétation linéaire subsistent.
5. Les produits visibles sous le héros sont hors périmètre.
6. Les bokehs sont limités à quatorze et exclus des zones de texte.
7. À 320 px, un seul acacia et un seul oiseau peuvent être conservés.

## 3. BALAFON — nuit de concert

**1. Palette.** Fond nuit `#2E1B2E` vers `#160D18` par `linear-gradient(180deg, #2E1B2E 0%, #211223 56%, #160D18 100%)`. Orchidée `#B886D9`, ambre clair `#E8B476`, bois sombre `#C98A3B`, crème `#FFF4DD`. Barre `#160D18`, icônes `#FFF4DD`, wordmark `#FFF4DD` avec « + » `#E8B476`, badge `#E8B476/#160D18`. Nom `#FFF4DD`, dernier segment `#E8B476`; secondaires `#E6D7E8`; métadonnées `#D3C3D7`. Bande de confiance `#160D18`; cercles bois `#C98A3B`; page `#FFF9F0`. Les projecteurs sont `rgba(184,134,217,.28)` et `rgba(232,180,118,.30)`.

**2. Motif / décor.** Trois touches de balafon occupent le pied du héros : largeur `92 px`, hauteur `34 px`, rayon `10 px`, rotations `-1deg`, `0deg`, `1deg`, positions `left: 8 px`, `left: 104 px`, `left: 200 px`, `bottom: 4 px`. Leur gradient est `linear-gradient(180deg,#E8B476,#C98A3B)`, highlight supérieur `1 px rgba(255,244,221,.55)`, ombre `0 7px 0 #8F5D2B`. Trois résonateurs circulaires en contour ambre, diamètre `58 px`, apparaissent sous les touches, `bottom:-24 px`, opacité `.65`. Une portée musicale SVG `172×54 px`, dash `3 6`, est placée `left: 14 px; bottom: 66 px`; deux notes `18 px` et `22 px`, couleurs orchidée/ambre. Référence culturelle : instrument et rythme, pas copie d’un instrument rituel précis.

**3. Couche cinéma.** Deux cônes de projecteur partent de `top:-18 px`: cône orchidée à `left: 22 px`, angle `18deg`, `clip-path: polygon(40% 0,60% 0,100% 100%,0 100%)`, largeur `90 px`, hauteur `180 px`; cône ambre à `right: 8 px`, angle `-18deg`, même géométrie. Un glow de scène monte du bas : `radial-gradient(ellipse at 50% 100%, rgba(232,180,118,.28), transparent 62%)`. Douze bokehs, `5–18 px`, opacité `.08–.24`, restent dans le tiers supérieur et autour du portrait. Vignettage `rgba(9,4,10,.24)`, `inset 0 0 54px`. Les cônes sont coupés avant les blocs de texte par masques de clip et ne servent jamais de fond direct à une chaîne.

**4. Type.** Nom en `"Sora", "Inter", sans-serif`, `800`, `line-height:.90`, `letter-spacing:-.045em`, `font-size: clamp(34px, 12.8cqw, 48px)`. Au-delà de `14` caractères : `36 px` à 360, `33 px` à 320. Dernier segment `#E8B476`, nowrap, espace précédent insécable. « Bienvenue » en `"Cormorant Garamond", serif`, italique `600`, `25 px`, `#B886D9`, avec deux losanges `6 px` et une ligne `44 px` de part et d’autre. Métadonnées `"Inter" 600`, `13 px/17 px`. Preuve `11.5 px`; badge bois `12 px/14 px`. Wordmark `"Sora" 800`, `26 px`, « + » ambre.

**5. Photo.** Cercle `126 px`, `right: 16 px; top: 34 px`. Anneaux : `4 px #E8B476`, gap `4 px #2E1B2E`, trait `2 px #B886D9`; ombre `0 0 24px rgba(184,134,217,.22)`. Une note `18 px` repose à `right:-4 px; top:16 px`. Image `cover / 50% 24%`. Colonne de texte `calc(100% - 150px)`, `min-height: 200 px`, padding `16 px`. Placeholder : cercle gris `#9C949D`, anneau visage pointillé orchidée `2 px`, diamètre `56 px`. Sans photo, monogramme « B » ambre sur fond plum, entouré du cadre-tambour et de deux notes.

**6. Preuve / pastille.** **COMPLET** : capsule `152×40 px`, fond `rgba(22,13,24,.78)`, bord `1 px rgba(232,180,118,.55)`, rayon `20 px`, texte crème, compteur ambre, ombre `0 10px 20px rgba(9,4,10,.22)`. Le chip de note `86×26 px` est orchidée sombre `#56375F`, étoile ambre, texte crème, visible avec `reviewCount ≥ 3`. **MINIMAL** : petite touche de balafon `124×34 px`, gradient bois, deux œillets cordés `5 px` aux extrémités, rotation `-3deg`, texte `#2E1B2E`. Les avatars et « +1,2k » des visuels sont remplacés par « `{N} ventes livrées par Séra` » ; badge et preuve s’excluent.

**7. Rangée.** Bande `72 px`, fond `#160D18`; cercles radiaux bois `30 px`, `radial-gradient(circle,#E8B476 0 34%,#C98A3B 35% 70%,#6E431F 71%)`, pictogrammes `#160D18`. Titres `10.5 px/12.5 px`, `#FFF4DD`; sous-titres `8.5 px/10.5 px`, `rgba(232,215,232,.70)`. Séparateurs orchidée `.28`, hauteur `40 px`. Structure `56 + 248 + 72 = 376 px`; à 320 `52 + 236 + 72 = 360 px`. Bande de contenu `52 px`, fond `#FFF9F0`, aucune note ou touche ne la chevauche.

**8. Écarts vs image.**
1. La preuve sociale fictive devient une donnée de ventes livrées.
2. Le badge bois disparaît dès `deliveredCount ≥ 1`.
3. Les matières bois sont gradients CSS et veinures SVG, jamais textures raster.
4. Les projecteurs et bokehs sont gradients sans blur.
5. Les touches décoratives sont limitées à trois et n’empiètent pas sur la confiance.
6. Les produits et instruments visibles plus bas sont hors périmètre.
7. À 320 px, la portée est raccourcie à `130 px` et une note est supprimée.

## 4. SÉANCE — grand écran de Ouaga

**1. Palette.** Fond `linear-gradient(180deg,#171226 0%,#100B1D 65%,#0D0916 100%)`. Or de marquise `#E8B84B`, violet lavande `#B89AE8`, blanc écran `#FFF9EC`, texte secondaire `#DDD3EA`, métadonnées `#C8BCD8`. Barre `#0D0916`, icônes `#FFFFFF`, wordmark `#FFFFFF` avec « + » `#E8B84B`, badge panier `#E8B84B/#171226`. Film `#110D18`, perforations `#F4F0E8`. Bande confiance `#0D0916`; cercles `#2B2041`; icônes `#E8B84B`; page `#FBF7F0`. Faisceau or `rgba(232,184,75,.42)`, contre-faisceau `rgba(184,154,232,.18)`, grain `rgba(255,255,255,.05)`.

**2. Motif / décor.** Le cadre photo 35 mm mesure `142×206 px`, `right: 12 px; top: 18 px`; deux colonnes de perforations font `10 px` de large, trous `7×10 px`, pas vertical `16 px`. Une rangée de huit ampoules `6 px` sous le nom est espacée de `12 px`, avec glow `0 0 7px rgba(232,184,75,.65)`. Un filigrane de bobine `74 px`, trait `1.5 px #B89AE8`, opacité `.12`, est `right: -12 px; top: 8 px`. Une skyline générique de Ouagadougou, hauteur `28 px`, est posée `bottom: 0`, remplissage `#0A0710`, sans monument reproduit fidèlement. Trois étoiles `3–5 px` sont placées dans les coins libres.

**3. Couche cinéma.** Le projecteur est un cône polygonal `width:230 px; height:170 px; left:-48 px; top:18 px; transform:rotate(10deg)`, `background:linear-gradient(90deg,rgba(232,184,75,.52),rgba(232,184,75,.08))`, `clip-path:polygon(0 42%,100% 0,100% 100%,0 58%)`. Le contre-faisceau lavande part de `right:-20 px; top:4 px`, `width:160 px`, rotation `-15deg`, opacité `.18`. Vingt points de poussière `1–3 px`, opacité `.12–.32`, sont confinés à l’intérieur du faisceau principal. Grain film : motif `1 px` tous les `9 px`, opacité `.05`. Vignette `inset 0 0 60px rgba(0,0,0,.26)`. Toutes les couches lumineuses sont sous le nom et ne traversent pas le fond opaque des métadonnées.

**4. Type.** Nom `"Archivo Black", "Inter", sans-serif`, `400`, `line-height:.90`, `letter-spacing:-.045em`, `font-size: clamp(34px, 12.4cqw, 46px)`. Au-delà de `14` caractères : `35 px` à 360, `32 px` à 320. Dernier segment `#E8B84B`, nowrap et lié à l’espace précédent. Option marquise sur le dernier segment : `text-shadow:0 0 10px rgba(232,184,75,.32)`, mais pas de vraies ampoules dans les glyphes en production. « Bienvenue » `"Cormorant Garamond"`, italique `600`, `25 px`, `#B89AE8`. Métadonnées `"Inter" 600`, `13 px`. Proof `11.5 px`; ticket `12 px`, capitales contrôlées. Wordmark `"Inter" 800`, `26 px`.

**5. Photo.** Frame `142×206 px`, fond `#110D18`, perforations latérales, trait interne `1 px rgba(255,249,236,.20)`. Photo intérieure `112×190 px`, `object-fit:cover; object-position:50% 24%`. Ombre `0 14px 28px rgba(0,0,0,.28)`. Colonne texte `calc(100% - 166px)`, `min-height:206 px`, padding `16 px`. Placeholder : rectangle gris `#8D8992`, zone visage pointillée `2 px #E8B84B`, ovale `54×66 px`. Sans photo : monogramme « B » or sur « écran » ivoire, grain film et perforations conservés.

**6. Preuve / pastille.** **COMPLET** : ticket stub `146×38 px`, fond `#B89AE8`, texte `#171226`, encoches latérales via `mask` ou pseudo-cercles `8 px`, bord `1 px rgba(255,255,255,.25)`, rotation `0deg`. Libellé « `{N} ventes livrées par Séra` ». Note : ticket secondaire `88×26 px`, fond `#2B2041`, étoile or, texte ivoire, visible si `reviewCount ≥ 3`. **MINIMAL** : ticket cinéma or `122×42 px`, fond `#E8B84B`, texte `#171226`, rotation `-4deg`, encoches `8 px`, petite bobine SVG `14 px`. Les avatars et faux volume sont remplacés par la preuve réelle ; aucun badge avec preuve.

**7. Rangée.** Bande `74 px`, fond `#0D0916`; cercles `30 px`, fond `#2B2041`, bord `1 px rgba(232,184,75,.55)`, icône `#E8B84B`. Titres `10.5 px/12.5 px` ivoire ; sous-titres `8.5 px/10.5 px` lavande à `.72`. Séparateurs `rgba(184,154,232,.30)`. Structure `56 + 246 + 74 = 376 px`; à 320 `52 + 236 + 72 = 360 px`. Bande contenu `52 px`, `#FBF7F0`, bord supérieur `1 px rgba(23,18,38,.08)`.

**8. Écarts vs image.**
1. Les faux avis deviennent des comptes réels.
2. Le ticket « Nouvelle vendeuse » est strictement réservé à zéro vente.
3. Le projecteur, grain, perforations et ampoules sont CSS/SVG.
4. Les silhouettes urbaines sont génériques ; pas de monument potentiellement incorrect.
5. Les ampoules ne sont pas intégrées aux lettres pour préserver accessibilité et rendu de police.
6. Les sections produits visibles sous la scène sont recadrées.
7. À 320 px, la bobine filigrane et deux ampoules peuvent être supprimées.

## 5. CAURIS — lagune & coquillages porte-bonheur

**1. Palette.** Fond `linear-gradient(180deg,#145248 0%,#0F493F 56%,#0E3E36 100%)`. Menthe `#C8F0DE`, sable doré `#D9B87A`, coquille `#FFF7E8`, ombre nacrée `#D8CCB7`, texte principal `#FFF7E8`, dernier segment `#D9B87A`, secondaires `#C8F0DE`, métadonnées `#B7DACB`. Barre `#FFF9EF`, icônes `#145248`, wordmark `#145248`, « + » `#D9B87A`, badge panier `#145248/#FFF9EF`. Bande de confiance `#0E3E36`, cercles `#D9B87A`, icônes `#0E3E36`, page `#FBF7EC`. Rayons `rgba(200,240,222,.22)`; caustiques `rgba(255,247,232,.12)`.

**2. Motif / décor.** Quatre cauris dessinés en SVG : ovale `30×18 px`, remplissage `#FFF7E8`, ombre interne `#D8CCB7`, fente pointillée centrale `#8A7155`, positions `left:8 px; top:18 px`, `right:10 px; top:84 px`, `right:24 px; bottom:62 px`, `left:6 px; bottom:92 px`, rotations `-18°, 14°, 28°, -8°`. Trois anneaux de vague répétés, diamètres `88, 106, 124 px`, trait `1.5 px rgba(200,240,222,.22)`, pas radial `18 px`, centrés derrière la photo. Quatre bulles `6,8,10,12 px` montent sur l’axe `right:18 px`, espacement `22 px`. Un banc de sable est un arc elliptique `420×92 px`, `left:-28 px; bottom:-54 px`, gradient `#D9B87A→#B99459`, rotation `-3deg`. Aucun coquillage sous un texte.

**3. Couche cinéma.** Trois god-rays obliques partent de `top:-16 px`, angle `17deg`, largeurs `44, 58, 72 px`, opacités `.10, .16, .08`, coupés par `clip-path`. Une caustique est un motif de radial gradients elliptiques `26×12 px`, pas `42×34 px`, opacité `.08`. Un glow plongeant `radial-gradient(ellipse at 62% 16%,rgba(200,240,222,.24),transparent 58%)`. Vignette `inset 0 0 56px rgba(3,33,29,.22)`. Les bulles et rayons restent dans les marges et derrière la photo ; aucun texte n’est posé sur une caustique mobile ou trop contrastée.

**4. Type.** Nom `"Sora", "Inter", sans-serif`, `800`, `line-height:.90`, `letter-spacing:-.04em`, `font-size: clamp(36px, 13cqw, 49px)`. Au-delà de `14` caractères : `37 px` à 360, `33 px` à 320. Le dernier segment `#D9B87A`, nowrap et groupé avec l’espace précédent. « Bienvenue » `"Cormorant Garamond"`, italique `600`, `25 px`, `#C8F0DE`, avec dash pinceau `72×4 px` sable. Métadonnées `"Inter" 600`, `13 px/17 px`. Proof `11.5 px`; badge sur cauri `12 px/14 px`. Wordmark `"Cormorant Garamond" 700`, `28 px`, « + » sable.

**5. Photo.** Ovale de type cauri `132×202 px`, `right:14 px; top:22 px`, rayon `50% / 42%`. Bord principal `5 px #FFF7E8`, ombre interne `0 0 0 2px #D8CCB7`, anneau pointillé externe `2 px #C8F0DE`, dash `6 7`, offset `7 px`. Photo `cover / 50% 24%`. Ombre `0 14px 28px rgba(3,33,29,.22)`. Colonne texte `calc(100% - 156px)`, `min-height:204 px`, padding `16 px`. Placeholder : ovale gris `#9EA9A3`, zone visage pointillée sable `2 px`, ovale `54×66 px`. Sans photo : monogramme « B » sable dans un ovale coquille, avec anneaux de vague.

**6. Preuve / pastille.** **COMPLET** : capsule `152×40 px`, fond `rgba(14,62,54,.88)`, bord `1 px rgba(217,184,122,.70)`, texte coquille, compteur sable, rayon `20 px`, ombre `0 8px 18px rgba(3,33,29,.20)`. Rating `88×26 px`, fond `#FFF7E8`, étoile `#D9B87A`, texte `#145248`, visible si `reviewCount ≥ 3`. **MINIMAL** : grand cauri incliné `122×56 px`, rotation `8deg`, remplissage coquille, ombre interne nacrée, fente pointillée, texte `#145248` sur deux lignes. Les avatars et « +1,2k » deviennent « `{N} ventes livrées par Séra` » ; preuve et badge ne coexistent jamais.

**7. Rangée.** Bande `72 px`, fond `#0E3E36`; cercles `30 px`, fond `#D9B87A`, pictogrammes `#0E3E36`, anneau `1 px rgba(255,247,232,.35)`. Titres `10.5 px/12.5 px`, coquille ; sous-titres `8.5 px/10.5 px`, menthe à `.72`. Séparateurs `rgba(200,240,222,.26)`. Structure `56 + 248 + 72 = 376 px`; à 320 `52 + 236 + 72 = 360 px`. Bande contenu `52 px`, fond `#FBF7EC`; l’arc sable s’arrête au pixel précédent.

**8. Écarts vs image.**
1. Les faux avatars et « +1,2k » deviennent des ventes livrées réelles.
2. Le cauri « Nouvelle vendeuse » n’existe qu’à zéro historique.
3. Les coquillages, caustiques et rayons sont SVG/gradients, pas des images runtime.
4. Les bijoux cauris portés par la vendeuse appartiennent à la photo et ne sont pas exigés.
5. Les sections de bijoux sous le héros sont hors périmètre.
6. À 320 px, deux petits cauris décoratifs et une bulle sont supprimés.
7. Le banc de sable ne dépasse jamais dans la preuve ni dans la bande de confiance.

# PARTIE B — RÈGLES COMMUNES + QA

## Architecture et périmètre

Chaque variante est un composant mobile web statique composé de quatre zones successives :

1. **App bar** : `56 px` à 360, `52 px` à 320.
2. **Hero** : `246–248 px` à 360 selon le style ; `236 px` à 320.
3. **Trust strip** : `72–74 px`.
4. **Bande de raccord page** : `52 px`, couleur de page, sans décor du héros.

Le « header » fonctionnel se termine après la trust strip : `376 px` à 360 et `360 px` à 320. La bande de `52 px` appartient au corps de page et sert de raccord visuel ; elle est incluse dans la maquette de handoff uniquement pour vérifier la coupure. Produits, carrousels, catégories, footer et navigation basse sont hors périmètre.

## Données & seuils

Contrat de données minimal :

```ts
type StorefrontHeaderData = {
  name: string;             // 3–24 caractères
  tagline?: string;         // optionnelle, 0–56 caractères
  zone: string;             // ex. "Gounghin, Ouagadougou"
  avatar?: string;          // portrait vendeur
  cover?: string;           // optionnel ; non requis pour ces variantes
  deliveredCount: number;   // entier >= 0
  rating?: number;          // 0–5
  reviewCount: number;      // entier >= 0
};
```

Règles d’affichage :

- `deliveredCount >= 1` → état **COMPLET**, afficher « `{N} ventes livrées par Séra` ».
- `reviewCount >= 3` et `rating` valide → afficher « `{rating} · {N} avis` » avec étoile.
- `deliveredCount === 0` → état **MINIMAL**, afficher uniquement « Nouvelle vendeuse ».
- La preuve et « Nouvelle vendeuse » sont mutuellement exclusives.
- La logique peut être rendue côté serveur ou au build ; aucun JavaScript client n’est requis.
- Les nombres utilisent `Intl.NumberFormat("fr-FR")` côté serveur. Un seul espace insécable précède les unités.
- Si `avatar` et `cover` sont absents, le cadre photo devient un fallback de style avec monogramme ; il ne reste jamais vide.

## Casse, longueur et anti-orphelin

Tous les héros portent `container-type:inline-size`. Le nom est normalisé par `trim()` et les espaces multiples sont réduits à un espace. Le dernier segment est identifié par `/[^ \-]+$/`. Il est enveloppé dans `.name-tail` avec `display:inline-block; white-space:nowrap`; l’espace qui le précède devient `&nbsp;`. Le parent utilise `text-wrap:balance`, `overflow-wrap:normal`, `hyphens:none`, deux lignes maximum. Si le nom ne contient qu’un segment, ce segment entier reçoit l’accent.

Tailles par style :

| Style | `clamp()` normal | Taille fixe si `name.length > 14` à 360 | Taille fixe à 320 |
|---|---:|---:|---:|
| MASQUE | `clamp(38px, 13.8cqw, 52px)` | `38px` | `34px` |
| HARMATTAN | `clamp(36px, 13.2cqw, 50px)` | `38px` | `34px` |
| BALAFON | `clamp(34px, 12.8cqw, 48px)` | `36px` | `33px` |
| SÉANCE | `clamp(34px, 12.4cqw, 46px)` | `35px` | `32px` |
| CAURIS | `clamp(36px, 13cqw, 49px)` | `37px` | `33px` |

À tester obligatoirement avec un nom de `24` caractères et une zone longue : « Secteur 30, Bobo-Dioulasso ». La zone utilise `font-size:13px`, `line-height:17px`, `max-width` égal à la colonne de texte et deux lignes maximum. Aucun segment accentué ne doit se retrouver seul sur une troisième ligne ; si nécessaire, réduire la taille au fallback fixe avant tout wrap supplémentaire.

## Photo et fallback de handoff

Dans les planches de développement, la photo est représentée par un gris neutre et la zone de visage par un anneau pointillé. Ce code graphique signifie :

- **gris** = emplacement de la vraie photo vendeur ;
- **anneau pointillé** = zone de visage à conserver ;
- `object-fit:cover` ;
- `object-position` défini dans chaque relevé ;
- aucun texte embarqué dans l’image ;
- si l’image manque, remplacer par le monogramme « B » et le motif culturel abstrait du style.

Le portrait vendeur est la seule image runtime autorisée dans l’en-tête. Les textures et décors ne sont jamais chargés comme images de fond.

## Chaînes exactes

Les chaînes suivantes sont immuables, accents et capitalisation compris :

- « Vendeuse vérifiée · {zone} » lorsque le style utilise une ligne combinée.
- « Vendeuse vérifiée » puis « {zone} » sur deux lignes lorsque le style le prévoit.
- « {N} ventes livrées par Séra »
- « Nouvelle vendeuse »
- « {rating} · {N} avis »
- « Livraison Séra vérifiée & scellée »
- « Paiement protégé »
- « Les meilleurs prix garantis »
- « Bienvenue »
- « Shop+ »

Ne jamais écrire « clientes satisfaites », « communauté », « personnes ont acheté », ni afficher des visages clients sans source réelle. Les quatre portraits visibles dans les maquettes sont des artefacts de concept et ne sont pas implémentés.

## Textures → CSS / SVG

Toutes les matières décoratives doivent être reconstruites en CSS ou SVG décoratif inline :

- murs/papier : `linear-gradient`, `radial-gradient`, motifs de points ;
- poussière : petits radial gradients ;
- bois : gradient vertical + 2–3 chemins SVG de veinure à faible opacité ;
- faisceaux : pseudo-éléments polygonaux avec `clip-path`;
- damiers/chevrons : `repeating-linear-gradient` ou SVG répétitif ;
- coquilles : SVG simple, sans photo ;
- dunes, skyline et banc de sable : pseudo-éléments ou SVG plats ;
- perforations de film : `repeating-linear-gradient` ou masque CSS.

Interdits : images runtime pour textures, `backdrop-filter`, `filter: blur()`, canvas, shaders, vidéos et animations. Le bokeh est exclusivement constitué de radial gradients nets à faible opacité. Les SVG décoratifs sont `aria-hidden="true"` et `pointer-events:none`.

## Performance, accessibilité et toucher

- Aucun JavaScript client pour la mise en page, les effets ou l’animation.
- Aucune animation ; les rotations sont statiques.
- Les liens et boutons ont une cible minimale de `44×44 px`.
- Contraste WCAG AA pour toute chaîne informative.
- Le badge panier expose un libellé accessible, par exemple « 3 articles dans le panier ».
- Les pictogrammes ont un `aria-label` sur les contrôles, mais les icônes purement décoratives sont masquées aux technologies d’assistance.
- Le header complet doit rester sous `80 KB` de CSS + SVG non compressé, hors photo vendeur.
- La photo doit être servie en AVIF/WebP, largeur source recommandée `480 px`, `loading="eager"` seulement si elle est LCP, `decoding="async"`.
- Aucun décor ne doit intercepter les taps.

## Breakpoint 320 px

À `max-width: 339px` :

- app bar `52 px`;
- hero `236 px`;
- trust strip `72 px`;
- padding latéral réduit de `16 px` à `12 px`;
- cadre photo réduit de `6–10 px` selon le style ;
- icônes trust `26 px`;
- titres trust `9.7 px/11.5 px`;
- sous-titres `8 px/9.5 px`;
- suppression autorisée de 20–35 % des petits décors ;
- aucune suppression des chaînes exactes, du nom, de la zone, de la preuve ou du badge valide ;
- aucun espace réservé pour un élément caché.

## QA — checklist normative

1. Tester les états **COMPLET** et **MINIMAL** à `360×800` et `320×800`. Aucun espace vide ne reste après bascule d’état. Si la photo manque, afficher immédiatement le motif MINIMAL + monogramme dans le cadre.
2. Tester un nom de `24` caractères et « Secteur 30, Bobo-Dioulasso ». Aucun overflow horizontal ou vertical ; le dernier segment accentué reste nowrap et n’est jamais orphelin.
3. Vérifier qu’un header n’affiche jamais simultanément « Nouvelle vendeuse » et « `{N} ventes livrées par Séra` ».
4. Vérifier que « `{rating} · {N} avis` » n’apparaît pas pour `reviewCount < 3`.
5. Vérifier que la preuve n’utilise aucun avatar client fictif ni volume inventé.
6. Vérifier que les couches décoratives et cinéma sont toujours sous les textes courants ; aucun faisceau, motif, cauri, chevron ou bokeh ne traverse une chaîne.
7. Vérifier que les vignettes assombrissent seulement les bords et ne réduisent pas le contraste au centre.
8. Vérifier que les formes de pied — dunes, skyline, touches, frises, banc de sable — ne couvrent ni preuve, ni badge, ni trust strip.
9. Vérifier les trois libellés de confiance mot pour mot et leur lisibilité en trois colonnes à 320 px.
10. Vérifier des cibles tactiles de `44 px` minimum pour hamburger, recherche, panier et tout contrôle de header.
11. Vérifier qu’aucun `backdrop-filter`, blur, animation, vidéo, texture raster runtime ou JavaScript de présentation n’est chargé.
12. Vérifier le fallback sans photo pour les cinq styles et l’absence de saut de mise en page.
13. Vérifier que le héros + app bar + trust strip mesure exactement `376 px` à 360 et `360 px` à 320.
14. Vérifier que la bande de raccord de `52 px` utilise la couleur de page propre au style et qu’aucun décor du héros ne la chevauche.
15. Vérifier à zoom navigateur `200 %` que l’information reste accessible, sans texte coupé ni contrôle inaccessible.
16. Vérifier que les motifs culturels restent abstraits, respectueux et non présentés comme reproduction d’un objet cérémoniel authentique.

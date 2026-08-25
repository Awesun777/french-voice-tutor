# ChatGPT image prompt — TCF Tâche 2 sheet

> **REPLACE THIS FILE with the prompt wording that was tested by hand.** What
> follows is a reconstruction derived from the official `EO001IRN_demo` sheet,
> not the tested wording. Everything else in the skill reads the template from
> here, so swapping this file is the only change needed.

Always attach `client/public/tcf/task2-sujet1-logement.png` as the **style
reference** in the same message. It is the real official sheet; never use a
previously generated sheet as the reference, or style drift compounds.

## Template

Placeholders in `{{…}}` are filled per sujet. Send everything below the line.

---

Voici une fiche d'examen officielle du TCF Canada (expression orale, tâche 2).
Reproduis-la **exactement** : même mise en page, même typographie, même
traitement visuel, même densité. Seul le contenu change.

À conserver à l'identique :
- Page portrait blanche, marges larges, aucun cadre ni bordure de page.
- En haut à droite, en petit et en gras : `{{REFERENCE_CODE}}`
- Titre en gros caractères gras à gauche : `{{TITRE}}`
- Sous le titre, un bandeau gris clair pleine largeur contenant la consigne en
  texte noir régulier : `{{CONSIGNE}}`
- Trois photographies **en noir et blanc**, style documentaire réaliste, sans
  personnes au premier plan, sans texte ni logo incrusté dans les images.
- Disposition : deux photos côte à côte sur la première rangée, puis une photo
  large centrée en dessous.
- Sous chaque photo, sa légende alignée à gauche du bord gauche de la photo, en
  texte noir régulier, sur deux ou trois lignes courtes.

Contenu des trois photos et de leurs légendes :

1. Photo : {{PHOTO_1}}
   Légende :
   {{LEGENDE_1}}

2. Photo : {{PHOTO_2}}
   Légende :
   {{LEGENDE_2}}

3. Photo (large, centrée) : {{PHOTO_3}}
   Légende :
   {{LEGENDE_3}}

Contraintes impératives :
- Tout le texte est en **français**, reproduit **mot pour mot** tel qu'il est
  écrit ci-dessus. N'ajoute, ne retire et ne reformule aucun mot.
- Respecte les accents, les apostrophes typographiques et le symbole `m²`.
- N'ajoute aucun élément qui ne figure pas sur la fiche de référence : pas de
  numéro de page, pas de logo, pas de filigrane, pas de pied de page.
- Rends une seule image, au même format que la référence.

---

## Fill rules

| Placeholder | Value |
| --- | --- |
| `{{REFERENCE_CODE}}` | `EO00<N>IRN_demo`, `<N>` = the sujet's number |
| `{{TITRE}}` | `Tâche 2 - Sujet <N>` — hyphen with spaces, as on the reference |
| `{{CONSIGNE}}` | the sujet's `consigne`, verbatim |
| `{{PHOTO_n}}` | one English sentence describing the shot, for the image model |
| `{{LEGENDE_n}}` | the caption lines, verbatim, newline-separated |

`{{TITRE}}` uses a plain hyphen (`Tâche 2 - Sujet 1`) because that is what the
official sheet prints. The `label` stored in `tcfSujets.ts` uses an em dash
(`Tâche 2 — Sujet 1`) to match the surrounding TypeScript. Both are correct in
their own place; do not unify them.

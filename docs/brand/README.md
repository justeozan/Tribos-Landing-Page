# Marque Tribos — ce que toutes les DA partagent

> **Copie.** La source de vérité est le dépôt de l'app (`justeozan/Tribos`,
> `docs/brand/` et `.claude/skills/tribos-da-*`). Modifier là-bas, puis recopier
> ici les deux dossiers à l'identique, pour que l'app et le site ne divergent pas.

Tribos a plusieurs **presets de direction artistique**. Ils partagent la
mascotte et la palette ; ils ne partagent pas le rendu.

| Preset | Skill | Pour quoi |
|---|---|---|
| **Minimalist Premium Dark** | `.claude/skills/tribos-da-minimal-dark/` | Marque sport-tech : fond noir, lumière orange géométrique, renard en mouvement, interface épurée |
| **Cinematic 3D** | `.claude/skills/tribos-da-3d-cinematique/` | Grands visuels marketing en plein air : montagne au coucher de soleil |
| **Illustrated Comic** | `.claude/skills/tribos-da-bd-cinematique/` | Illustrations BD : fonctionnalités, exercices, scènes de groupe, états vides |

Règle : **un seul preset par support**. Une page, une fiche ou une campagne ne
mélange pas deux rendus.

## Le renard canonique

Source unique pour tous les presets. Référence actuelle :
[`mascotte/renard-canonique-debout.png`](mascotte/renard-canonique-debout.png)
(maquette IA fournie le 2026-10-12, droits à confirmer). Ajouter dans
[`mascotte/`](mascotte/) des vues de profil et de dos quand elles existent : **à joindre à chaque génération**, quel que soit le
preset. Un prompt seul ne garde pas les traits du visage, les proportions et
la tenue.

- Fourrure orange ; joues, museau, poitrail et bout de la queue crème.
- Grandes oreilles pointues, intérieur rose chaud.
- Yeux brun foncé, expressifs.
- Queue touffue, reconnaissable.
- Débardeur de sport **pétrole / teal**, short sombre (bleu marine).
- Bandeau blanc quand la scène s'y prête ; chaussures de running noires ;
  petit sac à dos noir en extérieur ou en option.
- Personnalité : confiant, amical, déterminé, un peu joueur. Un compagnon,
  pas un influenceur fitness.

On adapte la pose et l'expression à la scène ; **on ne redessine jamais le
personnage**. Le rendu (3D d'animation ou BD peinte) dépend du preset.

À ne pas confondre :
- le **logo** (renard blanc stylisé de l'icône et du splash) : c'est un
  symbole, pas la mascotte illustrée ;
- `assets/mascotte/loup.png` (dépôt de l'app) : ancienne mascotte de l'app (loup gris,
  débardeur jaune), **hors charte** — ne pas s'en inspirer.

## Palette

| Rôle | Valeur | Remarque |
|---|---|---|
| Orange de l'interface | `#F3730A` | `AppTheme.primary`, fait foi pour l'UI |
| Orange des illustrations | `#FF721C` (Dark) · `#F87824` (3D) · `#FF791F` (BD) | à harmoniser, même famille |
| Ambre (lumière) | `#FF9A43` | rim light, faisceaux |
| Noir / anthracite | `#0B0C0E` · `#17191D` | fonds du preset Dark |
| Terre cuite / cuivre | `#D94F16` | profondeur chaude |
| Crème | `#FFF0DC` · `#FDF4EA` (UI) | lumière, fonds clairs |
| Bleu nuit | `#18242B` | ombres, contraste |
| Pétrole | `#237F7A` · `#176E6B` | accent, tenue du renard |

## Mascotte : ce qu'on ne fait pas

- La mettre partout. Le sujet, c'est le sport collectif ; le renard est un
  repère de marque.
- Générer du texte, des boutons ou des logos dans une image : l'interface se
  fait en HTML/CSS ou en Flutter.

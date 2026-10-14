# Tribos, site vitrine : consignes pour les agents

- **Design fixé.** Avant toute modification visuelle (section, page, couleur,
  police, image, animation, libellé), lire
  `.claude/skills/tribos-site-design-system/SKILL.md`. On fait évoluer ce
  système, on ne refait pas le site de zéro. Palette, police, hero et logo ne
  changent qu'avec l'accord de l'utilisateur.
- **Site statique** : HTML, CSS et JS écrits à la main, aucune dépendance,
  aucun build. En local : `node tools/dev-server.mjs 8000`. Détails dans le
  `README.md`.
- **CSP** : le script inline du `<head>` est identique octet pour octet sur
  toutes les pages ; son empreinte sha256 est dans `netlify.toml`.
- **Images** : jamais retouchées à la main. `tools/build-cine.py` (visuels 3D),
  `tools/build-ios.py` (captures iOS, avatars et icônes des widgets),
  `tools/build-assets.py` (icônes, logo), `tools/build-og.mjs` (carte sociale).
- **Widgets de l'app** (`.appui`) : reconstruits depuis le code de l'app, dans
  ses polices (Montserrat, Roboto), et comparés à la capture App Store. Jamais
  une interprétation libre.
- **Textes** : tutoiement, apostrophe ’, espace fine `&#8239;` avant ; : ! ?,
  aucun tiret cadratin, aucun chiffre ni témoignage inventé. Toute affirmation
  sur le produit se vérifie dans l'app. Les apps de sport restent annoncées
  « Bientôt » tant que l'app n'en lit aucune ; aucun logo de salle partenaire
  sans partenariat signé.
- **Commits** : auteur `Ozan S. <117074595+justeozan@users.noreply.github.com>`,
  sans ligne `Co-Authored-By` (Vercel refuse sinon le déploiement).
- **Marque** : directions artistiques et renard canonique dans `docs/brand/` et
  `.claude/skills/tribos-da-*` (copies du dépôt de l'app, qui fait foi).

# Tribos - site vitrine

Site marketing de **Tribos**, l’application de sport en groupe : un programme
commun, une séance par jour, un classement de groupe. L’objectif unique du site
est la collecte d’adresses e-mail pour la bêta privée.

C’est un site **statique**, en français : HTML, CSS et JavaScript écrits à la
main, aucune dépendance, aucun bundler, aucune étape de build. Il est déployé
sur **Netlify**, qui publie la racine du dépôt telle quelle.

Rien n’est chargé depuis un service tiers : polices, icônes, images, CSS et JS
sont tous auto-hébergés. Le site ne pose aucun cookie et n’embarque aucun
traceur.

---

## Direction artistique

Depuis le 14 octobre 2026, tout le site suit le preset **Cinematic 3D**
(`.claude/skills/tribos-da-3d-cinematique/`, voir aussi `docs/brand/`) : une
interface bleu nuit posée sur des paysages de montagne au coucher du soleil,
avec le renard canonique en 3D d’animation. Un seul preset sur tout le site :
pas de photo, pas d’illustration BD, pas de dégradé orange plein écran.

Trois règles tenues dans le code :

- **L’image et l’interface sont deux couches.** Les visuels (`assets/cine/`)
  ne portent aucun texte ; titres, formulaires et boutons sont du HTML posé
  dessus (composant `.scene` dans `tribos.css`).
- **Le texte ne passe jamais sur le renard.** Sur le hero, la copie occupe le
  tiers gauche, dans l’ombre de l’image ; ailleurs (fin de page, entreprises,
  merci, 404), le plan passe seul en bandeau (`.scene-band`) et le titre suit
  sur la nuit.
- **Le voile sombre n’existe que pour la lisibilité**, et il est mesuré : tout
  texte posé sur l’image passe le contraste AA de 1024 à 2560 px de large.

Palette et typographie : nuit `#0A1014` / bleu nuit `#18242B`, ivoire
`#FFF6EC`, orange de l’interface `#F3730A` (jamais sous du texte blanc), ambre
`#FF9A43` pour l’orange en petit texte. Une seule famille, Geist (titres en 700
serrés), et Geist Mono pour les surtitres et les chiffres.

---

## Arborescence

```
.
├── index.html                Landing principale (hero, fonctionnement, app, groupe, FAQ, formulaire)
├── entreprises.html          Offre Tribos pour les équipes (B2B)
├── merci.html                Confirmation après envoi du formulaire (noindex)
├── confidentialite.html      Politique de confidentialité
├── mentions-legales.html     Mentions légales
├── 404.html                  Page introuvable, servie automatiquement par Netlify
├── netlify.toml              Publication, en-têtes de sécurité, CSP, cache, redirections
├── robots.txt                Crawl ouvert (README et tools/ exclus)
├── sitemap.xml               Les 4 pages indexables
├── assets/
│   ├── css/tribos.css        Design system Cinematic 3D (tokens, scènes, composants, app recréée en DOM)
│   ├── fonts/                Geist et Geist Mono en woff2, plus fonts.css
│   ├── icons/sprite.svg      Sprite SVG unique, appelé en <use href="...#i-nom">
│   ├── js/site.js            Menu mobile, ouverture du hero, apparitions, envoi du formulaire
│   ├── cine/                 Visuels 3D (AVIF + WebP, JPEG de secours), plein cadre et recadrage mobile
│   ├── app/                  Captures de l’application (webp + png, plus une variante -sm servie en srcset)
│   ├── brand/                Icône, favicons, marque Tribos, carte sociale
│   ├── email/                Visuels des mails Resend (URL publiques, ne jamais écraser)
│   └── photo/, illus/        Anciens visuels, plus utilisés par aucune page depuis la refonte
├── tools/
│   ├── build-assets.py       Pipeline des captures, icônes et favicons (Python + Pillow)
│   ├── build-cine.py         Variantes responsives des visuels 3D (Python + Pillow avec AVIF)
│   ├── cine-generate.py      Génère un master 3D en 4K avec le renard canonique (Hermes, Nano Banana Pro)
│   ├── cine-prompts/         Prompts des masters, tirés du skill Cinematic 3D
│   ├── cine-upscale.py       Upscale x4 Real-ESRGAN d’un rendu existant en master
│   ├── build-og.mjs          Rend la carte sociale 1200x630 (Chromium headless)
│   └── og-card.html          Gabarit de cette carte
└── .context/                 Sources de travail, non versionnées (voir plus bas)
```

---

## Lancer le site en local

**Il faut un vrai serveur HTTP. Ouvrir `index.html` par un double clic ne suffit
pas.**

En `file://`, deux choses cassent silencieusement :

1. les polices auto-hébergées ne se chargent pas, car les requêtes de police
   passent par le CORS et une origine `file://` est traitée comme opaque ;
2. les icônes disparaissent, car `<use href="sprite.svg#i-x">` pointe vers un
   fichier SVG externe et suit la même politique d’origine.

Résultat : une page en police système, sans aucune icône, qui ne ressemble pas
du tout au site réel.

La bonne manière, sans rien installer :

```bash
node tools/dev-server.mjs 8000
```

Puis ouvrir **http://127.0.0.1:8000**.

Ce serveur remplace `python3 -m http.server` : il sert le site statique ET
exécute la fonction Appwrite `beta-signup` quand un formulaire est soumis. La
fonction lit les variables du `.env` local (clé Resend…) et envoie réellement
les emails. Il n’y a rien à compiler ni à surveiller : on modifie un fichier,
on recharge la page. `Ctrl+C` arrête le serveur.

En production, la même page envoie les formulaires vers la fonction Appwrite
Cloud (`beta-signup`, exécution « guests »), les variables étant gérées côté
Appwrite (variables de projet). Le seul point à garder en tête en local : sans
`.env`, les emails échouent avec l’erreur « Configuration email absente ».

---

## Régénérer les images

Toutes les images de `assets/app/`, `assets/brand/` et `assets/illus/` sont
produites par un script, jamais retouchées à la main :

```bash
python3 tools/build-assets.py            # génère les images et affiche le manifeste
python3 tools/build-assets.py --prune    # supprime en plus les fichiers devenus inutiles
```

Le script recadre, redimensionne, écrit le couple `.png` + `.webp` en 900 px de
large et, quand la source est assez grande, une variante `-sm` en 450 px. Les
deux largeurs sont déclarées en `srcset` dans le HTML : un écran en densité 1
télécharge la petite, un écran retina la grande. Une source déjà plus étroite
que 450 px ne produit pas de `-sm` : ce serait un doublon octet pour octet.
Le script est idempotent : deux exécutions donnent le même résultat. Il
demande seulement Python 3.9 et Pillow (`pip install Pillow`), sans accès
réseau.

Si tu ajoutes ou retires une capture, pense à relancer avec `--prune` pour
supprimer les fichiers devenus orphelins, et à mettre à jour le `srcset`
correspondant dans le HTML.

### Les visuels Cinematic 3D

`assets/cine/` est produit par `tools/build-cine.py` à partir de deux masters
rangés dans `.context/src/cine/` (non versionnés, comme les autres sources) :

| Master | Où il sert | Origine actuelle |
| --- | --- | --- |
| `sentier-x4.png` | hero de l’accueil, 404, carte sociale | `assets/email/hero-newsletter.jpg` upscalé x4 |
| `sommet-x4.png` | fin de l’accueil, entreprises, merci | `assets/email/hero-nouvelle-version.jpg` upscalé x4 |

```bash
python3 tools/build-cine.py            # recadre, redimensionne, encode, affiche le manifeste
python3 tools/build-cine.py --prune    # supprime en plus les fichiers devenus inutiles
```

Chaque master donne un plein cadre en 1280, 1920, 2560 et 3200 px et un
recadrage mobile centré sur le renard (`-portrait-`, 640 à 1600 px), en AVIF et
WebP, avec un JPEG de secours aux deux plus petites largeurs. Les recadrages
mobiles sont des boîtes en pixels du master, déclarées en tête du script : le
renard, sa queue et sa main levée doivent y tenir. Le script demande Pillow
11.3 ou plus, compilé avec AVIF, et s’arrête sinon.

**Les masters actuels sont provisoires.** Ce sont les visuels 3D des mails
(1200x800), upscalés par `tools/cine-upscale.py`. Ils sont fidèles au renard
canonique, mais leur soleil est à gauche, là où le hero pose son texte : le
voile sombre compense. Les vrais masters sont à générer en 21:9 et en 4K avec
les prompts de `tools/cine-prompts/`, qui suivent le skill à la lettre (zone
sombre à gauche, renard au centre-droit) :

```bash
~/.hermes/hermes-agent/venv/bin/python tools/cine-generate.py sentier \
    docs/brand/mascotte/renard-canonique-debout.png assets/email/hero-newsletter.jpg
```

Puis contrôler le rendu à l’œil (visage, proportions, tenue : jamais de renard
redessiné), le renommer `sentier-x4.png`, adapter les boîtes mobiles et les
`width`/`height` des `<img>` si le format a changé (3:2 aujourd’hui, 21:9
ensuite), et relancer `build-cine.py`. Le 14 octobre 2026, aucune génération
n’était possible : Higgsfield sans crédit, Everygen sans abonnement, crédits
Nous et OpenRouter épuisés, route ChatGPT/Codex en 403.

**La carte sociale** (`assets/brand/og-card.png`, 1200x630, celle qui s’affiche
au partage d’un lien) est à part : elle porte du texte, donc elle est rendue
depuis `tools/og-card.html` par un Chromium headless, qui réutilise les vraies
polices et les vrais tokens du site. À relancer si la marque, la promesse ou le
visuel du hero changent :

```bash
python3 -m http.server 8000 &      # le gabarit a besoin d’un vrai serveur
npx playwright@1.62.1 install chromium   # une seule fois
node tools/build-og.mjs
```

Point important : les **sources** (maquettes, captures, logos) vivent dans
`.context/src/`, et **`.context/` n’est pas versionné**. Les images générées,
elles, **sont commitées** dans `assets/`. Autrement dit :

- un clone frais peut déployer le site sans jamais lancer le script ;
- sans les sources locales, `tools/build-assets.py` s’arrête sur une erreur
  explicite, ce qui est normal ;
- toute image modifiée doit être régénérée puis commitée avec le reste.

Côté cache, `netlify.toml` distingue deux cas. Les polices sont servies en
`immutable` pendant un an : elles ne changent jamais sans changer de nom. Les
images passent à une semaine avec revalidation, parce que leurs noms sont
stables et ne portent pas de hash de contenu : une capture corrigée est donc
visible partout en une semaine au pire, au lieu de rester figée un an.

---

## Où vivent les textes

Tout le rédactionnel est figé hors du code, dans `.context/` (dossier local, non
versionné) :

| Fichier | Contenu |
| --- | --- |
| `.context/copy.md` | Le texte de référence, section par section. C’est lui qui fait foi, pas le HTML. |
| `.context/legal.md` | Le corps des deux pages légales et la liste des placeholders. |
| `.context/product-truth.md` | Ce que le produit fait réellement. Rien sur le site ne doit le contredire. |
| `.context/assets-manifest.md` | Chaque image, ses dimensions et son texte alternatif en français. |

Règles d’écriture appliquées partout : tutoiement, apostrophes typographiques
(’), aucun tiret cadratin ni demi-cadratin, aucun chiffre inventé, aucun
témoignage inventé.

---

## À remplir avant la mise en ligne

`confidentialite.html` et `mentions-legales.html` contiennent encore des
placeholders entre doubles accolades. **Aucun ne peut rester en production**,
ces deux pages répondent à des obligations légales.

| Placeholder | À remplacer par | Pages |
| --- | --- | --- |
| `{{RAISON_SOCIALE}}` | Nom exact de la société, ou nom et prénom en entreprise individuelle | Mentions légales, Confidentialité |
| `{{FORME_JURIDIQUE}}` | SAS, SASU, SARL, EURL, entreprise individuelle... | Mentions légales |
| `{{CAPITAL_SOCIAL}}` | Capital social en euros (à supprimer en entreprise individuelle) | Mentions légales |
| `{{SIREN}}` | Numéro SIREN à 9 chiffres | Mentions légales |
| `{{VILLE_RCS}}` | Ville du greffe d’immatriculation (à supprimer si non immatriculé au RCS) | Mentions légales |
| `{{TVA_INTRACOM}}` | Numéro de TVA intracommunautaire (à supprimer si non assujetti) | Mentions légales |
| `{{ADRESSE_SIEGE}}` | Adresse postale complète du siège | Mentions légales, Confidentialité |
| `{{DIRECTEUR_PUBLICATION}}` | Nom et prénom du directeur de la publication | Mentions légales |
| `{{EMAIL_CONTACT}}` | Adresse e-mail de contact réellement relevée | Mentions légales, Confidentialité |
| `{{NOM_DOMAINE}}` | Nom de domaine du site, par exemple tribos.app | Mentions légales, Confidentialité |
| `{{DATE_MAJ}}` | Date de dernière mise à jour, au format JJ/MM/AAAA | Mentions légales, Confidentialité |

Pour vérifier qu’il n’en reste aucun :

```bash
grep -rn "{{" *.html
```

`.context/legal.md` liste aussi les points à trancher avant publication, dont
l’accord de sous-traitance signé avec Netlify et les réglages anti-spam du
formulaire.

Tant que ces placeholders sont là, les deux pages légales affichent des
`{{JETONS}}` en clair, et elles sont référencées dans `sitemap.xml`. Si la mise
en ligne doit précéder le remplissage, retire-les temporairement du sitemap ou
ajoute-leur `<meta name="robots" content="noindex">`.

---

## Le formulaire bêta

Le formulaire est géré par **Netlify Forms**, sans backend.

| Élément | Valeur |
| --- | --- |
| Nom du formulaire | `beta-signup` |
| Champ collecté | `email` |
| Piège à robots (honeypot) | `bot-field` |
| Page de succès | `merci.html`, également servie sur `/merci` |

Comment ça marche :

- le formulaire porte `data-netlify="true"` et `netlify-honeypot="bot-field"`,
  plus un champ caché `form-name` valant `beta-signup`. Netlify repère le
  formulaire au déploiement, en lisant le HTML publié ;
- le champ `bot-field` est masqué visuellement : un humain ne le voit pas, un
  robot le remplit, et l’envoi est alors écarté en silence ;
- `assets/js/site.js` intercepte l’envoi, valide l’adresse, poste les données en
  `fetch` vers la même origine, puis redirige vers `merci.html`. Si le
  JavaScript est indisponible, l’envoi natif du formulaire prend le relais et
  aboutit au même endroit ;
- les inscriptions se lisent dans l’onglet **Forms** du site sur Netlify, avec
  une notification e-mail à activer côté Netlify.

Si rien ne remonte après un déploiement : vérifier que la détection de
formulaires est bien activée dans les réglages du site Netlify, et que
`merci.html` est toujours présent à la racine.

---

## Déploiement

Netlify publie la racine (`publish = "."`), sans commande de build. Un push sur
la branche de production suffit.

`netlify.toml` fixe en plus :

- les en-têtes de sécurité, dont une Content-Security-Policy stricte ;
- un cache d’un an pour les polices et les images, une revalidation
  systématique pour le HTML, le CSS et le JS ;
- la réécriture de `/merci` vers `/merci.html`.

**Un piège à connaître.** La CSP autorise le seul script inline du site, le
sélecteur de thème présent dans le `<head>` des six pages, par son empreinte
sha256. Les six pages doivent contenir ce script à l’identique, octet pour
octet. En cas de modification, même d’un espace, il faut recalculer l’empreinte
et mettre à jour `netlify.toml` :

```bash
printf '%s' '<texte exact situé entre les balises script>' \
  | openssl dgst -sha256 -binary | openssl base64
```

Sans cette mise à jour, le navigateur bloque le script et le thème sombre
clignote au chargement.

De la même façon, ajouter un service tiers (mesure d’audience, police distante,
vidéo intégrée, pixel publicitaire) impose d’élargir la CSP **et** de réécrire
la section Cookies de la politique de confidentialité, avec un bandeau de
consentement à la clé.

---

## Ajouter une page

1. Copier la structure d’une page existante : `<head>` complet, lien
   d’évitement, `.grain`, sentinelle de navigation, `<header class="nav">`,
   panneau de menu, `<footer>`, et `assets/js/site.js` en fin de `<body>`.
2. Ne modifier que le `<main>`. Réutiliser les classes de
   `assets/css/tribos.css` plutôt que d’en inventer ; si une règle manque, elle
   s’ajoute à la fin du fichier CSS, sous un commentaire, avec les tokens
   existants (`var(--ink)`, `var(--accent)`, `var(--r-card)`, `var(--s-6)`...).
3. Ajouter `class="reveal"` aux blocs de contenu pour l’animation d’apparition.
4. Un seul `<h1>` par page, et jamais de niveau de titre sauté.
5. Chaque image : `width`, `height`, `decoding="async"`, `loading="lazy"` sauf
   si elle est visible d’emblée, un `alt` en français (ou `alt=""` et
   `aria-hidden="true"` si elle est purement décorative), et un `<picture>` avec
   une source WebP quand le jumeau `.webp` existe.
6. Déclarer la nouvelle page dans `sitemap.xml` et mettre à jour la date de
   `lastmod`.

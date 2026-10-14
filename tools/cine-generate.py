"""Génère un master « Cinematic 3D » (Nano Banana Pro, 4K) via la passerelle FAL de Hermes.

Les prompts suivent le skill .claude/skills/tribos-da-3d-cinematique (§2, §3) et
vivent dans tools/cine-prompts/. Le renard canonique est TOUJOURS joint en
première référence : un prompt seul ne garde ni le visage ni la tenue.

    ~/.hermes/hermes-agent/venv/bin/python tools/cine-generate.py sentier \\
        docs/brand/mascotte/renard-canonique-debout.png assets/email/hero-newsletter.jpg

Écrit .context/src/cine/<nom>-gen-<n>.png et ajoute la requête à
.context/src/cine/log.jsonl. Après validation à l'œil (visage, proportions,
tenue, zone sombre à gauche pour le hero), renommer le rendu retenu en
<nom>-x4.png, ajuster les recadrages mobiles de tools/build-cine.py si le
format a changé, puis lancer tools/build-cine.py.

Prérequis : Hermes installé, image_gen réglé sur `nous`, et des crédits Nous
disponibles (portal.nousresearch.com/billing). Les références partent en data
URI : cette passerelle refuse les chemins locaux.
"""
import argparse, base64, json, mimetypes, os, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".context", "src", "cine")
PROMPTS = os.path.join(ROOT, "tools", "cine-prompts")
HERMES = os.path.expanduser("~/.hermes/hermes-agent")

sys.path.insert(0, HERMES)


def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "image/png"
    with open(path, "rb") as fh:
        return "data:%s;base64,%s" % (mime, base64.b64encode(fh.read()).decode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("name", help="nom du prompt dans tools/cine-prompts/ (sans .txt)")
    ap.add_argument("refs", nargs="+", help="images de référence, le renard canonique en premier")
    ap.add_argument("--aspect", default="21:9")
    ap.add_argument("--res", default="4K")
    ap.add_argument("--n", type=int, default=1)
    args = ap.parse_args()

    with open(os.path.join(PROMPTS, args.name + ".txt"), encoding="utf-8") as fh:
        prompt = fh.read().strip()
    refs = [os.path.abspath(r) for r in args.refs]
    payload = {
        "prompt": prompt,
        "image_urls": [data_uri(r) for r in refs],
        "aspect_ratio": args.aspect,
        "resolution": args.res,
        "num_images": args.n,
        "output_format": "png",
        "safety_tolerance": "5",
    }

    # Hermes resolves its config relative to its own checkout.
    os.chdir(HERMES)
    from tools.image_generation_tool import _submit_fal_request, _wait_fal_result

    t0 = time.time()
    result = _wait_fal_result(_submit_fal_request("fal-ai/nano-banana-pro/edit", arguments=payload))
    images = (result or {}).get("images") or []
    if not images:
        sys.exit("Aucune image renvoyée : %s" % json.dumps(result, ensure_ascii=False)[:600])

    os.makedirs(OUT, exist_ok=True)
    saved = []
    for img in images:
        k = 1
        while os.path.exists(os.path.join(OUT, "%s-gen-%d.png" % (args.name, k))):
            k += 1
        dest = os.path.join(OUT, "%s-gen-%d.png" % (args.name, k))
        urllib.request.urlretrieve(img["url"], dest)
        saved.append(os.path.relpath(dest, ROOT))

    entry = {
        "date": time.strftime("%Y-%m-%d %H:%M"),
        "prompt": args.name,
        "refs": [os.path.relpath(r, ROOT) for r in refs],
        "aspect": args.aspect,
        "res": args.res,
        "seconds": round(time.time() - t0, 1),
        "saved": saved,
    }
    with open(os.path.join(OUT, "log.jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(json.dumps(entry, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

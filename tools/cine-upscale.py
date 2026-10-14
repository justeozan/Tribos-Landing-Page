"""Upscale x4 un rendu existant en master pour tools/build-cine.py.

Real-ESRGAN x4plus (architecture RRDBNet, réécrite ici pour ne dépendre que de
PyTorch), traité par tuiles, sur le GPU Apple (MPS) quand il est disponible.

C'est ce qui a produit les masters actuels de .context/src/cine/ à partir des
visuels 3D des mails (assets/email/, 1200x800) : un master 4800x3200 net et
sans artefacts JPEG. Un rendu généré directement en 4K (tools/cine-generate.py)
n'en a pas besoin.

    python3 tools/cine-upscale.py assets/email/hero-newsletter.jpg .context/src/cine/sentier-x4.png

Prérequis : PyTorch, Pillow, numpy, et les poids officiels (v0.1.0) :
    mkdir -p ~/.cache/tribos-esrgan && curl -L -o ~/.cache/tribos-esrgan/RealESRGAN_x4plus.pth \
      https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
"""
import argparse, math, os, sys
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

WEIGHTS = os.path.expanduser("~/.cache/tribos-esrgan/RealESRGAN_x4plus.pth")


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1 = RDB(nf, gc)
        self.rdb2 = RDB(nf, gc)
        self.rdb3 = RDB(nf, gc)

    def forward(self, x):
        out = self.rdb3(self.rdb2(self.rdb1(x)))
        return out * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, nb=23, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--tile", type=int, default=384)
    ap.add_argument("--pad", type=int, default=16)
    args = ap.parse_args()

    dev = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    net = RRDBNet()
    state = torch.load(WEIGHTS, map_location="cpu", weights_only=True)
    net.load_state_dict(state.get("params_ema", state), strict=True)
    net.eval().to(dev)

    img = np.asarray(Image.open(args.src).convert("RGB")).astype(np.float32) / 255.0
    h, w, _ = img.shape
    x = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0)
    out = torch.zeros((1, 3, h * 4, w * 4))
    t, p = args.tile, args.pad
    tiles_y, tiles_x = math.ceil(h / t), math.ceil(w / t)
    with torch.no_grad():
        for ty in range(tiles_y):
            for tx in range(tiles_x):
                y0, x0 = ty * t, tx * t
                y1, x1 = min(y0 + t, h), min(x0 + t, w)
                py0, px0 = max(y0 - p, 0), max(x0 - p, 0)
                py1, px1 = min(y1 + p, h), min(x1 + p, w)
                tile = x[:, :, py0:py1, px0:px1].to(dev)
                res = net(tile).clamp(0, 1).cpu()
                oy0, ox0 = (y0 - py0) * 4, (x0 - px0) * 4
                out[:, :, y0 * 4:y1 * 4, x0 * 4:x1 * 4] = res[:, :, oy0:oy0 + (y1 - y0) * 4, ox0:ox0 + (x1 - x0) * 4]
                print("tile %d/%d" % (ty * tiles_x + tx + 1, tiles_x * tiles_y), flush=True)
    arr = (out.squeeze(0).permute(1, 2, 0).numpy() * 255.0).round().astype(np.uint8)
    Image.fromarray(arr).save(args.dst)
    print("saved", args.dst, arr.shape)


if __name__ == "__main__":
    sys.exit(main())

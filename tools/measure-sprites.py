#!/usr/bin/env python3
"""逐张下载 sprite-map.json 里的精灵图，测量“脚底位置”（不透明像素最底行占画布高度的比例），
把 frontFeet / backFeet 写回每条 entries。运行时据此把精灵的脚对齐到地面阴影。
用法：在项目根目录执行 python3 tools/measure-sprites.py（下载结果缓存于 /tmp/sprite-measure，可重复执行）。"""
import hashlib
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

import numpy as np

MAP_PATH = 'src/data/sprite-map.json'
CACHE_DIR = '/tmp/sprite-measure'
os.makedirs(CACHE_DIR, exist_ok=True)


def measure(url):
    name = hashlib.md5(url.encode()).hexdigest() + ('.gif' if url.endswith('.gif') else '.png')
    path = os.path.join(CACHE_DIR, name)
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        last = None
        for _ in range(3):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'sprite-measure/1.0'})
                with urllib.request.urlopen(req, timeout=30) as r, open(path, 'wb') as f:
                    f.write(r.read())
                break
            except Exception as e:  # noqa: BLE001
                last = e
                time.sleep(1.5)
        else:
            return url, None, str(last)
    try:
        im = Image.open(path)
        W, H = im.width, im.height
        # 逐帧收集不透明度（PIL seek 已按 GIF disposal 合成全帧）
        solids, bottoms = [], []
        frame = 0
        while True:
            try:
                im.seek(frame)
            except EOFError:
                break
            a = np.asarray(im.convert('RGBA'))[:, :, 3]
            solid = np.where(a > 40, a, 0).astype(np.float64)
            solids.append(solid)
            rows = np.where(solid.any(axis=1))[0]
            if len(rows):
                bottoms.append((rows.max() + 1) / H)
            frame += 1
            if frame > 300:
                break
        if not bottoms:
            return url, None, 'empty'
        bottoms.sort()
        # 纵向兜底：全部帧最低点的第 30 百分位（动图自身浮动，只按最低帧对齐会让大半周期悬空）
        bbox_feet = bottoms[min(len(bottoms) - 1, int(0.30 * len(bottoms)))]
        xs = np.arange(W)
        bodymass = np.zeros(W)
        for solid in solids:
            bodymass += solid.sum(axis=0)
        body_x = float((bodymass * xs).sum() / bodymass.sum()) / W if bodymass.sum() else 0.5
        # 站立横向点：脚是“高列”的底部（从脚向上这一列能延伸到身体上半部，尾巴尖列则很矮）。
        # 逐帧在高列里按底部高度取候选、聚类，选离全身重心最近的簇（双脚分居重心两侧时取中点），
        # 再取全帧中位数抗动画摆动。纵向仍用全图最低点的 p30（已验证）。
        band_h_px = max(2, round(0.08 * H))
        gap_allow = max(2, round(0.04 * W))
        stance_xs = []
        for solid in solids:
            colhas = solid.any(axis=0)
            if not colhas.any():
                continue
            filled = solid > 0
            colbot = np.where(colhas, H - 1 - np.argmax(filled[::-1], axis=0), -1)
            coltop = np.argmax(filled, axis=0)
            fbot = colbot.max()
            bandmass = solid[max(0, int(fbot) - band_h_px):int(fbot) + 1].sum(axis=0)
            tall = (colbot - coltop >= 0.45 * H) & colhas
            if tall.sum() >= 2:
                level = np.percentile(colbot[tall], 80)
                cand = tall & (colbot >= level - max(2, 0.035 * H))
            else:
                cand = (colbot >= fbot - max(1.5, 0.03 * H)) & colhas
            if cand.sum() < 1:
                continue
            groups, cur, last = [], [], -10
            for x in range(W):
                if cand[x]:
                    if cur and x - last > gap_allow:
                        groups.append(cur)
                        cur = []
                    cur.append(x)
                    last = x
            if cur:
                groups.append(cur)
            infos = []
            for g in groups:
                m = bandmass[g].sum()
                cx = float((bandmass[g] * np.array(g)).sum() / m) / W if m > 0 else (g[0] + g[-1]) / 2 / W
                infos.append({'cx': cx, 'm': float(m)})
            infos.sort(key=lambda d: abs(d['cx'] - body_x))
            pick = infos[0]
            if len(infos) > 1:
                q = infos[1]
                if (pick['cx'] - body_x) * (q['cx'] - body_x) < 0 and abs(abs(pick['cx'] - body_x) - abs(q['cx'] - body_x)) < 0.08 and 0.4 <= pick['m'] / max(q['m'], 1e-9) <= 2.5:
                    pick = {'cx': (pick['cx'] * pick['m'] + q['cx'] * q['m']) / (pick['m'] + q['m'])}
            stance_xs.append(min(max(pick['cx'], body_x - 0.15), body_x + 0.15))
        feet_x = round(float(np.median(stance_xs)), 3) if stance_xs else round(body_x, 3)
        feet_frac = round(bbox_feet, 3)
        return url, (feet_frac, feet_x), None
    except Exception as e:  # noqa: BLE001
        return url, None, str(e)


def main():
    with open(MAP_PATH, encoding='utf-8') as f:
        data = json.load(f)
    entries = data['entries']
    urls = sorted({e['front'] for e in entries.values()} | {e['back'] for e in entries.values()})
    print(f'entries={len(entries)} uniqueUrls={len(urls)}', flush=True)
    frac, fails = {}, []
    with ThreadPoolExecutor(max_workers=20) as ex:
        for i, (url, f, err) in enumerate(ex.map(measure, urls)):
            if f is None:
                fails.append((url, err))
            else:
                frac[url] = f
            if (i + 1) % 500 == 0:
                print(f'  {i + 1}/{len(urls)}', flush=True)
    for e in entries.values():
        e['frontFeet'], e['frontFeetX'] = frac.get(e['front'], (None, None))
        e['backFeet'], e['backFeetX'] = frac.get(e['back'], (None, None))
    with open(MAP_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)
    vals = sorted(v[0] for v in frac.values())
    n = len(vals)
    print(f'measured={n} failed={len(fails)}')
    if fails:
        print('failures sample:', fails[:8])
    print(f'feetFrac min={vals[0]} p5={vals[n // 20]} median={vals[n // 2]} p95={vals[n * 19 // 20]} max={vals[-1]}')
    inv = sorted(frac.items(), key=lambda kv: kv[1][0])
    print('most-floating (smallest feet frac):')
    for url, f in inv[:15]:
        print(f'  {f}  {url.rsplit("/", 1)[-1]}')


if __name__ == '__main__':
    main()

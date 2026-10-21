#!/usr/bin/env python3
"""Measure stable body-core anchors, without changing the existing feet measurements.
Install: python3 -m pip install pillow numpy scipy requests
Run from project root: python3 tools/measure-body-anchors.py
Optional: --species charizard charizardmegay (also useful for a quick verification)
The distance-to-transparent-edge squared favours a solid torso over thin tails,
wing tips and empty canvas. Median of up to 24 time-spaced GIF frames reduces sway.
Downloads are cached locally; only small normalized coordinates enter sprite-map.json.
"""
import argparse
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import requests
from PIL import Image
from scipy.ndimage import distance_transform_edt

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'body-sprites'
CACHE.mkdir(parents=True, exist_ok=True)


def measure(url):
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + Path(url).suffix)
    if url.startswith('./'): path = ROOT / url[2:]
    if not path.exists():
        response = requests.get(url, timeout=25)
        response.raise_for_status()
        path.write_bytes(response.content)
    image = Image.open(io.BytesIO(path.read_bytes()))
    count = getattr(image, 'n_frames', 1)
    # Select by elapsed GIF time, not frame index (some GIFs contain long holds).
    durations = []
    for i in range(count):
        image.seek(i)
        durations.append(max(10, image.info.get('duration', 100)))
    times = np.cumsum(durations)
    samples = sorted(set(np.searchsorted(times, np.linspace(0, times[-1] - 1, min(24, count))).tolist()))
    points = []
    for frame in samples:
        image.seek(frame)
        solid = np.asarray(image.convert('RGBA'))[:, :, 3] > 40
        if not solid.any():
            continue
        # Transparent padding also handles sprites touching the GIF canvas border.
        depth = distance_transform_edt(np.pad(solid, 1))[1:-1, 1:-1]
        weights = depth ** 2
        yy, xx = np.indices(solid.shape)
        total = weights.sum()
        points.append([float(((xx + .5) * weights).sum() / total / image.width),
                       float(((yy + .5) * weights).sum() / total / image.height)])
    if not points:
        raise ValueError('No opaque pixels')
    return [round(float(v), 5) for v in np.median(points, axis=0)]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--species', nargs='*')
    parser.add_argument('--workers', type=int, default=12)
    args = parser.parse_args()
    map_path = ROOT / 'src/data/sprite-map.json'
    data = json.loads(map_path.read_text())
    entries = data['entries']
    selected = [entry for name, entry in entries.items() if not args.species or name in args.species]
    urls = sorted({entry[side] for entry in selected for side in ('front', 'back') if entry.get(side)})
    anchors, failures = {}, []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks = {pool.submit(measure, url): url for url in urls}
        for done, future in enumerate(as_completed(tasks), 1):
            url = tasks[future]
            try:
                anchors[url] = future.result()
            except Exception as error:
                failures.append({'url': url, 'error': str(error)})
            if done % 100 == 0:
                print(f'{done}/{len(urls)} measured, {len(failures)} failures', flush=True)
    for entry in entries.values():
        for side in ('front', 'back'):
            if entry.get(side) in anchors:
                entry[side + 'Body'] = anchors[entry[side]]
    data['bodyAnchorMethod'] = 'alpha>40; distance-to-edge squared centroid; median of up to 24 time-spaced frames; v1'
    map_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Body anchors: {len(anchors)}/{len(urls)} URLs', flush=True)
    if failures:
        (ROOT / '.cache/body-measure-failures.json').write_text(json.dumps(failures, indent=2))
        print('Failures logged in .cache/body-measure-failures.json; runtime uses a feet-based fallback.')


if __name__ == '__main__':
    main()

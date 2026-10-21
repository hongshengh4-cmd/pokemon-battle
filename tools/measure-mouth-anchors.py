#!/usr/bin/env python3
"""Measure "mouth" (snout tip) anchors so ranged move effects leave from the head, not the sprite box centre.
Install: python3 -m pip install pillow numpy scipy requests
Run from project root: python3 tools/measure-mouth-anchors.py
Optional: --species charizard gyarados  (quick verification)   --preview out.png  (draws the points)
Hand-checked anchors in tools/mouth-overrides.json win over the measurement.

Heuristic per frame (median of up to 12 time-spaced GIF frames):
  1. solid = alpha > 40; body centre = distance-to-edge² weighted centroid (same idea as the body anchor).
  2. head top = 15th percentile of per-column top rows inside a window around the body centre
     (thin horns / antennae are ignored, wing tips outside the window are ignored).
  3. head band = rows [headTop, headTop + 24% of the silhouette height]; the connected component in
     that band that touches the centre window is the head.
  4. the mouth is the head pixel furthest towards the opponent (back sprite → right, front sprite → left),
     measured in the lower 60% of the head band so eyes/forehead do not win.
Only small normalized coordinates (fractions of the GIF canvas) enter sprite-map.json.
"""
import argparse
import hashlib
import io
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import requests
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, label, maximum_filter

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'body-sprites'
CACHE.mkdir(parents=True, exist_ok=True)
METHOD = 'alpha>40; head = body-coloured thick blob, stable across frames, best facing-side + height score; mouth = facing-side silhouette extreme at head rows (reach 2.2 head radii); median of up to 12 frames; v5'


def fetch(url):
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + Path(url).suffix)
    if url.startswith('./'): path = ROOT / url[2:]
    if not path.exists():
        response = requests.get(url, timeout=25)
        response.raise_for_status()
        path.write_bytes(response.content)
    return Image.open(io.BytesIO(path.read_bytes()))


def frame_samples(image, limit=12):
    count = getattr(image, 'n_frames', 1)
    durations = []
    for i in range(count):
        image.seek(i)
        durations.append(max(10, image.info.get('duration', 100)))
    times = np.cumsum(durations)
    return sorted(set(np.searchsorted(times, np.linspace(0, times[-1] - 1, min(limit, count))).tolist()))


def colour_family(rgb, solid, depth):
    """Mask of pixels whose colour belongs to one of the dominant colour clusters of the sprite.

    Hue is quantised into 24 bins (unsaturated pixels into 3 brightness bins); clusters with at least 45% of the
    mass (depth-squared weighted, so thick body parts dominate) of the strongest cluster count as "body" colours.
    Thin outlines are ignored.  This keeps membranes/flames/accessories out of the head search.
    """
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    lum = .299 * r + .587 * g + .114 * b
    outline = solid & (lum < .5 * np.median(lum[solid]))
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    span = np.maximum(mx - mn, 1e-6)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    hue = np.where(mx == r, ((g - b) / span) % 6, np.where(mx == g, (b - r) / span + 2, (r - g) / span + 4)) * 60
    bins = np.where(sat >= .2, (hue // 15).astype(int), 24 + np.minimum(2, (mx // 86).astype(int)))
    usable = solid & ~outline
    weights = (depth ** 2) * usable
    mass = np.bincount(bins[usable], weights=weights[usable], minlength=27)
    hue_mass = mass[:24]
    # cluster adjacent hue bins (circular) that carry at least 4% of the hue mass each
    threshold = .04 * max(hue_mass.sum(), 1e-6)
    strong = hue_mass >= threshold
    clusters, visited = [], set()
    for start in range(24):
        if not strong[start] or start in visited:
            continue
        members = [start]
        visited.add(start)
        for step in (1, -1):
            k = (start + step) % 24
            while strong[k] and k not in visited:
                members.append(k)
                visited.add(k)
                k = (k + step) % 24
        clusters.append((float(sum(hue_mass[m] for m in members)), members))
    for k in range(24, 27):
        if mass[k] > 0:
            clusters.append((float(mass[k]), [k]))
    if not clusters:
        return usable, outline
    top = max(c[0] for c in clusters)
    family_bins = set()
    for total, members in clusters:
        if total >= .45 * top:
            family_bins.update(members)
    family = np.isin(bins, list(family_bins)) & usable
    return family, outline


def head_candidates(solid, facing_right, rgb=None):
    """Thick blobs that could be the head, with a "towards the opponent + high up" score.

    Returns (candidates, frame_info); candidates = [(score, py, px, d)], frame_info = (torso_x, torso_y, height).
    Thin parts (horns, ears, wing tips, tails) are excluded by thickness, wing membranes/flames by colour, and
    anything below the torso centre is ignored.
    """
    ys, xs = np.nonzero(solid)
    if len(xs) < 12:
        return [], None
    top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    height, width = bottom - top + 1, right - left + 1
    depth = distance_transform_edt(np.pad(solid, 1))[1:-1, 1:-1]
    d_max = float(depth.max())
    if d_max < 2:
        return [], None
    if rgb is None:
        family, outline = solid, np.zeros_like(solid)
    else:
        family, outline = colour_family(rgb, solid, depth)
    weights = depth ** 2
    yy, xx = np.indices(solid.shape)
    torso_x = float((xx * weights).sum() / weights.sum())
    torso_y = float((yy * weights).sum() / weights.sum())
    peaks = (depth == maximum_filter(depth, size=7)) & (depth >= max(2.0, .2 * d_max))
    labels, count = label(peaks, structure=np.ones((3, 3)))
    direction = 1.0 if facing_right else -1.0
    candidates = []
    for index in range(1, count + 1):
        py, px = [float(v.mean()) for v in np.nonzero(labels == index)]
        d = float(depth[int(round(py)), int(round(px))])
        if py > torso_y + .1 * height:
            continue
        disk = solid & ~outline & ((yy - py) ** 2 + (xx - px) ** 2 <= d * d)
        if disk.sum() and float((family & disk).sum()) / float(disk.sum()) < .4:
            continue
        score = direction * (px - (left + right) / 2) / width + .6 * ((top + bottom) / 2 - py) / height
        candidates.append((score, py, px, d))
    # thin peaks (ears, horns, crests, snouts) next to a thick blob are appendages of that blob, not heads;
    # isolated thin peaks stay but are penalised so a thick head wins when the geometry is comparable
    thick = [c for c in candidates if c[3] >= .35 * d_max]
    kept = []
    for score, py, px, d in candidates:
        if d >= .35 * d_max:
            kept.append((score, py, px, d))
            continue
        if any(((py - ty) ** 2 + (px - tx) ** 2) ** .5 <= 3.0 * td for _, ty, tx, td in thick):
            continue
        kept.append((score - .3, py, px, d))
    return kept, (torso_x, torso_y, float(height))


def mouth_from_head(solid, hy, hx, d, facing_right):
    """Facing-side extreme of the silhouette at the head's rows (snout length capped at 2.2 head radii)."""
    ys = np.nonzero(solid.any(axis=1))[0]
    top, bottom = ys.min(), ys.max()
    size = max(d, .08 * (bottom - top + 1))  # thin snouts/horns: still look at a head-sized band
    row0, row1 = int(round(hy - .3 * size)), int(round(hy + 1.3 * size))
    reach = 2.2 * size
    best_x, best_rows = None, []
    for y in range(max(top, row0), min(bottom, row1) + 1):
        cols = np.nonzero(solid[y])[0]
        cols = cols[np.abs(cols - hx) <= reach]
        if not len(cols):
            continue
        ext = cols.max() if facing_right else cols.min()
        if best_x is None or (ext > best_x if facing_right else ext < best_x):
            best_x, best_rows = ext, [y]
        elif ext == best_x:
            best_rows.append(y)
    if best_x is None:
        return None
    y = float(np.median(best_rows))
    x = best_x + 1.0 if facing_right else best_x
    return (x, y + .5)


def mouth_of(solid, facing_right, rgb=None):
    """Single-frame variant (used by the preview tools)."""
    candidates, _ = head_candidates(solid, facing_right, rgb)
    if not candidates:
        return None
    score, hy, hx, d = max(candidates)
    return mouth_from_head(solid, hy, hx, d, facing_right)


def measure(url, facing_right):
    """Median mouth anchor over the sampled frames.

    The head is chosen across frames: candidates are expressed relative to the torso centre (in units of the
    silhouette height) and clustered; clusters present in at least 60% of the frames are preferred (flapping
    wings and raised arms move between frames and drop out), then the best-scoring stable cluster is the head.
    """
    image = fetch(url)
    frames = []
    for frame in frame_samples(image):
        image.seek(frame)
        pixels = np.asarray(image.convert('RGBA')).astype(float)
        solid = pixels[:, :, 3] > 40
        candidates, info = head_candidates(solid, facing_right, pixels[:, :, :3])
        if info:
            frames.append((solid, candidates, info))
    if not frames:
        raise ValueError('No head found')
    relative = []  # (frame index, rel_x, rel_y, score, py, px, d)
    for index, (solid, candidates, (tx, ty, height)) in enumerate(frames):
        for score, py, px, d in candidates:
            relative.append((index, (px - tx) / height, (py - ty) / height, score, py, px, d))
    chosen = {}
    if relative:
        radius = .25
        best = None
        for seed in relative:
            members = {}
            for item in relative:
                if (item[1] - seed[1]) ** 2 + (item[2] - seed[2]) ** 2 <= radius ** 2:
                    # keep the best-scoring candidate per frame
                    if item[0] not in members or item[3] > members[item[0]][3]:
                        members[item[0]] = item
            support = len(members) / len(frames)
            mean_score = float(np.mean([m[3] for m in members.values()]))
            # tiers: blobs seen in >= 60% of the frames beat everything (flapping wings / raised arms drop
            # out), then >= 40%, then whatever is left; inside a tier the facing-side + height score decides
            tier = 2 if support >= .6 else 1 if support >= .4 else 0
            key = (tier, mean_score)
            if best is None or key > best[0]:
                best = (key, members)
        chosen = best[1]
    points = []
    for index, (solid, candidates, info) in enumerate(frames):
        if index in chosen:
            _, _, _, _, py, px, d = chosen[index]
        elif candidates and not chosen:
            _, py, px, d = max(candidates)
        else:
            continue
        point = mouth_from_head(solid, py, px, d, facing_right)
        if point:
            points.append([point[0] / image.width, point[1] / image.height])
    if not points:
        raise ValueError('No head found')
    return [round(float(v), 5) for v in np.median(points, axis=0)]


def preview(entries, names, out, body_anchors):
    tiles = []
    for name in names:
        entry = entries.get(name)
        if not entry:
            continue
        for side, facing_right in (('front', False), ('back', True)):
            url = entry.get(side)
            if not url:
                continue
            image = fetch(url)
            image.seek(frame_samples(image, 1)[0])
            rgba = image.convert('RGBA')
            try:
                mx, my = measure(url, facing_right)
            except ValueError:
                mx = my = None
            scale = 3
            tile = rgba.resize((rgba.width * scale, rgba.height * scale), Image.NEAREST)
            bg = Image.new('RGBA', tile.size, (150, 210, 170, 255))
            bg.alpha_composite(tile)
            draw = ImageDraw.Draw(bg)
            body = entry.get(side + 'Body')
            if body:
                bx, by = body[0] * bg.width, body[1] * bg.height
                draw.ellipse((bx - 5, by - 5, bx + 5, by + 5), outline=(0, 90, 255, 255), width=2)
            if mx is not None:
                px, py = mx * bg.width, my * bg.height
                draw.ellipse((px - 6, py - 6, px + 6, py + 6), fill=(255, 40, 40, 255), outline=(255, 255, 255, 255), width=2)
            draw.text((3, 3), f'{name} {side}', fill=(0, 0, 0, 255))
            tiles.append(bg)
    if not tiles:
        return
    cols = 6
    w = max(t.width for t in tiles)
    h = max(t.height for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * w, rows * h), (255, 255, 255, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * w, (i // cols) * h))
    sheet.save(out)
    print(f'preview written to {out} ({len(tiles)} tiles)')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--species', nargs='*')
    parser.add_argument('--workers', type=int, default=12)
    parser.add_argument('--preview')
    parser.add_argument('--dry-run', action='store_true', help='measure but do not write sprite-map.json')
    args = parser.parse_args()
    map_path = ROOT / 'src/data/sprite-map.json'
    data = json.loads(map_path.read_text())
    entries = data['entries']
    if args.preview:
        preview(entries, args.species or [], args.preview, None)
        if args.dry_run:
            return
    selected = {name: entry for name, entry in entries.items() if not args.species or name in args.species}
    jobs = {}
    for entry in selected.values():
        if entry.get('front'):
            jobs[entry['front']] = False
        if entry.get('back'):
            jobs[entry['back']] = True
    anchors, failures = {}, []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        tasks = {pool.submit(measure, url, facing_right): url for url, facing_right in jobs.items()}
        for done, future in enumerate(as_completed(tasks), 1):
            url = tasks[future]
            try:
                anchors[url] = future.result()
            except Exception as error:
                failures.append({'url': url, 'error': str(error)})
            if done % 200 == 0:
                print(f'{done}/{len(tasks)} measured, {len(failures)} failures', flush=True)
    if args.dry_run:
        for url, point in sorted(anchors.items()):
            print(url.rsplit('/', 2)[-2], url.rsplit('/', 1)[-1], point)
        return
    overrides = {}
    override_path = ROOT / 'tools/mouth-overrides.json'
    if override_path.exists():
        overrides = {k: v for k, v in json.loads(override_path.read_text()).items() if not k.startswith('_')}
    applied = 0
    for name, entry in entries.items():
        for side in ('front', 'back'):
            manual = overrides.get(name, {}).get(side)
            if manual and (not args.species or name in args.species):
                entry[side + 'Mouth'] = [round(float(v), 5) for v in manual]
                applied += 1
            elif entry.get(side) in anchors:
                entry[side + 'Mouth'] = anchors[entry[side]]
    data['mouthAnchorMethod'] = METHOD + f'; {applied} hand-checked overrides from tools/mouth-overrides.json'
    map_path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f'Mouth anchors: {len(anchors)}/{len(jobs)} URLs', flush=True)
    if failures:
        (ROOT / '.cache/mouth-measure-failures.json').write_text(json.dumps(failures, indent=2))
        print('Failures logged in .cache/mouth-measure-failures.json; runtime uses a head-region fallback.')


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
hexagons_video.py  -  render hexagons.json as an animated MP4 Teams background.

Output : 1920x1080, 30 fps, 12-second seamless loop.

Frame layers (bottom to top):
  1. draw_hexes  - coloured tiles with wave brightness modulation
  2. draw_network - edges and nodes, always above tiles
  3. draw_glow   - soft pulse on filled nodes

To add an effect, define a function and insert a call in draw_frame.
"""

import json
import math
import random as _rnd
import sys
import os
import shutil
import subprocess
import numpy as np
import cv2

# ── config ────────────────────────────────────────────────────────────────────
INPUT    = 'hexagons.json'
OUTPUT   = 'teams_background.mp4'
W, H     = 1280, 720
FPS      = 30
DURATION = 12         # seconds
BG       = (245, 243, 241)   # BGR warm-white background
FILL_PAD   = 1.08     # horizontal fill fraction (>1.0 zooms in, removing side bands)
BOTTOM_PAD = 30       # pixels of breathing room below the lowest hex

# Lightening applied to the two shifted ghost layers (0 = same colour as base,
# 1 = pure white).  Upper-right is lightest to suggest a top-right light source.
LIGHTEN_UL = 0.20    # upper-left ghost layer
LIGHTEN_UR = 0.45    # upper-right ghost layer

# Energy pulse travelling along the network path.
PULSE_PERIOD = 12.0   # seconds per traversal (one pass per loop)
# ─────────────────────────────────────────────────────────────────────────────

with open(INPUT) as f:
    data = json.load(f)

hexes  = data['hexes']
nodes  = data['network']['nodes']
edges  = data['network']['edges']
tile_r = data['tileGrid']['radius']

# ── world -> screen transform ─────────────────────────────────────────────────
all_x  = [h['x'] for h in hexes] + [n['x'] for n in nodes]
all_y  = [h['y'] for h in hexes] + [n['y'] for n in nodes]
hex_ys = [h['y'] for h in hexes]

# Scale so the content fills the full frame width (removes side bands).
# tile_r margin on each side keeps the leftmost/rightmost hex faces unclipped.
x_span = max(all_x) - min(all_x) + tile_r * 2
scale  = W * FILL_PAD / x_span

# Centre horizontally on all content.
wcx = (max(all_x) + min(all_x)) / 2

# Align the bottom vertex of the lowest hex row to the bottom of the frame,
# leaving BOTTOM_PAD pixels of breathing room.
# For a flat-top hex the bottom vertex is tile_r*sin(60°) = tile_r*√3/2 below centre.
hex_y_bottom = max(hex_ys) + tile_r * math.sqrt(3) / 2
wcy = hex_y_bottom - (H / 2 - BOTTOM_PAD) / scale

SR     = tile_r * scale              # tile screen-radius
NR     = max(6, round(SR * 0.12))    # node screen-radius
EDGE_W = max(1, round(SR * 0.022))   # edge line width

def scr(x, y):
    return (round((x - wcx) * scale + W / 2),
            round((y - wcy) * scale + H / 2))

def demix(channel, alpha):
    """Recover original opaque colour from a value composited on white."""
    return max(0, min(255, round(255 + (channel - 255) / alpha)))

def hex_pts(cx, cy, r):
    return np.array([
        [round(cx + r * math.cos(math.pi / 3 * k)),
         round(cy + r * math.sin(math.pi / 3 * k))]
        for k in range(6)
    ], dtype=np.int32)

# Sub-pixel rendering: coordinates are multiplied by 2^SUBPIX so OpenCV can
# place polygon vertices at 1/16-pixel resolution, eliminating staircase jitter
# from slow wave displacements.
_SUBPIX       = 4
_SUBPIX_SCALE = 1 << _SUBPIX  # 16

def hex_pts_sp(cx, cy, r):
    """Hex polygon vertices in 1/16-pixel sub-pixel units."""
    s = _SUBPIX_SCALE
    return np.array([
        [round((cx + r * math.cos(math.pi / 3 * k)) * s),
         round((cy + r * math.sin(math.pi / 3 * k)) * s)]
        for k in range(6)
    ], dtype=np.int32)

# ── layer-shift vectors (same geometry as hexagons_to_svg.py) ────────────────
# Upper-right and upper-left vertices of a flat-top hex at the origin.
_S1 = ( SR / 2, -SR * math.sqrt(3) / 2)
_S2 = (-SR / 2, -SR * math.sqrt(3) / 2)
# ── wave precomputation ───────────────────────────────────────────────────────
# Project each hex onto the wave axis (horizontal) and normalise to 0..1.
# sin(2*pi*(t - spatial)) completes exactly one cycle per DURATION and is
# identical at t=0 and t=1, so the loop is seamless.
_proj    = [h['x'] for h in hexes]
_proj_lo = min(_proj) if _proj else 0.0
_proj_hi = max(_proj) if _proj else 1.0
_proj_span = (_proj_hi - _proj_lo) or 1.0
_hex_spatial = [(_proj[i] - _proj_lo) / _proj_span for i in range(len(hexes))]

# ── pulse path precomputation ─────────────────────────────────────────────────
# Find the longest simple path through the network using greedy DFS from every
# starting node (fixed seed so the path is stable across renders).
def _find_path(seed=0):
    adj = [[] for _ in range(len(nodes))]
    for e in edges:
        adj[e[0]].append(e[1])
        adj[e[1]].append(e[0])
    rng  = _rnd.Random(seed)
    best = []
    for start in range(len(nodes)):
        visited = [False] * len(nodes)
        path    = [start]
        visited[start] = True
        while True:
            nbs = [n for n in adj[path[-1]] if not visited[n]]
            if not nbs:
                break
            nxt = rng.choice(nbs)
            path.append(nxt)
            visited[nxt] = True
        if len(path) > len(best):
            best = path[:]
    return best

_pulse_path = _find_path()
_pulse_segs = []       # (screen_pa, screen_pb, length)
_pulse_cuml = [0.0]   # cumulative lengths, one entry per node in path
for _i in range(len(_pulse_path) - 1):
    _pa = scr(nodes[_pulse_path[_i    ]]['x'], nodes[_pulse_path[_i    ]]['y'])
    _pb = scr(nodes[_pulse_path[_i + 1]]['x'], nodes[_pulse_path[_i + 1]]['y'])
    _pulse_segs.append((_pa, _pb, math.hypot(_pb[0]-_pa[0], _pb[1]-_pa[1])))
    _pulse_cuml.append(_pulse_cuml[-1] + _pulse_segs[-1][2])
_pulse_total = _pulse_cuml[-1]

def _path_point(dist):
    """Return (x, y) at cumulative distance dist along the pulse path."""
    dist = max(0.0, min(dist, _pulse_total))
    for i, (pa, pb, seg_len) in enumerate(_pulse_segs):
        if dist <= _pulse_cuml[i + 1]:
            u = (dist - _pulse_cuml[i]) / seg_len if seg_len > 0 else 0.0
            return pa[0] + (pb[0] - pa[0]) * u, pa[1] + (pb[1] - pa[1]) * u
    pb = _pulse_segs[-1][1]
    return float(pb[0]), float(pb[1])

# ── layer 1: hex tiles with wave ─────────────────────────────────────────────
def draw_hexes(img: np.ndarray, t: float) -> None:
    """3-layer hex tiles (like hexagons_to_svg.py) floating on the wave.

    Each tile is rendered as three overlapping copies: the base at (0,0) plus
    two ghost copies shifted toward the upper-right and upper-left vertices.
    Ghost copies are pre-composited at the hex's stored alpha onto the
    background, mimicking SVG fill-opacity.  All three copies share the same
    wave dy so the whole stacked tile floats as one unit.

    Draw order: all ghosts first (behind), then all base tiles on top.
    """
    DISP       = SR * 0.18   # max vertical displacement (fraction of tile radius)
    AMP        = 0.05        # subtle brightness lift at peak
    SCALE_AMP  = 0.08        # ±8 % size change between wave peak and trough

    # Precompute per-hex screen position and colours for both passes.
    # dy is kept as a float; hex_pts_sp handles sub-pixel precision.
    tiles = []
    for i, h in enumerate(hexes):
        wave_val    = math.sin(2 * math.pi * (t - _hex_spatial[i]))
        dy          = -DISP * wave_val
        brightness  = 1.0 + AMP * wave_val
        size_scale  = 1.0 + SCALE_AMP * wave_val   # bigger at peak, smaller at trough
        a           = h.get('alpha', 0.12)
        r, g, b     = (demix(c, a) for c in h['color'])
        r2 = min(255, max(0, round(r * brightness)))
        g2 = min(255, max(0, round(g * brightness)))
        b2 = min(255, max(0, round(b * brightness)))
        sx, sy = scr(h['x'], h['y'])
        tiles.append((sx, sy + dy, r2, g2, b2, a, size_scale))

    # Pass 1: ghost copies — real alpha blend so overlapping hexes show through.
    # Each shift gets an independent lighten factor: 0 = base colour, 1 = white.
    for (sx, sy, r2, g2, b2, a, size_scale) in tiles:
        for (lx, ly), lighten in ((_S2, LIGHTEN_UL), (_S1, LIGHTEN_UR)):
            lr = min(255, round(r2 + (255 - r2) * lighten))
            lg = min(255, round(g2 + (255 - g2) * lighten))
            lb = min(255, round(b2 + (255 - b2) * lighten))
            overlay = img.copy()
            pts = hex_pts_sp(sx + lx, sy + ly, SR * 0.96 * size_scale)
            cv2.fillConvexPoly(overlay, pts, (lb, lg, lr), cv2.LINE_AA, _SUBPIX)
            cv2.addWeighted(overlay, a, img, 1.0 - a, 0, img)

    # Pass 2: base tiles — also alpha-blended, same approach as ghost copies.
    for (sx, sy, r2, g2, b2, a, size_scale) in tiles:
        overlay = img.copy()
        pts = hex_pts_sp(sx, sy, SR * 0.96 * size_scale)
        cv2.fillConvexPoly(overlay, pts, (b2, g2, r2), cv2.LINE_AA, _SUBPIX)
        cv2.addWeighted(overlay, a, img, 1.0 - a, 0, img)

# ── layer 2: network edges and nodes ─────────────────────────────────────────
def draw_network(img: np.ndarray) -> None:
    for e in edges:
        pa = scr(nodes[e[0]]['x'], nodes[e[0]]['y'])
        pb = scr(nodes[e[1]]['x'], nodes[e[1]]['y'])
        cv2.line(img, pa, pb, (165, 148, 133), EDGE_W, cv2.LINE_AA)
    for n in nodes:
        sx, sy = scr(n['x'], n['y'])
        r, g, b = n['color']
        if n['filled']:
            cv2.circle(img, (sx, sy), NR, (b, g, r), -1, cv2.LINE_AA)
            cv2.circle(img, (sx, sy), NR, (165, 148, 133), 1, cv2.LINE_AA)
        else:
            cv2.circle(img, (sx, sy), NR, (242, 240, 238), -1, cv2.LINE_AA)
            cv2.circle(img, (sx, sy), NR, (165, 148, 133),
                       max(1, round(SR * 0.018)), cv2.LINE_AA)

# ── layer 3: energy pulse along the network path ──────────────────────────────
def draw_pulse(img: np.ndarray, t: float) -> None:
    """Burning pulse: layered fire glow from red-orange out to white-hot core."""
    pos       = (t * DURATION / PULSE_PERIOD) % 1.0
    head_dist = pos * _pulse_total
    trail_len = 0.035 * _pulse_total   # short cinder trail

    hx, hy   = _path_point(head_dist)
    hxi, hyi = round(hx), round(hy)

    # Subtle radius flicker — frequency must be an integer so the loop is seamless
    flicker = 1.0 + 0.10 * math.sin(2 * math.pi * t * 5)

    # Concentric fire layers: red-orange haze → orange → yellow → hot white
    # (drawn back-to-front so the bright core overwrites the dim haze)
    fire = [
        (2.0, (0,  50, 190), 0.18),   # outer: deep red-orange
        (1.3, (0, 120, 255), 0.30),   # orange
        (0.7, (10, 210, 255), 0.50),  # yellow
        (0.35,(160, 245, 255), 0.72), # near-white yellow
    ]
    for rf, color, alpha in fire:
        glow = img.copy()
        cv2.circle(glow, (hxi, hyi), max(1, round(NR * rf * flicker)),
                   color, -1, cv2.LINE_AA)
        cv2.addWeighted(glow, alpha, img, 1.0 - alpha, 0, img)

    # Cinder trail: blends from background → orange → yellow toward the head
    STEPS = 16
    for step in range(STEPS + 1):
        frac   = step / STEPS
        d      = head_dist - (1.0 - frac) * trail_len
        if d < 0.0:
            continue
        px, py = _path_point(d)
        # Two-segment colour ramp: BG→orange (lower half), orange→yellow (upper half)
        if frac < 0.5:
            t2  = frac * 2.0
            col = tuple(round(BG[j] + ([0, 120, 255][j] - BG[j]) * t2**2) for j in range(3))
        else:
            t2  = (frac - 0.5) * 2.0
            col = tuple(round([0, 120, 255][j] + ([10, 210, 255][j] - [0, 120, 255][j]) * t2)
                        for j in range(3))
        radius = max(1, round(NR * (0.06 + 0.22 * frac)))
        cv2.circle(img, (round(px), round(py)), radius, col, -1, cv2.LINE_AA)

    # Pure white pinpoint core
    cv2.circle(img, (hxi, hyi), max(1, round(NR * 0.22)), (255, 255, 255), -1, cv2.LINE_AA)

# ── frame composer ────────────────────────────────────────────────────────────
def draw_frame(t: float) -> np.ndarray:
    img = np.full((H, W, 3), BG, dtype=np.uint8)
    draw_hexes(img, t)     # bottom: tiles with wave
    draw_network(img)      # middle: edges and nodes
    draw_pulse(img, t)     # top: energy pulse along network path
    return img

# ── encode ────────────────────────────────────────────────────────────────────
# Pipe raw BGR frames to ffmpeg for proper H.264 encoding.
# CRF 32 targets a low bitrate suitable for Teams animated backgrounds (~1 MB).
# Raise CRF for smaller files (max ~51) or lower it for higher quality (min 0).
CRF = 20

total = FPS * DURATION
print(f'Rendering {DURATION}s  {W}x{H}  {FPS} fps  CRF={CRF}  ->  {OUTPUT}')

if not shutil.which('ffmpeg'):
    sys.exit('Error: ffmpeg not found on PATH.')

ffmpeg_cmd = [
    'ffmpeg', '-y',
    '-f', 'rawvideo', '-vcodec', 'rawvideo',
    '-s', f'{W}x{H}', '-pix_fmt', 'bgr24', '-r', str(FPS),
    '-i', 'pipe:',
    '-vcodec', 'libx264', '-crf', str(CRF),
    '-pix_fmt', 'yuv420p',
    '-movflags', 'faststart',
    OUTPUT,
]
proc = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

for f in range(total):
    proc.stdin.write(draw_frame(f / total).tobytes())
    if f % FPS == 0:
        print(f'  {f // FPS:2d}/{DURATION}s', end='\r', flush=True)

proc.stdin.close()
proc.wait()
if proc.returncode != 0:
    sys.exit(f'ffmpeg exited with code {proc.returncode}')

size_mb = os.path.getsize(OUTPUT) / 1e6
print(f'\nDone.  {OUTPUT}  ({size_mb:.1f} MB)')

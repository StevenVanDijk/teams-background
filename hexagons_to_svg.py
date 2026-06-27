import json
import math
import sys


def hex_points(cx, cy, R):
    return [
        (cx + R * math.cos(math.pi / 3 * i),
         cy + R * math.sin(math.pi / 3 * i))
        for i in range(6)
    ]


def points_attr(pts):
    return ' '.join(f'{x:.2f},{y:.2f}' for x, y in pts)


def demix(channel, alpha):
    """Recover original colour assuming composited on white at given opacity."""
    return max(0, min(255, round(255 + (channel - 255) / alpha)))


alpha_arg = None
for arg in sys.argv[1:]:
    try:
        alpha_arg = float(arg)
    except ValueError:
        pass

with open('hexagons.json') as f:
    data = json.load(f)

W, H = data['tileGrid']['imageDimensions']
R = data['tileGrid']['radius']
hexes = data['hexes']

# Shift vectors: one side length toward the upper-right and upper-left vertices.
# With a flat-top hexagon (top edge horizontal), these vertices sit at ±30° from
# straight up, i.e. (±R/2, -R√3/2) in screen coords (y increases downward).
shift1 = ( R / 2, -R * math.sqrt(3) / 2)   # toward upper-right vertex
shift2 = (-R / 2, -R * math.sqrt(3) / 2)   # toward upper-left vertex
layers = [(0, 0), shift1, shift2]

svg = []
svg.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">')
svg.append(f'  <rect width="{W}" height="{H}" fill="white"/>')

for i, (tx, ty) in enumerate(layers):
    for h in hexes:
        if i == 0:
            # Base layer: render the exact sampled colour from the JSON at full opacity
            r, g, b = h['color']
            opacity = ''
        elif alpha_arg is not None:
            r, g, b = (demix(c, alpha_arg) for c in h['color'])
            opacity = f' fill-opacity="{alpha_arg}"'
        else:
            r, g, b = h['color']
            opacity = ''
        pts = hex_points(h['x'] + tx, h['y'] + ty, R)
        svg.append(
            f'  <polygon points="{points_attr(pts)}"'
            f' fill="rgb({r},{g},{b})"'
            f'{opacity}'
            f' stroke="none"/>'
        )

svg.append('</svg>')

output = 'hexagons.svg'
with open(output, 'w') as f:
    f.write('\n'.join(svg))

label = f'alpha={alpha_arg}, 3 layers' if alpha_arg is not None else 'raw colours'
print(f'Wrote {len(hexes) * len(layers)} polygons to {output} ({W}x{H}, {label})')

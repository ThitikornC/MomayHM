#!/usr/bin/env python3
"""
Generate per-floor colored heatmap SVG files.
Computes rhombus cell positions from the actual grid line intersections
in HeatmapgridFloor1.svg, then fills each cell with a heatmap color.
Output: HeatmapColorFloor1.svg … HeatmapColorFloor6.svg
"""

import math, re, os

# ── Original SVG path data ─────────────────────────────────────────────────
PATH_DATA = (
    "M47.3526 1607.01L1631.85 21.9516M96.3083 1630.61L1680.35 45.7502"
    "M145.353 1647.61L1724.85 67.6064M186.353 1674L1770.35 89.9126"
    "M232.353 1696.17L1815.43 112.031M273.853 1716.16L1851.52 137.94"
    "M313.353 1735.2L1897.94 152.519M358.353 1756.89L1934.05 178.245"
    "M403.853 1778.81L1984.81 195.147M449.079 1800.61L2031.77 218.189"
    "M494.353 1822.42L2077.39 240.572M544.853 1846.76L2125.35 267.606"
    "M593.853 1870.37L2176 288.96M647.658 1896.3L2229 314.965"
    "M698.094 1920.61L2280.35 340.106M752.929 1947.03L2333.65 366.316"
    "M807.353 1973.26L2385.85 391.934M859.853 1998.56L2440.35 418.677"
    "M912.87 2024.11L2491.35 443.703M970.973 2052.11L1452.85 1568.11"
    "M1025.96 2078.61L1510.35 1595.43M1081.85 2105.54L1564.85 1622.61"
    "M1138.27 2132.73L1622.35 1648.65M1193.9 2156.02L1675.85 1674.07"
    "M1247.35 2185.29L1732.85 1701.16M1303.85 2212.52L1787.35 1729.61"
    "M1366.35 2242.64L1847.85 1761.11M1429.85 2273.24L1910.85 1792.11"
    "M1490.35 2302.4L1973.85 1818.61M1557.98 2334.98L2046.85 1846.11"
    "M1627.85 2368.11L2109.85 1886.11"
    "M2510.85 500.606L2545.16 470.106L1588.35 0.606445L1553.28 35.6064"
    "L0.852539 1584.61L1685.85 2396.61L2177.85 1912.61L1452.85 1568.11"
    "M1452.85 1568.11L2510.85 500.606M2510.85 500.606L1553.28 35.6064"
    "M2478.78 532.606L1521.21 67.6064M2445.94 566.106L1493.45 95.9737"
    "M2414.35 596.96L1461.85 126.827M2385.85 626.728L1433.36 156.596"
    "M2351.85 659.323L1399.35 189.19M2322.78 688.322L1370.29 218.189"
    "M2291.34 719.689L1338.85 249.556M2259.85 753.859L1307.36 283.726"
    "M2229 784.995L1276.5 314.862M2195.35 814.106L1242.86 343.974"
    "M2168.92 845.606L1216.43 375.474M2140.18 874.606L1187.69 404.474"
    "M2108.96 906.106L1156.47 435.974M2070.31 940.239L1117.82 470.106"
    "M2042.35 973.311L1089.86 503.178M2021.85 1001.61L1069.36 531.474"
    "M1978.62 1030.34L1021.05 565.336M1946.55 1062.34L988.975 597.336"
    "M1913.71 1095.84L961.216 625.703M1882.11 1126.69L929.623 656.557"
    "M1853.62 1156.46L901.133 686.325M1819.61 1189.05L867.123 718.919"
    "M1790.55 1218.05L838.06 747.918M1759.11 1249.42L806.623 779.286"
    "M1727.62 1283.59L775.133 813.456M1696.77 1314.72L744.275 844.592"
    "M1663.12 1343.84L710.633 873.703M1636.69 1375.34L684.202 905.203"
    "M1607.95 1404.34L655.46 934.203M1576.73 1435.84L624.24 965.703"
    "M1538.08 1469.97L585.586 999.836M1510.12 1503.04L557.633 1032.91"
    "M1479.46 1529.5L521.883 1064.5M1447.39 1561.5L489.812 1096.5"
    "M2142.86 1947.04L462.053 1124.87M2111.26 1977.89L430.461 1155.72"
    "M2082.77 2007.66L401.97 1185.49M2048.76 2040.25L367.961 1218.08"
    "M2019.7 2069.25L338.898 1247.08M1988.26 2100.62L307.461 1278.45"
    "M1956.77 2134.79L275.97 1312.62M1925.91 2165.93L245.112 1343.76"
    "M1892.27 2195.04L211.47 1372.87M1865.84 2226.54L185.039 1404.37"
    "M1837.1 2255.54L156.297 1433.37M1805.88 2287.04L125.077 1464.87"
    "M1767.23 2321.17L86.4231 1499M1739.27 2354.24L58.4703 1532.07"
)

# ── Boundary polygon (L-shaped floor) ─────────────────────────────────────
BOUNDARY = [
    (2510.85, 500.606), (2545.16, 470.106), (1588.35, 0.606),
    (1553.28, 35.606),  (0.852,  1584.61),  (1685.85, 2396.61),
    (2177.85, 1912.61), (1452.85, 1568.11),
]

# ── Heat palette: index 0 = cold (blue), index 14 = hot (red) ──────────────
PALETTE = [
    '#000066','#0000cc','#0033ff','#0077ff','#00aaff',
    '#00ddcc','#00cc88','#44dd00','#aaee00','#ffff00',
    '#ffcc00','#ff8800','#ff4400','#ff0000','#cc0000',
]

# ── Helpers ────────────────────────────────────────────────────────────────

def parse_segments(data):
    """Return list of (x1,y1, x2,y2) for every M…L segment."""
    return [
        (float(g[0]), float(g[1]), float(g[2]), float(g[3]))
        for g in re.findall(
            r'M\s*([\d.]+)\s+([\d.]+)\s*L\s*([\d.]+)\s+([\d.]+)', data
        )
    ]

def intersect(x1, y1, dx1, dy1, x2, y2, dx2, dy2):
    """Intersection of two parametric lines. Returns (x,y) or None."""
    det = dx1 * (-dy2) - dy1 * (-dx2)
    if abs(det) < 1e-8:
        return None
    s = ((x2 - x1) * (-dy2) - (y2 - y1) * (-dx2)) / det
    return (x1 + s * dx1, y1 + s * dy1)

def inside_polygon(px, py, poly):
    """Ray-casting point-in-polygon test."""
    n, inside = len(poly), False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

def cell_color(row, col, floor_idx):
    """Deterministic per-cell heatmap color."""
    base = 1.0 - floor_idx / 5.0      # floor 0 = hot, floor 5 = cold
    n = (math.sin(row * 7.31 + col * 3.79 + floor_idx * 2.13)
       * math.cos(row * 2.17 - col * 5.41 + floor_idx * 0.91) + 1.0) / 2.0
    heat = max(0.0, min(1.0, base * 0.75 + n * 0.5 - 0.05))
    return PALETTE[round(heat * (len(PALETTE) - 1))]

# ── Classify grid lines ────────────────────────────────────────────────────

all_segs = parse_segments(PATH_DATA)

set_a = []  # direction ≈ (+1, -1) — row separators
set_b = []  # direction ≈ (-2, -1) — column separators

for x1, y1, x2, y2 in all_segs:
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy)
    if length < 300:          # skip short boundary edges
        continue
    slope_abs = abs(dy / dx) if dx else float('inf')
    if dx > 0 and dy < 0 and 0.7 < slope_abs < 1.3:
        set_a.append((x1, y1, dx, dy))
    elif dx < 0 and 0.35 < slope_abs < 0.65:
        set_b.append((x1, y1, dx, dy))

# Sort Set A: by (x1+y1) ascending → leftmost/bottom-most line first
# For line y = -x + c, c = x1+y1; larger c = further up-right
set_a.sort(key=lambda l: l[0] + l[1])

# Sort Set B: by y-intercept at x=0 ascending → upper-right column first
def yint_b(l):
    x1, y1, dx, dy = l
    return y1 + (-x1) * (dy / dx)  # y when x=0

set_b.sort(key=yint_b)

print(f"Set A (row separators): {len(set_a)} lines")
print(f"Set B (col separators): {len(set_b)} lines")

# ── Compute intersection grid ───────────────────────────────────────────────

nA, nB = len(set_a), len(set_b)
grid = {}   # (i, j) → (x, y)

for i, la in enumerate(set_a):
    for j, lb in enumerate(set_b):
        pt = intersect(la[0], la[1], la[2], la[3], lb[0], lb[1], lb[2], lb[3])
        if pt:
            grid[(i, j)] = pt

# ── Generate SVG files ─────────────────────────────────────────────────────

OUT_DIR = r"e:\NU_CODE\Personal-Count\Heatmap_cal\frontend\public\Floorplan"
GRID_SVG_PATH = os.path.join(OUT_DIR, "HeatmapgridFloor1.svg")

with open(GRID_SVG_PATH) as f:
    grid_lines_path = re.search(r'<path d="(.*?)"/>', f.read(), re.DOTALL).group(1)

for floor_idx in range(6):
    polys = []
    count = 0

    for r in range(nA - 1):
        for c in range(nB - 1):
            p0 = grid.get((r,   c))      # "left"
            p1 = grid.get((r,   c + 1))  # "top"
            p2 = grid.get((r+1, c + 1))  # "right"
            p3 = grid.get((r+1, c))      # "bottom"
            if not (p0 and p1 and p2 and p3):
                continue
            # Cell center
            cx = (p0[0] + p2[0]) / 2
            cy = (p0[1] + p2[1]) / 2
            if not inside_polygon(cx, cy, BOUNDARY):
                continue
            color = cell_color(r, c, floor_idx)
            pts = ' '.join(f'{p[0]:.2f},{p[1]:.2f}' for p in [p0, p1, p2, p3])
            polys.append(f'  <polygon points="{pts}" fill="{color}"/>')
            count += 1

    # Build L-shaped clip path from the boundary polygon
    boundary_pts = ' '.join(f'{x:.2f},{y:.2f}' for x, y in BOUNDARY)
    svg = (
        '<svg width="2547" height="2398" viewBox="0 0 2547 2398"'
        ' fill="none" xmlns="http://www.w3.org/2000/svg">\n'
        '  <defs>\n'
        '    <clipPath id="floor">\n'
        f'      <polygon points="{boundary_pts}"/>\n'
        '    </clipPath>\n'
        '  </defs>\n'
        '  <!-- white base so colors are visible at any opacity -->\n'
        f'  <polygon points="{boundary_pts}" fill="white"/>\n'
        '  <g clip-path="url(#floor)">\n'
        + '\n'.join(polys) + '\n'
        '  </g>\n'
        f'  <path d="{grid_lines_path}" stroke="#00000033" stroke-width="2"/>\n'
        + '</svg>'
    )

    out_path = os.path.join(OUT_DIR, f"HeatmapColorFloor{floor_idx + 1}.svg")
    with open(out_path, 'w') as f:
        f.write(svg)
    print(f"Floor {floor_idx + 1}: {count} cells → {out_path}")

print("Done.")

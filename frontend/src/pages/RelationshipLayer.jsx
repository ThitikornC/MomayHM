import { useState, useEffect, useRef, useCallback } from 'react'
import { Layers, Users, Zap } from 'lucide-react'
import LayerGreedy from './LayerGreedy.jsx'
import LayerDP from './LayerDP.jsx'

// ── Animated heatmap ───────────────────────────────────────────────────────
const HEAT_PALETTE = [
  '#000066','#0000cc','#0033ff','#0077ff','#00aaff',
  '#00ddcc','#00cc88','#44dd00','#aaee00','#ffff00',
  '#ffcc00','#ff8800','#ff4400','#ff0000','#cc0000',
]

const _clamp01 = v => Math.max(0, Math.min(1, v))

function _pip(px, py, poly) {
  let inside = false, j = poly.length - 1
  for (let i = 0; i < poly.length; i++) {
    const [xi,yi]=poly[i], [xj,yj]=poly[j]
    if ((yi>py)!==(yj>py) && px<(xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside
    j=i
  }
  return inside
}

function _intersect(x1,y1,dx1,dy1, x2,y2,dx2,dy2) {
  const det = dx1*(-dy2) - dy1*(-dx2)
  if (Math.abs(det) < 1e-8) return null
  const s = ((x2-x1)*(-dy2) - (y2-y1)*(-dx2)) / det
  return [x1+s*dx1, y1+s*dy1]
}

function _computeCells(gridPath, boundary) {
  const re = /M\s*([\d.]+)\s+([\d.]+)\s*L\s*([\d.]+)\s+([\d.]+)/g
  const setA = [], setB = []
  let m
  while ((m = re.exec(gridPath)) !== null) {
    const x1=+m[1],y1=+m[2],x2=+m[3],y2=+m[4]
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)
    if (len < 300) continue
    const sa = Math.abs(dy/dx)
    if (dx>0 && dy<0 && sa>0.7 && sa<1.3) setA.push([x1,y1,dx,dy])
    else if (dx<0 && sa>0.35 && sa<0.65)   setB.push([x1,y1,dx,dy])
  }
  setA.sort((a,b) => (a[0]+a[1])-(b[0]+b[1]))
  setB.sort((a,b) => {
    const ya=a[1]+(-a[0])*(a[3]/a[2]), yb=b[1]+(-b[0])*(b[3]/b[2])
    return ya-yb
  })
  const grid = new Map()
  for (let i=0; i<setA.length; i++)
    for (let j=0; j<setB.length; j++) {
      const pt = _intersect(...setA[i], ...setB[j])
      if (pt) grid.set(`${i},${j}`, pt)
    }
  const out = []
  for (let r=0; r<setA.length-1; r++)
    for (let c=0; c<setB.length-1; c++) {
      const p0=grid.get(`${r},${c}`),   p1=grid.get(`${r},${c+1}`)
      const p2=grid.get(`${r+1},${c+1}`), p3=grid.get(`${r+1},${c}`)
      if (!p0||!p1||!p2||!p3) continue
      const cx=(p0[0]+p2[0])/2, cy=(p0[1]+p2[1])/2
      if (_pip(cx,cy,boundary)) out.push([r,c,...p0,...p1,...p2,...p3])
    }
  return out
}

function _buildCellZoneMap(cells) {
  if (!cells.length) return new Map()

  function axisGroups(kind) {
    const groups = new Map()
    for (const cell of cells) {
      const [r, c, x0, y0, x1, y1, x2, y2, x3, y3] = cell
      const key = kind === 'r' ? r : c
      const cy = (y0 + y1 + y2 + y3) / 4
      const g = groups.get(key) ?? { sumY: 0, count: 0 }
      g.sumY += cy
      g.count += 1
      groups.set(key, g)
    }
    const items = [...groups.entries()].map(([key, g]) => ({ key, avgY: g.sumY / g.count }))
    const spread = items.length ? Math.max(...items.map(i => i.avgY)) - Math.min(...items.map(i => i.avgY)) : 0
    return { items, spread }
  }

  const byR = axisGroups('r')
  const byC = axisGroups('c')
  const axis = byC.spread > byR.spread ? 'c' : 'r'
  const axisItems = (axis === 'c' ? byC.items : byR.items).sort((a, b) => b.avgY - a.avgY) // front (near viewer) -> back

  const aEnd = Math.max(1, Math.floor(axisItems.length / 3))
  const bEnd = Math.max(aEnd + 1, Math.floor((axisItems.length * 2) / 3))
  const bandZone = new Map()
  axisItems.forEach((it, i) => {
    bandZone.set(it.key, i < aEnd ? 'A' : i < bEnd ? 'B' : 'C')
  })

  const cellZone = new Map()
  for (const cell of cells) {
    const [r, c] = cell
    const bandKey = axis === 'c' ? c : r
    cellZone.set(`${r},${c}`, bandZone.get(bandKey) ?? 'B')
  }
  return cellZone
}

// ── Per-floor seeds — each floor is truly independent ─────────────────────
// (different frequencies + starting phase → no visual correlation between floors)
const FLOOR_SEEDS = [
  { fa:0.28, fb:0.21, fc:0.14, fd:0.33, fe:0.09, t0:0.0  },
  { fa:0.31, fb:0.17, fc:0.19, fd:0.27, fe:0.13, t0:41.7 },
  { fa:0.22, fb:0.25, fc:0.11, fd:0.38, fe:0.07, t0:83.2 },
  { fa:0.35, fb:0.18, fc:0.16, fd:0.29, fe:0.11, t0:17.5 },
  { fa:0.19, fb:0.30, fc:0.23, fd:0.21, fe:0.15, t0:62.4 },
  { fa:0.26, fb:0.23, fc:0.12, fd:0.31, fe:0.08, t0:55.1 },
]

const ZONE_PROFILES = {
  A: { center: 0.55, amp: 0.24, wave: 0.04, drift: 0.90 },
  B: { center: 0.69, amp: 0.20, wave: 0.04, drift: 1.00 },
  C: { center: 0.88, amp: 0.15, wave: 0.03, drift: 1.12 },
}

// Fetch SVG once → parse exact boundary polygon + grid lines → compute cells
const _CELLS_PROMISE = fetch('/Floorplan/HeatmapgridFloor1.svg')
  .then(r => r.text())
  .then(text => {
    // SVG has two <path d="...">: [0] = L-shape fill polygon, [1] = grid lines
    const paths = [...text.matchAll(/\bd="([^"]+)"/g)]
    // Parse full boundary polygon from the fill path (M x y L x y ... Z)
    const boundary = [...(paths[0]?.[1] ?? '').matchAll(/[ML]\s*([\d.]+)\s+([\d.]+)/g)]
      .map(m => [+m[1], +m[2]])
    const gridPath = paths[1]?.[1] ?? ''
    return _computeCells(gridPath, boundary)
  })

// ─────────────────────────────────────────────────────────────────────────────
// HeatmapAnimatedCanvas
//
// Props:
//   floorIdx  — 0-based floor index
//   apiValues — Float32Array | null
//               null  → animated mock data (each floor independent)
//               array → real data: one value per cell, normalized 0..1
//                       (set from API response when ready)
//   opacity   — SVG overlay opacity
// ─────────────────────────────────────────────────────────────────────────────
function HeatmapAnimatedCanvas({ floorIdx, apiValues = null, opacity }) {
  const [cells, setCells] = useState([])
  const polyRefs = useRef([])
  const raf = useRef(null)
  const simRef = useRef(null)
  // Use ref so animation loop always reads latest API data without restarting
  const apiRef = useRef(apiValues)
  useEffect(() => { apiRef.current = apiValues }, [apiValues])

  // Load cells once (shared promise — all floors reuse same grid geometry)
  useEffect(() => {
    _CELLS_PROMISE.then(setCells)
  }, [])

  // Animation loop — restarts only when cells or floorIdx changes
  useEffect(() => {
    if (!cells.length) return
    const seed = FLOOR_SEEDS[floorIdx] ?? FLOOR_SEEDS[0]
    const cellZone = _buildCellZoneMap(cells)
    const rowVals = [...new Set(cells.map(([r]) => r))]
    const colVals = [...new Set(cells.map(([,c]) => c))]
    const minR = Math.min(...rowVals), maxR = Math.max(...rowVals)
    const minC = Math.min(...colVals), maxC = Math.max(...colVals)

    simRef.current = {
      zones: {
        A: 0.44 + floorIdx * 0.01,
        B: 0.62 + floorIdx * 0.008,
        C: 0.79 + floorIdx * 0.006,
      },
      cellNoise: cells.map((_, i) =>
        Math.sin((i + 3) * 12.9898 + (floorIdx + 1) * 78.233) * 0.5 + 0.5
      ),
      minR, maxR, minC, maxC,
    }

    let t = seed.t0
    let running = true
    function draw() {
      t += 0.013
      const ext = apiRef.current   // real API data (null while not yet available)
      const sim = simRef.current
      const hasCellPayload = !!(ext && (Array.isArray(ext) || ArrayBuffer.isView(ext)))
      const zonePayload = ext && !Array.isArray(ext) && !ArrayBuffer.isView(ext) ? (ext.zones ?? ext) : null
      const hasZonePayload = !!(zonePayload && ['A', 'B', 'C'].some(k => Number.isFinite(zonePayload[k])))
      const isCellPayloadSparse = (() => {
        if (!hasCellPayload) return false
        const n = Math.min(cells.length, ext.length ?? 0)
        if (n <= 0) return true
        let count = 0, nonZero = 0, sum = 0
        for (let i = 0; i < n; i++) {
          const v = Number(ext[i])
          if (!Number.isFinite(v)) continue
          const vv = _clamp01(v)
          sum += vv
          count += 1
          if (vv > 0.03) nonZero += 1
        }
        if (count === 0) return true
        return (sum / count) < 0.08 || (nonZero / count) < 0.08
      })()

      if (!ext && sim) {
        // Camera-like behavior: zones drift slowly and react like occupancy waves.
        const pulse1 = Math.max(0, Math.sin(t * 0.22 + floorIdx * 0.7))
        const pulse2 = Math.max(0, Math.sin(t * 0.16 + 1.8 + floorIdx * 0.55))
        const targets = {
          A: _clamp01(0.40 + 0.18 * pulse1 + 0.07 * Math.sin(t * 0.41 + 0.5)),
          B: _clamp01(0.58 + 0.16 * pulse2 + 0.05 * Math.sin(t * 0.37 + 1.1)),
          C: _clamp01(0.76 + 0.12 * pulse1 + 0.04 * Math.sin(t * 0.29 + 2.2)),
        }
        const follow = 0.05
        sim.zones.A += (targets.A - sim.zones.A) * follow
        sim.zones.B += (targets.B - sim.zones.B) * follow
        sim.zones.C += (targets.C - sim.zones.C) * follow
      }

      for (let idx = 0; idx < cells.length; idx++) {
        let h
        if (hasCellPayload && !zonePayload && !isCellPayloadSparse) {
          // ── REAL DATA: value already normalized 0..1 ──────────────────
          // TODO: replace mock with: const res = await fetch(`/api/heatmap/floor/${floorIdx}`)
          //       then setFloorApiData(floorIdx, new Float32Array(res.json().values))
          h = _clamp01(ext[idx] ?? 0)
        } else if (hasZonePayload || sim) {
          // Zone payload path (ready for camera API): { A:0..1, B:0..1, C:0..1 } or { zones:{...} }
          const [r, c] = cells[idx]
          const zone = cellZone.get(`${r},${c}`) ?? 'B'
          const srcZones = hasZonePayload ? {
            A: _clamp01(Number.isFinite(zonePayload.A) ? zonePayload.A : sim.zones.A),
            B: _clamp01(Number.isFinite(zonePayload.B) ? zonePayload.B : sim.zones.B),
            C: _clamp01(Number.isFinite(zonePayload.C) ? zonePayload.C : sim.zones.C),
          } : sim.zones

          const nr = sim.maxR === sim.minR ? 0 : (r - sim.minR) / (sim.maxR - sim.minR)
          const nc = sim.maxC === sim.minC ? 0 : (c - sim.minC) / (sim.maxC - sim.minC)
          const travel = Math.sin((nr * 6.2 - t * 1.35) + nc * 1.8 + floorIdx * 0.35) * 0.05
          const swirl = Math.cos((nc * 8.4 + t * 0.95) - nr * 2.1) * 0.04
          const grain = (sim.cellNoise[idx] - 0.5) * 0.035
          h = _clamp01(srcZones[zone] + travel + swirl + grain)

          // Keep floor 1 readable if API for this floor is sparse/incomplete.
          if (floorIdx === 0 && (!hasZonePayload && (!hasCellPayload || isCellPayloadSparse))) {
            h = _clamp01(h + 0.08)
          }
        } else {
          // Fallback legacy mock.
          const [r, c] = cells[idx]
          const zone = cellZone.get(`${r},${c}`) ?? 'B'
          const zp = ZONE_PROFILES[zone]
          const base = (
            Math.sin(r*seed.fa + c*seed.fb + t)      * 0.40 +
            Math.cos(r*seed.fc - c*seed.fd + t*1.3)  * 0.35 +
            Math.sin((r-c)*seed.fe + t*0.75)          * 0.25 + 1
          ) / 2
          const zoneWave = Math.sin((r + c) * 0.08 + t * zp.drift) * zp.wave
          h = _clamp01(zp.center + (base - 0.5) * zp.amp + zoneWave)
        }

        if (!Number.isFinite(h)) h = 0.55
        if (floorIdx === 0) h = Math.max(h, 0.20)
        const poly = polyRefs.current[idx]
        if (poly) {
          const paletteIdx = Math.max(0, Math.min(HEAT_PALETTE.length - 1, Math.round(h * (HEAT_PALETTE.length - 1))))
          poly.setAttribute('fill', HEAT_PALETTE[paletteIdx])
        }
      }
      if (running) raf.current = requestAnimationFrame(draw)
    }
    draw()
    return () => { running = false; cancelAnimationFrame(raf.current) }
  }, [cells, floorIdx])

  // Inline SVG — same viewBox as the source SVG → exact coordinate match, no scaling
  return (
    <svg
      viewBox="0 0 2547 2398"
      style={{
        position:'absolute', top:0, left:0,
        width:'100%', height:'100%',
        transform:'translateX(2%) translateY(9%)',
        pointerEvents:'none',
        opacity, transition:'opacity 0.4s ease',
        mixBlendMode:'multiply',
        overflow:'visible',
      }}
    >
      {cells.map(([r,c,x0,y0,x1,y1,x2,y2,x3,y3], idx) => (
        <polygon
          key={`${r}-${c}`}
          ref={el => { polyRefs.current[idx] = el }}
          points={`${x0},${y0} ${x1},${y1} ${x2},${y2} ${x3},${y3}`}
          fill="transparent"
        />
      ))}
    </svg>
  )
}

// ── 8-bit pixel skeleton (shown while floor images load) ────────────────────
function PixelSkeleton({ show }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 50,
        transition: 'opacity 0.7s ease',
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        overflow: 'hidden',
        borderRadius: 4,
      }}
    >
      {/* Checkerboard pixel background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'repeating-conic-gradient(#17031d 0% 25%, #0b0213 0% 50%)',
        backgroundSize: '8px 8px',
      }}/>
      {/* Scan line sweep */}
      <div className="pixel-scan" style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 0%, rgba(217,70,239,0.18) 50%, transparent 100%)',
        backgroundSize: '100% 60px',
      }}/>
      {/* Floor placeholder bars */}
      {[0,1,2,3,4,5].map(i => (
        <div key={i} style={{
          position: 'absolute',
          left: '8%',
          top: `${10 + i * 14}%`,
          width: '84%',
          height: '9%',
          backgroundImage: 'repeating-conic-gradient(#25063a 0% 25%, #160330 0% 50%)',
          backgroundSize: '4px 4px',
          border: '1px solid rgba(217,70,239,0.3)',
        }}/>
      ))}
      {/* 8-bit loading text */}
      <div className="pixel-blink" style={{
        position: 'absolute', bottom: 10, left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize: 10,
        color: '#d946ef',
        letterSpacing: 4,
        textShadow: '0 0 6px rgba(217,70,239,0.8)',
        whiteSpace: 'nowrap',
      }}>
        ▓ LOADING ▓
      </div>
    </div>
  )
}

const FLOORS = [
  { id: 1, img: '/Floorplan/Floor1plan.png', heatmap: '/Floorplan/HeatmapgridFloor1.svg' },
  { id: 2, img: '/Floorplan/Floor2plan.png', heatmap: '/Floorplan/HeatmapgridFloor2.svg' },
  { id: 3, img: '/Floorplan/Floor3plan.png', heatmap: '/Floorplan/HeatmapgridFloor3.svg' },
  { id: 4, img: '/Floorplan/Floor4plan.png', heatmap: '/Floorplan/HeatmapgridFloor4.svg' },
  { id: 5, img: '/Floorplan/Floor5plan.png', heatmap: '/Floorplan/HeatmapgridFloor5.svg' },
  { id: 6, img: '/Floorplan/Floor6plan.png', heatmap: '/Floorplan/HeatmapgridFloor6.svg' },
]

const FLOOR_TRACK_PRESET = {
  1: { people: 41 },
  2: { people: 49 },
  3: { people: 55 },
  4: { people: 63 },
  5: { people: 70 },
  6: { people: 78 },
}

function getDonutColor(value) {
  const pct = Number(value) || 0
  if (pct >= 85) return '#ef4444'
  if (pct >= 70) return '#f97316'
  if (pct >= 40) return '#f59e0b'
  return '#10b981'
}

function DonutMetric({ color, value, Icon, size = 86 }) {
  const svgSize = 100
  const ringSize = size

  return (
    <div
      style={{
        width: size + 6,
        height: size + 6,
        position: 'relative',
        filter: `drop-shadow(0 0 8px ${color}66)`,
      }}
    >
      <svg viewBox="0 0 100 100" width={size + 6} height={size + 6} style={{ display: 'block' }}>
        <circle cx="50" cy="50" r="48" fill="#051715" className="transition-colors duration-300" />
        <g transform="rotate(-90 50 50)">
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="0" />
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="-56.55" opacity={value >= 25 ? 1 : 0.25} />
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="-113.1" opacity={value >= 50 ? 1 : 0.25} />
          <circle cx="50" cy="50" r="36" fill="none" stroke={color} strokeWidth="7" strokeDasharray="52.55 173.64" strokeDashoffset="-169.65" opacity={value >= 75 ? 1 : 0.25} />
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 0,
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: ringSize * 0.42, height: ringSize * 0.42, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={Math.round(ringSize * 0.34)} color={color} strokeWidth={2.2} style={{ filter: `drop-shadow(0 0 6px ${color}77)` }} />
        </div>
        <div style={{ color: color, fontSize: Math.max(11, Math.round(size * 0.13)), fontWeight: 900, lineHeight: 1, marginTop: -1, textShadow: `0 0 8px ${color}66` }}>
          {value}%
        </div>
      </div>
    </div>
  )
}

function FloorTrackCard({ floorLabel, people, side, donutSize = 86, isSingle = false, connectorLength = 24 }) {
  const color = getDonutColor(people)
  const labelLineOffset = 28
  const labelVerticalOffset = -6
  const labelStyle = side === 'left'
    ? { position: 'absolute', top: '50%', transform: `translateY(calc(-50% + ${labelVerticalOffset}px))`, left: donutSize + labelLineOffset, color: '#d1d5db', fontSize: 10, letterSpacing: 0.5, whiteSpace: 'nowrap' }
    : { position: 'absolute', top: '50%', transform: `translateY(calc(-50% + ${labelVerticalOffset}px))`, right: donutSize + labelLineOffset, color: '#d1d5db', fontSize: 10, letterSpacing: 0.5, textAlign: 'right', whiteSpace: 'nowrap' }

  if (isSingle) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ color: '#d1d5db', fontSize: 10, letterSpacing: 0.5 }}>{floorLabel}</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <DonutMetric color={color} value={people} Icon={Users} size={donutSize} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: donutSize + 6 }}>
      <div style={labelStyle}>{floorLabel}</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
      {side === 'right' && <div style={{ width: connectorLength, height: 1, background: color, opacity: 0.65 }} />}
      <DonutMetric color={color} value={people} Icon={Users} size={donutSize} />
      {side === 'left' && <div style={{ width: connectorLength, height: 1, background: color, opacity: 0.65 }} />}
      </div>
    </div>
  )
}

function TotalTrackCard({ people }) {
  const color = getDonutColor(people)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ color: '#d1d5db', fontSize: 10, letterSpacing: 0.5 }}>Total</div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <DonutMetric color={color} value={people} Icon={Users} size={104} />
      </div>
    </div>
  )
}

// Stage configs
const STAGES = [
  { key: 'stacked',  label: 'ทุกชั้น',    gap: 18,  desc: 'All floors stacked'   },
  { key: 'exploded', label: 'แต่ละชั้น',  gap: 44,  desc: 'Exploded view'        },
  { key: 'single',   label: 'เฉพาะชั้น',  gap: 44,  desc: 'Selected floor only'  },
]

const FLOOR_W   = 180   // px — width of each floor image in the viewer
const IMG_RATIO = 1.0   // PNG images are square (1024×1024)
const TRACK_TOTAL_X = '27%'
const TRACK_TOTAL_Y = '50%'
const TRACK_SPREAD_RIGHT_X = '43%'
const TRACK_LEFT_NUDGE_X = '4%'
const MOBILE_TRACK_LEFT_X = 18
const MOBILE_TRACK_TOP_Y = '19%'
const TRACK_VIEWER_TOP_OFFSET = 24
const TRACK_CONNECTOR_EXPLODED = 'clamp(90px, 11vw, 160px)'
const TRACK_FLOOR_ANCHOR_RATIO = 0.34
const TRACK_FLOOR_Y_NUDGE = -12
const TRACK_LEFT_FLOOR_Y_NUDGE = 80
const TRACK_LEFT_ALL_Y_NUDGE_PX = 0
const TRACK_FLOOR_Y_ADJUST = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
}
const TRACK_LAYOUT = [
  { floorId: 5, side: 'left',  row: 0 },
  { floorId: 6, side: 'right', row: 0 },
  { floorId: 3, side: 'left',  row: 1 },
  { floorId: 4, side: 'right', row: 1 },
  { floorId: 1, side: 'left',  row: 2 },
  { floorId: 2, side: 'right', row: 2 },
]

export default function RelationshipLayer() {
  const [stage, setStage]           = useState('stacked')
  const [selectedFloor, setSelected] = useState(2)   // 0-based index

  // ── API gateway ──────────────────────────────────────────────────────────
  const apiBase = (new URLSearchParams(window.location.search).get('gateway') || import.meta.env.VITE_GATEWAY_URL || '').replace(/\/$/, '')

  // ── Cameras from API ──────────────────────────────────────────────────────
  const [cameras, setCameras] = useState([])
  const abortRef = useRef(null)

  useEffect(() => {
    const fetchCameras = async () => {
      if (!apiBase) return
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()
      try {
        const res = await fetch(apiBase + '/api/cameras', { signal: abortRef.current.signal })
        if (!res.ok) return
        const data = await res.json()
        setCameras(data)
      } catch (e) {
        if (e.name !== 'AbortError') console.warn('cameras fetch error', e)
      }
    }
    fetchCameras()
    const id = setInterval(fetchCameras, 2000)
    return () => { clearInterval(id); if (abortRef.current) abortRef.current.abort() }
  }, [apiBase])

  // ── Per-floor API data (null = use mock animation) ──────────────────────
  // When real API is ready, replace null entries with Float32Array(cells.length)
  // Example fetch:
  //   const res = await fetch(`/api/heatmap/floor/${floorIdx}`)
  //   const { values } = await res.json()  // values: number[] normalized 0..1
  //   setFloorApiData(prev => { const n=[...prev]; n[floorIdx]=new Float32Array(values); return n })
  const [floorApiData] = useState(() => Array(FLOORS.length).fill(null))
  // ────────────────────────────────────────────────────────────────────────

  // Track how many floor plan images have loaded → show skeleton until all ready
  const [loadedCount, setLoadedCount] = useState(0)
  const allLoaded = loadedCount >= FLOORS.length
  const trackRows = [...FLOORS]
    .sort((a, b) => b.id - a.id)
    .map(f => {
      // Try to find a camera with floor ID, fallback to preset
      const floorNum = f.id
      const floorCam = cameras.find(c => {
        const camFloorNum = parseInt(c.id?.split('-')?.[0] || c.id?.charAt(0) || '0')
        return camFloorNum === floorNum
      })
      const people = floorCam ? Math.round((floorCam.total_people || 0) / 5) : FLOOR_TRACK_PRESET[f.id].people
      return {
        floorId: f.id,
        floorLabel: `Floor ${f.id}`,
        people,
      }
    })
  const selectedFloorId = FLOORS[selectedFloor]?.id
  const selectedTrackRow = trackRows.find(row => row.floorId === selectedFloorId) ?? null
  const totalPeople = Math.ceil(trackRows.reduce((sum, row) => sum + row.people, 0) / Math.max(trackRows.length, 1))
  const stackedTracks = trackRows.filter(row => row.floorId !== 0)

  const idleTimer = useRef(null)
  const viewerRef = useRef(null)

  // Reset to stacked after 10s of inactivity (only when not already stacked)
  const resetIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setStage('stacked'), 10000)
  }, [])

  // Non-passive wheel listener so preventDefault() actually stops page scroll
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const onWheel = e => {
      e.preventDefault()
      const dir = e.deltaY > 0 ? -1 : 1
      setSelected(prev => Math.max(0, Math.min(FLOORS.length - 1, prev + dir)))
      setStage('single')
      resetIdle()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [resetIdle])

  // Non-passive touch listener for mobile swipe (vertical swipe = change floor)
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    let startY = 0
    const onTouchStart = e => {
      startY = e.touches[0].clientY
    }
    const onTouchMove = e => {
      e.preventDefault()  // stop page scroll while swiping on image
      const dy = startY - e.touches[0].clientY
      if (Math.abs(dy) > 18) {
        const dir = dy > 0 ? -1 : 1   // swipe up = lower floor index (scroll-natural feel)
        setSelected(prev => Math.max(0, Math.min(FLOORS.length - 1, prev + dir)))
        setStage('single')
        resetIdle()
        startY = e.touches[0].clientY  // reset so each 18px = one step
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
    }
  }, [resetIdle])

  useEffect(() => {
    if (stage !== 'stacked') resetIdle()
    else if (idleTimer.current) clearTimeout(idleTimer.current)
    return () => { if (idleTimer.current) clearTimeout(idleTimer.current) }
  }, [stage, resetIdle])

  const cfg = STAGES.find(s => s.key === stage)

  // Fixed height based on max (exploded) gap — container never resizes
  const imgH      = Math.round(FLOOR_W * IMG_RATIO)
  const numFloors = FLOORS.length
  const MAX_GAP   = 44
  const FIXED_H   = imgH + (numFloors - 1) * MAX_GAP + 32  // constant height
  const totalH    = FIXED_H  // always the same regardless of stage

  // Y position of floor i — stacked is truly centered, other stages keep slight upward bias
  const stackH  = imgH + (numFloors - 1) * cfg.gap   // total visual height of stack
  const topPadShift = stage === 'stacked' ? -10 : -40
  const topPad  = Math.max(8, Math.round((FIXED_H - stackH) / 2) + topPadShift)

  function floorY(i) {
    // floor i=5 (ชั้น 6) at topPad, floor i=0 (ชั้น 1) at topPad + (numFloors-1)*gap
    return topPad + (numFloors - 1 - i) * cfg.gap
  }

  function handleFloorClick(i) {
    if (stage === 'single' && i === selectedFloor) {
      setStage('exploded')  // click same floor → back to exploded (all floors visible)
    } else {
      setSelected(i)
      if (stage === 'exploded') setStage('single')
      // single: just switch selected floor, stay in single mode
    }
  }

  return (
    <div
      className="min-h-screen w-full flex flex-col gap-4 px-2 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8"
      style={{ background: '#030d0c', fontFamily: 'Inter,sans-serif' }}
    >
      {/* ══ Relationship Layer — กรอบบน ══ */}
      <div
        className="w-full rounded-2xl flex flex-col"
        style={{
          border: '2px solid rgba(217,70,239,0.55)',
          background: '#0a020f',
          boxShadow: '0 0 40px rgba(217,70,239,0.12), inset 0 1px 0 rgba(217,70,239,0.1)',
          overflow: 'hidden',
          height: FIXED_H + 104,  // header(~56) + py-4 viewer padding(32) + extra(16)
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(217,70,239,0.2)', background: 'rgba(217,70,239,0.06)' }}
        >
          <div
            className="flex items-center justify-center rounded-lg flex-shrink-0"
            style={{ width: 32, height: 32, background: 'rgba(217,70,239,0.12)', border: '1px solid rgba(217,70,239,0.35)' }}
          >
            <Layers size={16} color="#d946ef" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wider text-white flex flex-wrap items-baseline gap-1.5">
              RELATIONSHIP LAYER
            </h1>
            <p className="text-[10px] font-light mt-0.5" style={{ color: '#d946ef' }}>
              การเชื่อมข้อมูลหลายประเภทเข้าด้วยกัน เพื่ออธิบายเหตุ ผล กระทบ และพฤติกรรมของอาคาร
            </p>
          </div>

        </div>

        {/* ── Floor Plan Viewer ── */}
        <div
          className="relative flex items-center justify-center py-4 px-6"
          style={{ height: FIXED_H + 48 }}
        >
          {stage === 'stacked' ? (
            <div
              className="lg:hidden"
              style={{
                position: 'absolute',
                left: MOBILE_TRACK_LEFT_X,
                top: MOBILE_TRACK_TOP_Y,
                transform: 'translateY(-50%)',
                zIndex: 30,
                pointerEvents: 'none',
              }}
            >
              <TotalTrackCard people={totalPeople} />
            </div>
          ) : stage === 'exploded' ? (
            <div
              className="lg:hidden"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 30,
                pointerEvents: 'none',
              }}
            >
              {TRACK_LAYOUT.map(({ floorId, side, row }) => {
                const trackRow = trackRows.find(r => r.floorId === floorId)
                if (!trackRow) return null
                const topByRow = ['26%', '50%', '74%']
                const mobileTop = side === 'left'
                  ? `calc(${topByRow[row]} + ${TRACK_LEFT_ALL_Y_NUDGE_PX}px)`
                  : topByRow[row]
                return (
                  <div
                    key={`m-${floorId}`}
                    style={{
                      position: 'absolute',
                      left: side === 'left' ? '10%' : '90%',
                      top: mobileTop,
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <FloorTrackCard
                      floorLabel={trackRow.floorLabel}
                      people={trackRow.people}
                      side={side}
                      donutSize={56}
                      isSingle
                    />
                  </div>
                )
              })}
            </div>
          ) : stage !== 'stacked' && selectedTrackRow ? (
            <div
              className="lg:hidden"
              style={{
                position: 'absolute',
                left: MOBILE_TRACK_LEFT_X,
                top: MOBILE_TRACK_TOP_Y,
                transform: 'translateY(-50%)',
                zIndex: 30,
                pointerEvents: 'none',
              }}
            >
              <FloorTrackCard
                floorLabel={selectedTrackRow.floorLabel}
                people={selectedTrackRow.people}
                side="left"
                donutSize={104}
                isSingle
              />
            </div>
          ) : null}

          {(() => {
            const isTotalVisible = stage === 'stacked'
            return (
          <div
            className="hidden lg:flex"
            style={{
              position: 'absolute',
              left: TRACK_TOTAL_X,
              top: TRACK_TOTAL_Y,
              transform: `translate(-50%, -50%) scale(${isTotalVisible ? 1 : 0.28})`,
              opacity: isTotalVisible ? 1 : 0,
              transition: 'opacity 0.32s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            <TotalTrackCard people={totalPeople} />
          </div>
            )
          })()}

          {TRACK_LAYOUT.map(({ floorId, side, row }) => {
            const floor = trackRows.find(r => r.floorId === floorId)
            if (!floor) return null
            const isSingle = stage === 'single'
            const isVisible = isSingle ? floorId === selectedFloorId : stage !== 'stacked'
            const stagger = row * 0.05
            const floorIdx = Math.max(0, Math.min(FLOORS.length - 1, floorId - 1))
            const sideYAdjust = side === 'left' ? TRACK_LEFT_FLOOR_Y_NUDGE + TRACK_LEFT_ALL_Y_NUDGE_PX : 0
            const floorAlignedTopPx =
              TRACK_VIEWER_TOP_OFFSET +
              floorY(floorIdx) +
              Math.round(imgH * TRACK_FLOOR_ANCHOR_RATIO) +
              TRACK_FLOOR_Y_NUDGE +
              sideYAdjust +
              (TRACK_FLOOR_Y_ADJUST[floorId] ?? 0)
            const targetLeft = isSingle
              ? TRACK_TOTAL_X
              : (isVisible
                ? (side === 'right'
                ? `calc(${TRACK_TOTAL_X} + ${TRACK_SPREAD_RIGHT_X})`
                : `calc(100% - (${TRACK_TOTAL_X} + ${TRACK_SPREAD_RIGHT_X}) + ${TRACK_LEFT_NUDGE_X})`)
                : TRACK_TOTAL_X)
            const targetTop = isSingle
              ? TRACK_TOTAL_Y
              : (isVisible
                ? `${floorAlignedTopPx}px`
                : TRACK_TOTAL_Y)
            return (
              <div
                key={`${side}-${floorId}`}
                className="hidden lg:flex"
                style={{
                  position: 'absolute',
                  left: targetLeft,
                  top: targetTop,
                  transform: `translate(-50%, -50%) scale(${isVisible ? 1 : 0.28})`,
                  opacity: isVisible ? 1 : 0,
                  transition: `left 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${stagger}s, top 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${stagger}s, opacity 0.32s ease ${stagger}s, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${stagger}s`,
                  zIndex: 30,
                  pointerEvents: 'none',
                }}
              >
                <FloorTrackCard
                  floorLabel={floor.floorLabel}
                  people={floor.people}
                  side={side}
                  donutSize={isSingle ? 104 : 86}
                  isSingle={isSingle}
                  connectorLength={isSingle ? 24 : TRACK_CONNECTOR_EXPLODED}
                />
              </div>
            )
          })}

          <div ref={viewerRef} className="relative" style={{ width: FLOOR_W, height: FIXED_H }}>
            {/* 8-bit skeleton — fades out once all floor images are loaded */}
            <PixelSkeleton show={!allLoaded} />
            {/* Scale wrapper — enlarges stack in stacked mode; card border stays unchanged */}
            <div style={{
              position: 'absolute', inset: 0,
              transform: stage === 'stacked' ? 'scale(1.55)' : 'scale(1)',
              transition: 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              transformOrigin: '50% 50%',
            }}>
            {/* Render floors bottom (ชั้น 1) first so upper floors overlap correctly */}
            {FLOORS.map((floor, i) => {
              const isSelected  = i === selectedFloor
              const isSingle    = stage === 'single'
              const isInactive  = isSingle && !isSelected
              const isHighlight = stage === 'exploded' && isSelected

              // Pure transform positioning — only `transform` animates (GPU compositor, no layout jitter)
              const ty = isSingle && isSelected ? Math.round((FIXED_H - imgH) / 2) : floorY(i)
              const sc = isSingle && isSelected ? 1.7 : 1

              return (
                <div
                  key={floor.id}
                  onClick={() => stage === 'stacked' ? setStage('exploded') : handleFloorClick(i)}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: FLOOR_W,
                    zIndex: isSingle && isSelected ? 20 : i + 1,
                    transform: `translate(0, ${ty}px) scale(${sc})`,
                    transformOrigin: '50% 50%',
                    willChange: 'transform, opacity',
                    transition: 'transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.4s ease, filter 0.4s ease',
                    opacity: isInactive ? 0 : 1,
                    cursor: 'pointer',
                    filter: isHighlight
                      ? 'drop-shadow(0 0 10px #d946ef) drop-shadow(0 0 20px rgba(217,70,239,0.5))'
                      : isSelected && isSingle
                        ? 'drop-shadow(0 0 18px #d946ef) brightness(1.1)'
                        : 'none',
                    pointerEvents: isInactive ? 'none' : 'auto',
                  }}
                >
                  <img
                    src={floor.img}
                    alt={floor.label}
                    onLoad={() => setLoadedCount(c => c + 1)}
                    style={{ width: '100%', display: 'block', imageRendering: 'auto', transform: 'scale(1.03)', transformOrigin: 'top left' }}
                    draggable={false}
                  />
                  {/* Animated heatmap colors (multiply under grid lines) */}
                  <HeatmapAnimatedCanvas
                    floorIdx={i}
                    apiValues={floorApiData[i]}
                    opacity={stage === 'stacked' ? (i === 0 ? 0.92 : 0.4) : isInactive ? 0 : (i === 0 ? 1 : 0.88)}
                  />
                  {/* Heatmap grid overlay */}
                  <img
                    src={floor.heatmap}
                    alt=""
                    draggable={false}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'fill',
                      transform: 'translateX(2%) translateY(9%)',
                      pointerEvents: 'none',
                      opacity: stage === 'stacked' ? (i === 0 ? 0.22 : 0.4) : isInactive ? 0 : (i === 0 ? 0.45 : 0.9),
                      transition: 'opacity 0.4s ease',
                    }}
                  />

                </div>
              )
            })}
            </div>
          </div>


        </div>
      </div>

      {/* ══ Bottom row — Layer 1 + Layer 2 ══ */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #1f7a68' }}>
          <div style={{ zoom: 0.72 }}>
            <LayerGreedy />
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ border: '2px solid #1a3d78' }}>
          <div style={{ zoom: 0.72 }}>
            <LayerDP />
          </div>
        </div>
      </div>
    </div>
  )
}


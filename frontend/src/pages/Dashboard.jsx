import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/Header.jsx'
import { useToast } from '../components/Toast.jsx'

const ZONE_COLORS = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4']

// ─── Floor plan helpers ────────────────────────────────────────────────────────
const FP_STORAGE = 'heatmap_floor_plans'

function heatColor(ratio, alpha) {
  const a = alpha ?? 1
  let r, g, b
  if (ratio < 0.5) {
    const t = ratio * 2
    r = Math.round(59 + t*(245-59)); g = Math.round(130 + t*(158-130)); b = Math.round(246 + t*(11-246))
  } else {
    const t = (ratio - 0.5) * 2
    r = Math.round(245 + t*(239-245)); g = Math.round(158 + t*(68-158)); b = Math.round(11 + t*(44-11))
  }
  return `rgba(${r},${g},${b},${a})`
}

function centroid(pts) {
  return [pts.reduce((s,p)=>s+p[0],0)/pts.length, pts.reduce((s,p)=>s+p[1],0)/pts.length]
}

function loadPlans() {
  try {
    const stored = JSON.parse(localStorage.getItem(FP_STORAGE) || 'null')
    if (stored && stored.length > 0) return stored
    const old = JSON.parse(localStorage.getItem('floor2_zones') || 'null')
    if (old && old.length > 0) {
      const plan = { id: 'floor2_migrated', name: 'ชั้น 2', bg: 'builtin:floor2', vbox: '0 0 841.92 595.32', zones: old }
      localStorage.setItem(FP_STORAGE, JSON.stringify([plan]))
      return [plan]
    }
    const defaultPlan = { id: 'floor2_default', name: 'ชั้น 2', bg: 'builtin:floor2', vbox: '0 0 841.92 595.32', zones: [] }
    localStorage.setItem(FP_STORAGE, JSON.stringify([defaultPlan]))
    return [defaultPlan]
  } catch { return [] }
}

// ─── Built-in Floor 2 SVG ──────────────────────────────────────────────────────
const BF2_T = 'matrix(0,-.75,.75,0,-.000061035159,595.32)'
function BuiltinFloor2() {
  return (
    <g transform={BF2_T} strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path stroke="rgba(255,255,255,0.08)" strokeWidth="1" d="M.16 0V1121.76H791.04V0"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V959.52"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M235.68 959.52V208.8"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M664.8 129.6V959.2H242.88V216.16"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M588.48 208.8H235.68M588.48 216.16H242.88"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V129.6H588.48V208.8 216.16"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 959.52V1116.16H387.2V1085.44"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M235.68 959.52V1085.44H387.2"/>
      <path stroke="rgba(255,255,255,0.55)" strokeWidth="1" d="M665.76 963.52V1109.76H393.6V964.32L665.76 963.52Z"/>
      <path stroke="rgba(255,255,255,0.55)" strokeWidth="1" d="M240.32 964.32V1080.8H387.04V964.32H240.32Z"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M505.6 5.76H109.92V208.8H588.48"/>
      <path stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" d="M672.16 208.8V20.96H505.6V5.76"/>
      <path stroke="rgba(255,255,255,0.45)" strokeWidth=".8" d="M501.76 9.44H113.6V205.12H588.48"/>
      <path stroke="rgba(255,255,255,0.45)" strokeWidth=".8" d="M668.32 129.6V24.64H501.76V9.44"/>
      <path stroke="rgba(255,255,255,0.18)" strokeWidth=".8" strokeDasharray="10,7" d="M664.8 589.44H242.88M459.04 216.16V959.2"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 248.96V275.84H543.68V248.96H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 248.96V275.84H350.08V248.96H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 415.68V442.56H543.68V415.68H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 415.68V442.56H350.08V415.68H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 573.44V600.32H543.68V573.44H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 573.44V600.32H350.08V573.44H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 731.2V758.08H543.68V731.2H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 731.2V758.08H350.08V731.2H375.84Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M569.28 880V906.88H543.68V880H569.28Z"/>
      <path stroke="rgba(255,255,255,0.25)" strokeWidth=".6" d="M375.84 880V906.88H350.08V880H375.84Z"/>
    </g>
  )
}

function CameraCard({ cam, onStart, onStop, onDelete }) {
  const running = cam.running
  const motion  = cam.motion
  const counts  = cam.counts || {}

  const borderColor = motion
    ? 'rgba(34,197,94,.9)'
    : running
    ? 'rgba(34,197,94,.3)'
    : 'var(--border)'

  return (
    <div style={{
      background: 'var(--surface)',
      border: `2px solid ${borderColor}`,
      borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column',
      transition: 'border-color .15s',
      animation: motion ? 'motionPulse 0.6s ease-in-out infinite alternate' : 'none',
    }}>
      {/* Video */}
      <div style={{ position: 'relative', background: '#000', aspectRatio: '16/9', overflow: 'hidden' }}>
        {running ? (
          <img
            key={`${cam.id}-stream`}
            src={`/video_feed/${cam.id}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>○ Stopped</span>
          </div>
        )}
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(0,0,0,.7)', color: running ? 'var(--success)' : 'var(--muted)',
          fontFamily: 'var(--mono)', fontSize: 11, padding: '3px 8px', borderRadius: 4,
        }}>
          {running ? '● LIVE' : '○ STOPPED'}
        </div>

        {cam.error && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
            background: 'rgba(239,68,68,.85)', color: '#fff',
            fontSize: 11, padding: '4px 8px', borderRadius: 4,
          }}>
            {cam.error}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: running ? 'var(--success)' : 'var(--muted)',
            boxShadow: running ? '0 0 6px var(--success)' : 'none',
            animation: running ? 'pulse 2s infinite' : 'none',
            flexShrink: 0,
          }} />
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{cam.name}</div>
          {running && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
              {cam.fps} fps
            </span>
          )}
        </div>

        {/* Metrics */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            background: motion ? 'rgba(34,197,94,.12)' : 'var(--surface2)',
            border: `1px solid ${motion ? 'rgba(34,197,94,.4)' : 'transparent'}`,
            borderRadius: 7, padding: '8px 10px', flex: 1,
            transition: 'background .3s, border-color .3s',
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, lineHeight: 1,
              color: motion ? 'var(--success)' : 'var(--muted)',
              animation: motion ? 'motionPulse 0.6s ease-in-out infinite alternate' : 'none',
            }}>
              {motion ? 'YES' : 'NO'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Motion</div>
          </div>
          <div style={{ background: 'var(--surface2)', borderRadius: 7, padding: '8px 10px', flex: 1 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 600, lineHeight: 1,
              color: running ? 'var(--success)' : 'var(--muted)',
            }}>
              {running ? 'LIVE' : 'STOP'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>สถานะ</div>
          </div>
        </div>

        {/* Zone chips */}
        {Object.keys(counts).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {Object.entries(counts).map(([name, cnt], i) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--surface2)', borderRadius: 5, padding: '3px 8px', fontSize: 12,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                <span>{name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{cnt}</span>
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {running ? (
            <button className="btn sm danger" onClick={() => onStop(cam.id)}>■ หยุด</button>
          ) : (
            <button className="btn sm primary" onClick={() => onStart(cam.id)}>▶ เริ่ม</button>
          )}
          <Link to={`/settings?cam=${cam.id}`} className="btn sm">⚙ ตั้งค่า</Link>
          <button
            className="btn sm danger"
            style={{ marginLeft: 'auto' }}
            onClick={() => onDelete(cam.id, cam.name)}
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}

function AddCameraModal({ onClose, onAdd }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [conf, setConf] = useState(0.4)

  const handleAdd = () => {
    if (!url.trim()) return
    onAdd({ name: name.trim() || 'Camera', rtsp_url: url.trim(), conf_threshold: conf, zones: [] })
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>เพิ่มกล้องใหม่</h2>
        <div className="field">
          <label>ชื่อกล้อง</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น ทางเข้าหลัก" />
        </div>
        <div className="field">
          <label>แหล่งวีดีโอ</label>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="rtsp://... หรือ 0 (webcam) หรือ path/to/video.mp4" />
        </div>
        <div className="field">
          <label>Confidence</label>
          <input type="number" min="0.1" max="0.9" step="0.05" value={conf} onChange={e => setConf(parseFloat(e.target.value))} />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" onClick={handleAdd} disabled={!url.trim()}>เพิ่มกล้อง</button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const toast = useToast()
  const [cameras, setCameras] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)

  // Floor plan state (read-only live view)
  const [plans, setPlans] = useState(loadPlans)
  const [maxCount, setMaxCount] = useState(1)

  // Reload plans when localStorage is changed from Heatmap editor
  useEffect(() => {
    const onStorage = () => setPlans(loadPlans())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Use a ref so we can abort in-flight requests
  const abortRef = useRef(null)

  const refresh = useCallback(async () => {
    // Cancel previous request if still pending
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    try {
      const data = await fetch('/api/cameras', { signal: abortRef.current.signal }).then(r => r.json())
      abortRef.current = null
      setCameras(data)
      const peak = Math.max(...data.map(c => c.total_people || 0), 1)
      // Rolling max: decay slowly so heatmap doesn't get permanently dark
      setMaxCount(prev => Math.max(peak, prev * 0.98, 1))
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('fetch error', e)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 2000)
    return () => {
      clearInterval(id)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [refresh])

  const startCam = async (id) => {
    const r = await fetch(`/api/cameras/${id}/start`, { method: 'POST' })
    const d = await r.json()
    if (!d.ok) toast(d.msg, true); else toast('เริ่มแล้ว')
    refresh()
  }

  const stopCam = async (id) => {
    await fetch(`/api/cameras/${id}/stop`, { method: 'POST' })
    toast('หยุดแล้ว')
    refresh()
  }

  const startAll = async () => {
    const d = await fetch('/api/cameras/start_all', { method: 'POST' }).then(r => r.json())
    toast(`เริ่ม ${d.started?.length || 0} กล้อง`)
    refresh()
  }

  const stopAll = async () => {
    await fetch('/api/cameras/stop_all', { method: 'POST' })
    toast('หยุดทั้งหมดแล้ว')
    refresh()
  }

  const deleteCam = async (id, name) => {
    if (!confirm(`ลบกล้อง "${name}" ออก?`)) return
    await fetch(`/api/cameras/${id}`, { method: 'DELETE' })
    toast(`ลบ ${name} แล้ว`)
    refresh()
  }

  const addCamera = async (body) => {
    try {
      const r = await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) { toast(`เกิดข้อผิดพลาด (HTTP ${r.status})`, true); return }
      const d = await r.json()
      if (d.ok) { setShowAddModal(false); toast(`เพิ่ม ${body.name} แล้ว`); refresh() }
      else toast('เกิดข้อผิดพลาด', true)
    } catch (e) {
      toast('เชื่อมต่อ server ไม่ได้ — ตรวจสอบว่า backend กำลังทำงาน', true)
    }
  }

  const liveCams   = cameras.filter(c => c.running).length
  const motionCams  = cameras.filter(c => c.running && c.motion).length
  const grandTotal  = cameras.filter(c => c.running).reduce((s, c) => s + c.total_people, 0)

  // Derived floor plan — always use first plan
  const activePlan = plans[0] || null
  const camCounts  = Object.fromEntries(cameras.map(c => [c.id, { total: c.total_people || 0, running: c.running }]))

  return (
    <div className="page">
      <Header />

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginRight: 'auto' }}>
          กล้องทั้งหมด: <b style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{cameras.length}</b>
          &nbsp;|&nbsp;
          Live: <b style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{liveCams}</b>
          &nbsp;|&nbsp;
          Motion: <b style={{
            color: motionCams > 0 ? 'var(--success)' : 'var(--muted)',
            fontFamily: 'var(--mono)',
            animation: motionCams > 0 ? 'motionPulse 0.6s ease-in-out infinite alternate' : 'none',
          }}>{motionCams}</b>
        </div>
        <button className="btn success" onClick={startAll}>▶ เริ่มทั้งหมด</button>
        <button className="btn danger" onClick={stopAll}>■ หยุดทั้งหมด</button>
        <button className="btn primary" onClick={() => setShowAddModal(true)}>+ เพิ่มกล้อง</button>
      </div>

      {/* ── Split layout: cameras left | floor plan right ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>

        {/* Left — camera cards */}
        <div style={{ width: 'clamp(320px, 38%, 460px)', flexShrink: 0, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '20px 20px' }}>
          {cameras.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '60px 20px' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>📷</p>
              <p>ยังไม่มีกล้อง — กด "+ เพิ่มกล้อง" เพื่อเพิ่ม</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {cameras.map(cam => (
                <CameraCard
                  key={cam.id}
                  cam={cam}
                  onStart={startCam}
                  onStop={stopCam}
                  onDelete={deleteCam}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right — floor plan heatmap */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)', minWidth: 0 }}>
          {/* Floor plan header bar */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', height: 40, background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {activePlan ? activePlan.name : 'ผังชั้น'}
            </span>
            {activePlan && (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{activePlan.zones.length} โซน</span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>น้อย</span>
                <div style={{ width: 80, height: 6, borderRadius: 3, background: 'linear-gradient(to right, rgb(59,130,246), rgb(245,158,11), rgb(239,68,44))' }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>มาก</span>
              </div>
              <Link
                to="/heatmap"
                style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)', color: 'var(--muted)', background: 'transparent', textDecoration: 'none', whiteSpace: 'nowrap' }}
              >
                ✎ แก้ไขโซน
              </Link>
            </div>
          </div>

          {/* SVG heatmap */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            {activePlan ? (
              <svg
                viewBox={activePlan.vbox || '0 0 841.92 595.32'}
                style={{ width: '100%', height: '100%', maxHeight: '100%', display: 'block' }}
                preserveAspectRatio="xMidYMid meet"
              >
                {activePlan.bg === 'builtin:floor2' && <BuiltinFloor2 />}
                {activePlan.bg !== 'builtin:floor2' && activePlan.bg !== 'blank' && (
                  <image href={activePlan.bg} x="0" y="0" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
                )}
                {activePlan.zones.map(z => {
                  const ci      = camCounts[z.cameraId]
                  const cnt     = ci?.total || 0
                  const active  = z.cameraId && ci?.running && cnt > 0
                  const ratio   = Math.min(cnt / maxCount, 1)
                  const fill    = cnt > 0 ? heatColor(ratio, 0.42) : 'rgba(255,255,255,0.025)'
                  const stroke  = active ? '#22c55e' : cnt > 0 ? heatColor(ratio, 0.9) : 'rgba(255,255,255,0.07)'
                  const pts     = z.points.map(p => p.join(',')).join(' ')
                  const [cx, cy] = centroid(z.points)
                  return (
                    <g key={z.id}>
                      {active && <polygon points={pts} fill="none" stroke="#22c55e" strokeWidth="6" strokeOpacity="0.22" />}
                      <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={active ? '3' : '2.5'} />
                      <text x={cx} y={cy + 6} textAnchor="middle" fill={active ? '#22c55e' : 'rgba(255,255,255,0.25)'} fontSize="16" fontWeight="700" fontFamily="var(--sans)" style={{ filter: 'drop-shadow(0 1px 5px rgba(0,0,0,0.95))' }}>{active ? 'มีคน' : 'ว่าง'}</text>
                      <text x={cx} y={cy + 20} textAnchor="middle" fill="rgba(255,255,255,0.45)" fontSize="9" fontFamily="var(--sans)" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }}>{z.name}</text>
                    </g>
                  )
                })}
                {activePlan.zones.length === 0 && (
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.2)" fontSize="14" fontFamily="var(--sans)">
                    ยังไม่มีโซน — กด ✎ แก้ไขโซน เพื่อวาด
                  </text>
                )}
              </svg>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>ไม่มีแผนผัง</div>
            )}
          </div>

          {/* Zone status cards */}
          {activePlan && activePlan.zones.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', flexWrap: 'wrap', background: 'var(--surface)', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              {activePlan.zones.map(z => {
                const ci      = camCounts[z.cameraId]
                const cnt     = ci?.total || 0
                const isActive = z.cameraId && ci?.running && cnt > 0
                return (
                  <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: isActive ? 'rgba(34,197,94,0.1)' : 'var(--surface2)', border: `1px solid ${isActive ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`, borderRadius: 7, padding: '5px 10px' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{z.name}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, color: isActive ? '#22c55e' : 'rgba(255,255,255,0.25)' }}>{isActive ? 'มีคน' : 'ว่าง'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddCameraModal onClose={() => setShowAddModal(false)} onAdd={addCamera} />
      )}
    </div>
  )
}

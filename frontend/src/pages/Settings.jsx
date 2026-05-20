import { useState, useEffect, useRef, useCallback, useReducer } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header.jsx'
import { useToast } from '../components/Toast.jsx'

export default function Settings() {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const camId = searchParams.get('cam')

  // ─── Canvas refs (mutable state for RAF loop) ──────────────────────────────
  const canvasRef = useRef(null)
  const s = useRef({
    bgImage: null,
    zones: [],
    drawing: [],
    tool: 'draw',
    dragIdx: -1,
    dragZoneIdx: -1,
    selectedZone: -1,
    hoverVertex: null,
  })

  // ─── React state (drives UI re-renders) ───────────────────────────────────
  const [, forceUpdate] = useReducer(x => x + 1, 0)
  const [rtspUrl, setRtspUrl] = useState('')
  const [conf, setConf] = useState(0.4)
  const [zoneName, setZoneName] = useState('')
  const [zoneColor, setZoneColor] = useState('#3b82f6')
  const [hint, setHint] = useState('โหลด snapshot ก่อนขีดเส้น')
  const [tool, setToolState] = useState('draw')

  // Derive reactive zone list from ref
  const [zonesSnapshot, setZonesSnapshot] = useState([])
  const [drawingLen, setDrawingLen] = useState(0)
  const [selectedZone, setSelectedZone] = useState(-1)

  const syncUI = useCallback(() => {
    setZonesSnapshot([...s.current.zones])
    setDrawingLen(s.current.drawing.length)
    setSelectedZone(s.current.selectedZone)
    forceUpdate()
  }, [])

  // ─── RAF render loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animId

    function render() {
      const st = s.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const W = canvas.width, H = canvas.height

      if (st.bgImage) {
        ctx.drawImage(st.bgImage, 0, 0, W, H)
      } else {
        ctx.fillStyle = '#111'
        ctx.fillRect(0, 0, W, H)
        ctx.fillStyle = '#444'
        ctx.font = '16px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('โหลด snapshot หรืออัปโหลดรูปภาพ', W / 2, H / 2)
      }

      // Draw saved zones
      st.zones.forEach((zone, zi) => {
        if (zone.points.length < 2) return
        const pts = zone.points.map(p => [p[0] * W, p[1] * H])
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]))
        ctx.closePath()
        ctx.fillStyle = zone.color + '33'
        ctx.fill()
        ctx.strokeStyle = zone.color
        ctx.lineWidth = zi === st.selectedZone ? 3 : 2
        ctx.setLineDash([])
        ctx.stroke()

        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
        ctx.font = 'bold 14px Sarabun, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#fff'
        ctx.strokeStyle = 'rgba(0,0,0,.6)'
        ctx.lineWidth = 3
        ctx.strokeText(zone.name, cx, cy + 5)
        ctx.fillText(zone.name, cx, cy + 5)

        if (zi === st.selectedZone || st.tool === 'move') {
          pts.forEach((p, pi) => {
            const isHover = st.hoverVertex && st.hoverVertex[0] === zi && st.hoverVertex[1] === pi
            ctx.beginPath()
            ctx.arc(p[0], p[1], isHover ? 8 : 5, 0, Math.PI * 2)
            ctx.fillStyle = isHover ? '#fff' : zone.color
            ctx.fill()
            ctx.strokeStyle = '#000'
            ctx.lineWidth = 1.5
            ctx.stroke()
          })
        }
      })

      // Draw current polygon
      if (st.drawing.length > 0) {
        const color = st.currentColor || '#3b82f6'
        const pts = st.drawing.map(p => [p[0] * W, p[1] * H])
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]))
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])

        if (pts.length >= 3) {
          ctx.beginPath()
          ctx.moveTo(pts[0][0], pts[0][1])
          pts.forEach(p => ctx.lineTo(p[0], p[1]))
          ctx.closePath()
          ctx.fillStyle = color + '22'
          ctx.fill()
        }
        pts.forEach((p, i) => {
          ctx.beginPath()
          ctx.arc(p[0], p[1], i === 0 ? 7 : 5, 0, Math.PI * 2)
          ctx.fillStyle = i === 0 ? '#fff' : color
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = 2
          ctx.stroke()
        })
      }

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [])

  // ─── Canvas event handlers ─────────────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    if (s.current.tool !== 'draw') return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const drawing = s.current.drawing
    if (drawing.length >= 3) {
      const [fx, fy] = drawing[0]
      const dx = (nx - fx) * canvas.width
      const dy = (ny - fy) * canvas.height
      if (Math.sqrt(dx * dx + dy * dy) < 12) { finishZone(); return }
    }
    s.current.drawing = [...drawing, [nx, ny]]
    setHint(`${s.current.drawing.length} จุด — คลิกจุดแรกหรือกด ✓ เพื่อปิด`)
    syncUI()
  }, [syncUI])

  const handleDblClick = useCallback(() => {
    if (s.current.tool === 'draw' && s.current.drawing.length >= 3) finishZone()
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (s.current.tool !== 'move') return
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const W = canvas.width, H = canvas.height
    for (let zi = s.current.zones.length - 1; zi >= 0; zi--) {
      for (let pi = 0; pi < s.current.zones[zi].points.length; pi++) {
        const [px, py] = s.current.zones[zi].points[pi]
        const dx = (nx - px) * W, dy = (ny - py) * H
        if (Math.sqrt(dx * dx + dy * dy) < 10) {
          s.current.dragZoneIdx = zi
          s.current.dragIdx = pi
          s.current.selectedZone = zi
          syncUI()
          return
        }
      }
    }
    s.current.selectedZone = -1
    syncUI()
  }, [syncUI])

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    const W = canvas.width, H = canvas.height

    if (s.current.dragIdx >= 0 && s.current.dragZoneIdx >= 0) {
      s.current.zones[s.current.dragZoneIdx].points[s.current.dragIdx] = [nx, ny]
      return
    }

    s.current.hoverVertex = null
    if (s.current.tool === 'move') {
      for (let zi = 0; zi < s.current.zones.length; zi++) {
        for (let pi = 0; pi < s.current.zones[zi].points.length; pi++) {
          const [px, py] = s.current.zones[zi].points[pi]
          const dx = (nx - px) * W, dy = (ny - py) * H
          if (Math.sqrt(dx * dx + dy * dy) < 12) {
            s.current.hoverVertex = [zi, pi]
            canvas.style.cursor = 'grab'
            return
          }
        }
      }
      canvas.style.cursor = 'default'
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    s.current.dragIdx = -1
    s.current.dragZoneIdx = -1
  }, [])

  // ─── Zone operations ───────────────────────────────────────────────────────
  const finishZone = useCallback(() => {
    if (s.current.drawing.length < 3) { toast('ต้องมีอย่างน้อย 3 จุด', true); return }
    const name = s.current.currentZoneName?.trim() || `โซน ${s.current.zones.length + 1}`
    const color = s.current.currentColor || '#3b82f6'
    s.current.zones = [...s.current.zones, { name, points: [...s.current.drawing], color }]
    s.current.drawing = []
    setZoneName('')
    s.current.currentZoneName = ''
    setHint('บันทึกโซนแล้ว — วาดโซนต่อไปหรือกด บันทึกการตั้งค่า')
    syncUI()
  }, [toast, syncUI])

  const cancelDraw = () => { s.current.drawing = []; setHint('ยกเลิก'); syncUI() }
  const undoPoint = () => { s.current.drawing = s.current.drawing.slice(0, -1); syncUI() }

  const deleteZone = (i) => {
    s.current.zones = s.current.zones.filter((_, idx) => idx !== i)
    if (s.current.selectedZone >= s.current.zones.length) s.current.selectedZone = -1
    syncUI()
  }

  const selectZone = (i) => {
    s.current.selectedZone = s.current.selectedZone === i ? -1 : i
    syncUI()
  }

  const setTool = (t) => {
    s.current.tool = t
    setToolState(t)
    if (canvasRef.current) canvasRef.current.style.cursor = t === 'draw' ? 'crosshair' : 'default'
    setHint(t === 'draw' ? 'คลิกเพื่อเพิ่มจุด — ดับเบิลคลิกหรือกด ✓ เพื่อปิด' : 'ลาก vertex เพื่อปรับตำแหน่ง')
  }

  // ─── Load/Save config ──────────────────────────────────────────────────────
  const loadSnapshot = async () => {
    const url = camId ? `/api/cameras/${camId}/snapshot` : '/api/snapshot'
    const d = await fetch(url).then(r => r.json())
    if (!d.ok) { toast('ไม่มี snapshot — เริ่ม stream ก่อน', true); return }
    const img = new Image()
    img.onload = () => { s.current.bgImage = img; setHint('โหลด snapshot สำเร็จ — คลิกวาดโซน') }
    img.src = d.image
  }

  const loadFromFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => { s.current.bgImage = img; setHint('โหลดรูปสำเร็จ — คลิกวาดโซน') }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  const loadConfig = useCallback(async (id) => {
    const url = id ? `/api/cameras/${id}/config` : '/api/config'
    const d = await fetch(url).then(r => r.json())
    setRtspUrl(d.rtsp_url || '')
    setConf(d.conf_threshold ?? 0.4)
    s.current.zones = d.zones || []
    syncUI()
  }, [syncUI])

  const saveAll = async () => {
    const cfg = { rtsp_url: rtspUrl, conf_threshold: conf, zones: s.current.zones }
    const url = camId ? `/api/cameras/${camId}/config` : '/api/config'
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) })
    toast('บันทึกเรียบร้อย — รีสตาร์ท stream เพื่อใช้การตั้งค่าใหม่')
  }

  useEffect(() => {
    loadConfig(camId)
    setTool('draw')
  }, [camId, loadConfig])

  const fileInputRef = useRef(null)

  return (
    <div style={{ display: 'grid', gridTemplateRows: '56px 1fr', height: '100vh' }}>
      <Header title={camId ? `ตั้งค่า — ${camId}` : 'RTSP PERSON COUNTER — ตั้งค่า'} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', overflow: 'hidden' }}>
        {/* Canvas panel */}
        <div style={{ position: 'relative', background: '#000', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={960}
            height={540}
            style={{ cursor: 'crosshair', display: 'block', maxWidth: '100%', maxHeight: '100%' }}
            onClick={handleCanvasClick}
            onDoubleClick={handleDblClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,.7)', color: 'var(--muted)', fontSize: 12,
            padding: '6px 14px', borderRadius: 20, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            {hint}
          </div>
        </div>

        {/* Sidebar */}
        <aside style={{
          background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}>
          {/* RTSP Config */}
          <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
            <div className="section-label">การเชื่อมต่อ RTSP</div>
            <div className="field">
              <label>RTSP URL</label>
              <input value={rtspUrl} onChange={e => setRtspUrl(e.target.value)} placeholder="rtsp://user:pass@192.168.1.1:554/stream" />
            </div>
          </div>

          {/* Zone editor */}
          <div style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
            <div className="section-label">โซนนับคน</div>
            <div className="btn-row" style={{ marginBottom: 12 }}>
              <button className="btn sm" onClick={loadSnapshot}>📷 โหลด snapshot</button>
              <button className="btn sm" onClick={() => fileInputRef.current?.click()}>🖼 อัปโหลดรูป</button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={loadFromFile} />
            </div>
            <div className="field">
              <label>ชื่อโซนใหม่</label>
              <input
                value={zoneName}
                onChange={e => { setZoneName(e.target.value); s.current.currentZoneName = e.target.value }}
                placeholder="เช่น ทางเข้า, โซน A"
              />
            </div>
            <div className="field">
              <label>สีโซน</label>
              <input
                type="color" value={zoneColor}
                onChange={e => { setZoneColor(e.target.value); s.current.currentColor = e.target.value }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <button
                className={`btn sm ${tool === 'draw' ? 'primary' : ''}`}
                onClick={() => setTool('draw')}
              >✏ วาด polygon</button>
              <button
                className={`btn sm ${tool === 'move' ? 'primary' : ''}`}
                onClick={() => setTool('move')}
              >↖ เลื่อน vertex</button>
            </div>
            <div className="btn-row">
              <button className="btn sm primary" onClick={finishZone} disabled={drawingLen < 3}>
                ✓ บันทึกโซน
              </button>
              <button className="btn sm" onClick={cancelDraw}>✕ ยกเลิก</button>
              <button className="btn sm" onClick={undoPoint}>↩ ถอย</button>
            </div>
            <div style={{ fontSize: 11, color: drawingLen >= 3 ? 'var(--success)' : 'var(--muted)', marginTop: 6 }}>
              {drawingLen < 3 ? `วาด ${drawingLen} / 3 จุด ขั้นต่ำ` : `${drawingLen} จุด — พร้อมบันทึก ✓`}
            </div>
          </div>

          {/* Zone list */}
          <div style={{ padding: 20, borderBottom: '1px solid var(--border)', flex: 1 }}>
            <div className="section-label">โซนที่มี ({zonesSnapshot.length})</div>
            {zonesSnapshot.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0', lineHeight: 1.8 }}>
                ยังไม่มีโซน<br />โหลด snapshot แล้วคลิกวาดบน canvas
              </p>
            ) : (
              zonesSnapshot.map((z, i) => (
                <div
                  key={i}
                  onClick={() => selectZone(i)}
                  style={{
                    background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 8,
                    border: `1px solid ${selectedZone === i ? 'var(--accent)' : 'transparent'}`,
                    cursor: 'pointer', transition: 'border .2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{z.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                    {z.points.length} จุด
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      className="btn sm"
                      onClick={e => { e.stopPropagation(); selectZone(i); setTool('move') }}
                    >✎ แก้ไข</button>
                    <button
                      className="btn sm danger"
                      onClick={e => { e.stopPropagation(); deleteZone(i) }}
                    >🗑 ลบ</button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Save */}
          <div style={{ padding: 20, marginTop: 'auto' }}>
            <button className="btn success" style={{ width: '100%' }} onClick={saveAll}>
              💾 บันทึกการตั้งค่าทั้งหมด
            </button>
            <div style={{ marginTop: 8 }}>
              <button className="btn" style={{ width: '100%' }} onClick={() => navigate('/')}>
                ← กลับ Dashboard
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

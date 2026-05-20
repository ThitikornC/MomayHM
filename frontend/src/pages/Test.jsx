import { useState, useRef, useEffect, useCallback } from 'react'
import Header from '../components/Header.jsx'

function drawChart(canvas, timeline) {
  const dpr = window.devicePixelRatio || 1
  const W = canvas.offsetWidth
  const H = 200
  canvas.width = W * dpr
  canvas.height = H * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, W, H)
  if (!timeline.length) return
  const maxC = Math.max(...timeline.map(t => t.count), 1)
  const pad = { l: 40, r: 16, t: 16, b: 30 }
  const gw = W - pad.l - pad.r, gh = H - pad.t - pad.b

  ctx.strokeStyle = 'rgba(255,255,255,.06)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + gh * i / 4
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + gw, y); ctx.stroke()
    ctx.fillStyle = '#6b7280'; ctx.font = '11px monospace'; ctx.textAlign = 'right'
    ctx.fillText(Math.round(maxC * (1 - i / 4)), pad.l - 6, y + 4)
  }

  ctx.beginPath()
  timeline.forEach((pt, i) => {
    const x = pad.l + (i / (timeline.length - 1 || 1)) * gw
    const y = pad.t + gh * (1 - pt.count / maxC)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.stroke()

  ctx.lineTo(pad.l + gw, pad.t + gh); ctx.lineTo(pad.l, pad.t + gh); ctx.closePath()
  ctx.fillStyle = 'rgba(59,130,246,.12)'; ctx.fill()

  ctx.fillStyle = '#6b7280'; ctx.textAlign = 'center'
  ;[0, Math.floor(timeline.length / 2), timeline.length - 1].forEach(i => {
    if (timeline[i]) {
      const x = pad.l + (i / (timeline.length - 1 || 1)) * gw
      ctx.fillText(timeline[i].time + 's', x, H - 8)
    }
  })
}

export default function Test() {
  const [tab, setTab] = useState('img')
  const [selectedFile, setSelectedFile] = useState(null)
  const [origDataUrl, setOrigDataUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [progress, setProgress] = useState(0)

  // Settings
  const [conf, setConf] = useState(40)
  const [sampleEvery, setSampleEvery] = useState(10)

  // Results
  const [imgResult, setImgResult] = useState(null)
  const [vidResult, setVidResult] = useState(null)

  // Video player
  const videoRef = useRef(null)
  const detCanvasRef = useRef(null)
  const chartRef = useRef(null)
  const rafRef = useRef(null)
  const timelineRef = useRef([])
  const videoUrlRef = useRef(null)
  const [playSpeed, setPlaySpeed] = useState(1)
  const [curCount, setCurCount] = useState(null)
  const progIntRef = useRef(null)

  const stopRaf = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null } }

  const getNearestDet = (t) => {
    const tl = timelineRef.current
    if (!tl.length) return null
    let best = tl[0], bestDiff = Math.abs(t - best.time)
    for (const entry of tl) {
      const diff = Math.abs(t - entry.time)
      if (diff < bestDiff) { bestDiff = diff; best = entry }
    }
    return bestDiff < 4 ? best : null
  }

  const startRaf = useCallback(() => {
    const video = videoRef.current
    const canvas = detCanvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d')
    function frame() {
      if (!video.paused && !video.ended) {
        const W = canvas.width, H = canvas.height
        ctx.drawImage(video, 0, 0, W, H)
        const det = getNearestDet(video.currentTime)
        if (det?.boxes) {
          ctx.strokeStyle = '#f59e0b'
          ctx.lineWidth = Math.max(2, W / 400)
          ctx.font = `${Math.max(12, W / 60)}px monospace`
          ctx.fillStyle = '#f59e0b'
          for (const b of det.boxes) {
            ctx.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H)
            ctx.fillText((b.conf * 100).toFixed(0) + '%', b.x * W + 2, b.y * H - 4)
          }
          setCurCount(det.count)
        }
      }
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (vidResult && chartRef.current) {
      drawChart(chartRef.current, vidResult.timeline)
    }
  }, [vidResult])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !vidResult || !videoUrlRef.current) return
    video.src = videoUrlRef.current
    video.playbackRate = playSpeed
    const onMeta = () => {
      const canvas = detCanvasRef.current
      if (canvas) { canvas.width = video.videoWidth; canvas.height = video.videoHeight }
      video.play().catch(() => {})
    }
    video.addEventListener('loadedmetadata', onMeta)
    return () => video.removeEventListener('loadedmetadata', onMeta)
  }, [vidResult])

  useEffect(() => {
    if (vidResult) { stopRaf(); startRaf() }
    return stopRaf
  }, [vidResult, startRaf])

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playSpeed
  }, [playSpeed])

  const animateProgress = () => {
    let v = 0
    progIntRef.current = setInterval(() => {
      v = Math.min(v + Math.random() * 3, 90)
      setProgress(v)
    }, 200)
  }

  const setFile = (f, type) => {
    setSelectedFile(f)
    if (type === 'img') {
      const reader = new FileReader()
      reader.onload = e => setOrigDataUrl(e.target.result)
      reader.readAsDataURL(f)
    }
  }

  const handleDrop = (e, type) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) setFile(f, type)
  }

  const runTest = async () => {
    if (!selectedFile) return
    setImgResult(null); setVidResult(null); setLoading(true)
    const fd = new FormData()
    fd.append('file', selectedFile)
    fd.append('conf', conf / 100)

    try {
      if (tab === 'img') {
        setLoadingMsg('กำลัง detect ภาพ...')
        const d = await fetch('/api/test/image', { method: 'POST', body: fd }).then(r => r.json())
        if (!d.ok) { alert('Error: ' + (d.detail || 'unknown')); return }
        setImgResult(d)
      } else {
        fd.append('sample_every', sampleEvery)
        setLoadingMsg('กำลังประมวลผลวีดีโอ (อาจใช้เวลาหลายวินาที)...')
        animateProgress()
        const d = await fetch('/api/test/video', { method: 'POST', body: fd }).then(r => r.json())
        if (!d.ok) { alert('Error: ' + (d.detail || 'unknown')); return }
        timelineRef.current = d.timeline
        stopRaf()
        if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
        videoUrlRef.current = URL.createObjectURL(selectedFile)
        setVidResult(d)
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
    } finally {
      setLoading(false)
      setProgress(0)
      if (progIntRef.current) { clearInterval(progIntRef.current); progIntRef.current = null }
    }
  }

  const StatCards = ({ items }) => (
    <div className="stats">
      {items.map((s, i) => (
        <div key={i} className="stat">
          <div className="val" style={{ color: s.color }}>{s.val}</div>
          <div className="lbl">{s.lbl}</div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="page">
      <Header title="OpenCV HOG / TEST DETECTION" />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr', overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{
          background: 'var(--surface)', borderRight: '1px solid var(--border)',
          padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div>
            <div className="section-label">โหมดทดสอบ</div>
            <div className="tabs">
              <button className={`tab ${tab === 'img' ? 'active' : ''}`} onClick={() => { setTab('img'); setSelectedFile(null) }}>🖼 ภาพ</button>
              <button className={`tab ${tab === 'vid' ? 'active' : ''}`} onClick={() => { setTab('vid'); setSelectedFile(null) }}>🎬 วีดีโอ</button>
            </div>
          </div>

          <div>
            <div className="section-label">การตั้งค่า</div>
            <div className="field">
              <label>Confidence threshold</label>
              <div className="range-row">
                <input type="range" min={10} max={90} value={conf} onChange={e => setConf(+e.target.value)} />
                <span className="range-val">{conf}%</span>
              </div>
            </div>
            {tab === 'vid' && (
              <div className="field">
                <label>ทุกกี่ frame (วีดีโอ)</label>
                <input type="number" value={sampleEvery} min={1} max={100} onChange={e => setSampleEvery(+e.target.value)} />
              </div>
            )}
          </div>

          {/* Drop zone */}
          {tab === 'img' ? (
            <div>
              <div className="section-label">อัปโหลดภาพ</div>
              <label
                className={`drop-zone ${selectedFile ? '' : ''}`}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag') }}
                onDragLeave={e => e.currentTarget.classList.remove('drag')}
                onDrop={e => { e.currentTarget.classList.remove('drag'); handleDrop(e, 'img') }}
              >
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && setFile(e.target.files[0], 'img')} />
                <div className="dz-icon">{selectedFile ? '✅' : '🖼'}</div>
                <div>{selectedFile ? selectedFile.name : 'คลิกหรือลากไฟล์ภาพมาวาง'}</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  {selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : 'PNG, JPG, WEBP'}
                </div>
              </label>
            </div>
          ) : (
            <div>
              <div className="section-label">อัปโหลดวีดีโอ</div>
              <label
                className="drop-zone"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag') }}
                onDragLeave={e => e.currentTarget.classList.remove('drag')}
                onDrop={e => { e.currentTarget.classList.remove('drag'); handleDrop(e, 'vid') }}
              >
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => e.target.files[0] && setFile(e.target.files[0], 'vid')} />
                <div className="dz-icon">{selectedFile ? '🎬' : '🎬'}</div>
                <div>{selectedFile ? selectedFile.name : 'คลิกหรือลากไฟล์วีดีโอมาวาง'}</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>
                  {selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : 'MP4, AVI, MOV (max 3000 frames)'}
                </div>
              </label>
              {loading && tab === 'vid' && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: progress + '%' }} />
                </div>
              )}
            </div>
          )}

          <button className="btn primary" onClick={runTest} disabled={!selectedFile || loading}>
            {loading ? '⏳ กำลังประมวลผล...' : '▶ รัน Detection'}
          </button>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!loading && !imgResult && !vidResult && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--muted)', textAlign: 'center', gap: 12 }}>
              <div style={{ fontSize: 48 }}>🔍</div>
              <div>อัปโหลดภาพหรือวีดีโอแล้วกด "รัน Detection"</div>
            </div>
          )}

          {loading && (
            <div className="spinner">
              <div className="spin" />
              <span>{loadingMsg}</span>
            </div>
          )}

          {/* Image result */}
          {imgResult && (
            <div>
              <StatCards items={[
                { val: imgResult.count, lbl: 'คนที่พบ', color: 'var(--accent2)' },
                { val: imgResult.detections.length > 0 ? (imgResult.detections.reduce((s, x) => s + x.conf, 0) / imgResult.detections.length * 100).toFixed(1) + '%' : '—', lbl: 'Conf เฉลี่ย', color: 'var(--success)' },
                { val: conf + '%', lbl: 'Threshold', color: 'var(--muted)' },
              ]} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>ภาพต้นฉบับ</div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <img src={origDataUrl} alt="" style={{ width: '100%', display: 'block' }} />
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>ผลลัพธ์ Detection</div>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                    <img src={imgResult.image} alt="" style={{ width: '100%', display: 'block' }} />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="section-label">รายการที่ตรวจพบ</div>
                <table className="det-table">
                  <thead><tr><th>#</th><th>X1</th><th>Y1</th><th>X2</th><th>Y2</th><th>Confidence</th></tr></thead>
                  <tbody>
                    {imgResult.detections.map((d, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td><td>{d.x1}</td><td>{d.y1}</td><td>{d.x2}</td><td>{d.y2}</td>
                        <td style={{ color: 'var(--success)' }}>{(d.conf * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Video result */}
          {vidResult && (
            <div>
              <StatCards items={[
                { val: vidResult.peak_count, lbl: 'คนสูงสุด', color: 'var(--danger)' },
                { val: vidResult.avg_count, lbl: 'เฉลี่ย/frame', color: 'var(--accent2)' },
                { val: vidResult.sampled_frames, lbl: 'Frame ที่วิเคราะห์', color: 'var(--success)' },
                { val: vidResult.fps, lbl: 'FPS วีดีโอ', color: 'var(--muted)' },
              ]} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>วีดีโอต้นฉบับ</div>
                  <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden' }}>
                    <video ref={videoRef} controls style={{ width: '100%', display: 'block' }} />
                  </div>
                </div>
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>ผลลัพธ์ Detection (realtime)</div>
                  <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', position: 'relative' }}>
                    <canvas ref={detCanvasRef} style={{ width: '100%', display: 'block' }} />
                    <div style={{
                      position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.75)',
                      color: '#fff', fontFamily: 'var(--mono)', fontSize: 13, padding: '4px 10px', borderRadius: 6,
                    }}>
                      {curCount !== null ? `คน: ${curCount}` : '—'}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>ความเร็ว:</span>
                    <select
                      value={playSpeed}
                      onChange={e => setPlaySpeed(parseFloat(e.target.value))}
                      style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--text)', borderRadius: 6, padding: '3px 8px', fontSize: 12 }}
                    >
                      <option value={0.25}>0.25×</option>
                      <option value={0.5}>0.5×</option>
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                    </select>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="section-label">Timeline จำนวนคนตามเวลา</div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <canvas ref={chartRef} style={{ width: '100%', height: 200 }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

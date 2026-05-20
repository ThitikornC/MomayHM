import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const showToast = useCallback((msg, isErr = false) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ msg, isErr })
    timerRef.current = setTimeout(() => setToast(null), 2800)
  }, [])

  return (
    <ToastCtx.Provider value={showToast}>
      {children}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.isErr ? 'rgba(239,68,68,.15)' : 'var(--surface3)',
          border: `1px solid ${toast.isErr ? 'var(--danger)' : 'var(--border2)'}`,
          color: toast.isErr ? 'var(--danger)' : 'var(--text)',
          padding: '10px 20px', borderRadius: 8, fontSize: 13,
          zIndex: 300, whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>
          {toast.msg}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}

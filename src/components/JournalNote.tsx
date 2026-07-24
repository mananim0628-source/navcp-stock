'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { T } from '@/lib/theme'

// 개인 매매일지 메모 — 자동 기록에 본인 주석을 덧붙인다. 본인만 열람(RLS).
type Note = { id: number; note: string; created_at: string }

export default function JournalNote({ tradeId, symbol, lang = 'ko' }: { tradeId: number; symbol: string; lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const [uid, setUid] = useState<string | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data: u } = await supabase.auth.getUser()
      if (!alive) return
      const id = u.user?.id ?? null
      setUid(id)
      if (!id) return
      const { data } = await supabase.from('stock_journal_note').select('id,note,created_at')
        .eq('trade_id', tradeId).order('created_at', { ascending: false })
      if (alive) setNotes((data as Note[]) || [])
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => load())
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [tradeId])

  async function add() {
    const n = text.trim()
    if (!uid || !n || busy) return
    setBusy(true)
    const { data, error } = await supabase.from('stock_journal_note')
      .insert({ user_id: uid, trade_id: tradeId, symbol, note: n.slice(0, 2000) })
      .select('id,note,created_at').single()
    setBusy(false)
    if (!error && data) { setNotes(x => [data as Note, ...x]); setText('') }
  }
  async function del(id: number) {
    await supabase.from('stock_journal_note').delete().eq('id', id)
    setNotes(x => x.filter(n => n.id !== id))
  }

  if (!uid) {
    return (
      <div style={{ marginTop: 10, fontSize: 11.5, color: T.muted }}>
        {en ? '· Sign in to add your own notes to this record.' : '· 로그인하면 이 기록에 내 메모를 남길 수 있어요.'}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', color: T.teal, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
        {open ? (en ? '내 메모 접기 ▲' : '내 메모 접기 ▲') : `${en ? 'My notes' : '내 메모'} (${notes.length}) ▼`}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add() }}
              maxLength={2000}
              placeholder={en ? 'Why did you follow or skip this? What did you learn?' : '왜 따라갔는지 / 왜 안 했는지, 배운 점을 남겨보세요'}
              style={{ flex: 1, padding: '8px 11px', borderRadius: 8, fontSize: 12.5,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }} />
            <button onClick={add} disabled={busy || !text.trim()}
              style={{ padding: '0 13px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', border: 'none',
                background: text.trim() ? T.teal : 'rgba(255,255,255,0.06)', color: text.trim() ? T.onTeal : T.muted }}>
              {en ? 'Add' : '기록'}
            </button>
          </div>
          {notes.map(n => (
            <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 7, fontSize: 12.5, color: T.text }}>
              <span style={{ color: T.muted, fontSize: 11, flexShrink: 0, minWidth: 62 }}>
                {new Date(n.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
              </span>
              <span style={{ flex: 1, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{n.note}</span>
              <button onClick={() => del(n.id)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

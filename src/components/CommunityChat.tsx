'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { T, cardStyle } from '@/lib/theme'

// 익명 실시간 커뮤니티 채팅 — Supabase Realtime. 로그인 없이 세션 닉네임 자동생성.
// 운영자는 대화에 개입해 종목 리딩/권유하지 않음(§규제). 사용자 간 자유 토론 게시판.
type Msg = { id: number; nick: string; body: string; created_at: string }

const HEX = '0123456789ABCDEF'
function makeNick() {
  let s = ''
  for (let i = 0; i < 4; i++) s += HEX[Math.floor(Math.random() * 16)]
  return '익명-' + s
}

export default function CommunityChat() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [nick, setNick] = useState('')
  const [sending, setSending] = useState(false)
  const lastSent = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let n = localStorage.getItem('navcp_stock_nick')
    if (!n) { n = makeNick(); localStorage.setItem('navcp_stock_nick', n) }
    setNick(n)

    supabase.from('stock_chat').select('*').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setMsgs(((data as Msg[]) || []).reverse()))

    const ch = supabase
      .channel('stock_chat_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_chat' },
        payload => setMsgs(m => (m.some(x => x.id === (payload.new as Msg).id) ? m : [...m, payload.new as Msg].slice(-120))))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }) }, [msgs])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    if (Date.now() - lastSent.current < 2000) return   // 도배 방지 2초
    setSending(true)
    const { error } = await supabase.from('stock_chat').insert({ nick, body: body.slice(0, 300) })
    setSending(false)
    if (!error) { setText(''); lastSent.current = Date.now() }
  }

  const hhmm = (s: string) => { const d = new Date(s); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.cardBr}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.green }} />
        <span style={{ fontWeight: 800, fontSize: 14 }}>실시간 커뮤니티</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.muted }}>{nick}</span>
      </div>

      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 9, minHeight: 220 }}>
        {msgs.length === 0 && <div style={{ fontSize: 13, color: T.muted, margin: 'auto', textAlign: 'center' }}>첫 메시지를 남겨보세요.<br />익명으로 자유롭게 대화해요.</div>}
        {msgs.map(m => {
          const mine = m.nick === nick
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 2, textAlign: mine ? 'right' : 'left' }}>{mine ? '나' : m.nick} · {hhmm(m.created_at)}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, padding: '7px 11px', borderRadius: 12, wordBreak: 'break-word',
                background: mine ? T.teal : 'rgba(255,255,255,0.06)', color: mine ? T.onTeal : T.text }}>{m.body}</div>
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: `1px solid ${T.cardBr}`, padding: 10, display: 'flex', gap: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }}
          maxLength={300} placeholder="메시지 입력…"
          style={{ flex: 1, padding: '9px 12px', borderRadius: 10, fontSize: 13.5, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }} />
        <button onClick={send} disabled={sending || !text.trim()}
          style={{ padding: '0 16px', borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: 'pointer', border: 'none',
            background: text.trim() ? T.teal : 'rgba(255,255,255,0.06)', color: text.trim() ? T.onTeal : T.muted }}>전송</button>
      </div>
      <div style={{ padding: '0 12px 10px', fontSize: 10.5, color: T.muted, lineHeight: 1.5 }}>
        ※ 익명 게시판입니다. 특정 종목 매수·매도 권유(리딩) 및 허위·비방은 삼가주세요.
      </div>
    </div>
  )
}

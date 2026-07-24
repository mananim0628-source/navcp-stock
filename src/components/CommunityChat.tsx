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
  const [err, setErr] = useState('')
  const [mod, setMod] = useState('')          // 운영자 토큰(로컬 보관)
  const lastSent = useRef(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let n = localStorage.getItem('navcp_stock_nick')
    if (!n) { n = makeNick(); localStorage.setItem('navcp_stock_nick', n) }
    setNick(n)
    setMod(localStorage.getItem('navcp_mod_token') || '')

    supabase.from('stock_chat').select('*').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setMsgs(((data as Msg[]) || []).reverse()))

    const ch = supabase
      .channel('stock_chat_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_chat' },
        payload => setMsgs(m => (m.some(x => x.id === (payload.new as Msg).id) ? m : [...m, payload.new as Msg].slice(-120))))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'stock_chat' },
        payload => setMsgs(m => m.filter(x => x.id !== (payload.old as Msg).id)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => { boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight }) }, [msgs])

  async function send() {
    const body = text.trim()
    if (!body || sending) return
    if (Date.now() - lastSent.current < 2000) { setErr('잠시 후 다시 시도해 주세요.'); return }
    setSending(true); setErr('')
    const { error } = await supabase.from('stock_chat').insert({ nick, body: body.slice(0, 300) })
    setSending(false)
    if (error) {
      // DB 트리거 차단 사유(금지어·도배·중복)를 그대로 안내
      setErr((error as any).hint || (error.message?.includes('BLOCKED') ? '리딩·권유·스팸·욕설은 등록할 수 없습니다.' : '전송에 실패했어요.'))
      return
    }
    setText(''); lastSent.current = Date.now()
  }

  // 운영자 모드: 헤더 제목 더블클릭 → 토큰 입력(로컬 저장). 토큰이 틀리면 삭제 RPC가 false 반환.
  function toggleMod() {
    if (mod) { localStorage.removeItem('navcp_mod_token'); setMod(''); return }
    const t = window.prompt('운영자 토큰')
    if (t) { localStorage.setItem('navcp_mod_token', t.trim()); setMod(t.trim()) }
  }
  async function removeMsg(id: number) {
    const { data } = await supabase.rpc('mod_delete_chat', { p_id: id, p_token: mod })
    if (data === true) setMsgs(m => m.filter(x => x.id !== id))
    else setErr('삭제 권한이 없습니다.')
  }

  const hhmm = (s: string) => { const d = new Date(s); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${T.cardBr}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.green }} />
        <span onDoubleClick={toggleMod} style={{ fontWeight: 800, fontSize: 14, cursor: 'default', userSelect: 'none' }}>실시간 커뮤니티</span>
        {mod && <span style={{ fontSize: 10, color: T.gold, fontWeight: 700 }}>운영자</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.muted }}>{nick}</span>
      </div>

      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 9, minHeight: 220 }}>
        {msgs.length === 0 && <div style={{ fontSize: 13, color: T.muted, margin: 'auto', textAlign: 'center' }}>첫 메시지를 남겨보세요.<br />익명으로 자유롭게 대화해요.</div>}
        {msgs.map(m => {
          const mine = m.nick === nick
          return (
            <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 2, textAlign: mine ? 'right' : 'left' }}>
                {mine ? '나' : m.nick} · {hhmm(m.created_at)}
                {mod && <button onClick={() => removeMsg(m.id)} title="삭제"
                  style={{ marginLeft: 6, background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 11, padding: 0 }}>🗑</button>}
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.5, padding: '7px 11px', borderRadius: 12, wordBreak: 'break-word',
                background: mine ? T.teal : 'rgba(255,255,255,0.06)', color: mine ? T.onTeal : T.text }}>{m.body}</div>
            </div>
          )
        })}
      </div>

      {err && <div style={{ padding: '6px 12px', fontSize: 11.5, color: T.red, borderTop: `1px solid ${T.cardBr}` }}>⚠️ {err}</div>}
      <div style={{ borderTop: err ? 'none' : `1px solid ${T.cardBr}`, padding: 10, display: 'flex', gap: 8 }}>
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

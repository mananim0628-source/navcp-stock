'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { T, cardStyle } from '@/lib/theme'

// 알림 설정 — 이메일이 기본. SMS를 켤 때만 전화번호를 [선택]으로 받는다(최소수집 원칙 §16).
// 광고성 정보 수신은 정보통신망법 §50에 따라 **별도 동의**로 분리한다.
export default function AlertPrefs({ lang = 'ko' }: { lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const [uid, setUid] = useState<string | null>(null)
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [onGrade, setOnGrade] = useState(true)
  const [threshold, setThreshold] = useState<string>('')
  const [phone, setPhone] = useState('')
  const [marketing, setMarketing] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser()
      const id = u.user?.id ?? null
      setUid(id)
      if (!id) return
      const [{ data: p }, { data: pr }] = await Promise.all([
        supabase.from('stock_alert_pref').select('*').maybeSingle(),
        supabase.from('stock_profile').select('*').maybeSingle(),
      ])
      if (p) { setChannel(p.channel === 'sms' ? 'sms' : 'email'); setOnGrade(!!p.on_grade_change); setThreshold(p.on_threshold != null ? String(p.on_threshold) : '') }
      if (pr) { setPhone(pr.phone ?? ''); setMarketing(!!pr.marketing_opt_in) }
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => load())
    return () => sub.subscription.unsubscribe()
  }, [])

  async function save() {
    if (!uid) return
    const th = threshold.trim() === '' ? null : Math.max(0, Math.min(100, Number(threshold)))
    await supabase.from('stock_alert_pref').upsert({
      user_id: uid, channel, on_grade_change: onGrade, on_threshold: Number.isFinite(th as number) ? th : null, updated_at: new Date().toISOString(),
    })
    // 전화번호는 SMS를 선택했을 때만 저장. 채널을 이메일로 되돌리면 지운다(불필요 보관 방지).
    await supabase.from('stock_profile').upsert({
      user_id: uid,
      phone: channel === 'sms' ? (phone.trim() || null) : null,
      marketing_opt_in: marketing,
    })
    setSaved(en ? 'Saved.' : '저장했습니다.')
    setTimeout(() => setSaved(''), 2500)
  }

  if (!uid) {
    return (
      <div style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{en ? '🔔 Alerts' : '🔔 알림 설정'}</div>
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>
          {en ? 'Sign in to set up alerts for your watchlist.' : '로그인하면 관심종목 알림을 설정할 수 있어요.'}
        </p>
      </div>
    )
  }

  const Row = ({ children }: { children: React.ReactNode }) => (
    <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
  )

  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{en ? '🔔 Alerts' : '🔔 알림 설정'}</div>
      <p style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
        {en ? 'Alerts cover your watchlist only. They report score changes — they are not buy or sell recommendations.'
            : '관심종목에 대해서만 발송됩니다. 점수 변화를 알려주는 것이며 매수·매도 권유가 아닙니다.'}
      </p>

      <Row>
        <span style={{ fontSize: 12.5, color: T.muted, minWidth: 62 }}>{en ? 'Channel' : '채널'}</span>
        {(['email', 'sms'] as const).map(c => (
          <button key={c} onClick={() => setChannel(c)}
            style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: channel === c ? T.teal : 'transparent', color: channel === c ? T.onTeal : T.muted,
              border: `1px solid ${channel === c ? T.teal : T.cardBr}` }}>
            {c === 'email' ? (en ? 'Email' : '이메일') : 'SMS'}
          </button>
        ))}
        <span style={{ fontSize: 11, color: T.muted }}>{en ? '(Telegram coming later)' : '(텔레그램 추후 지원)'}</span>
      </Row>

      {channel === 'sms' && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${T.cardBr}`, background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>
            {en ? 'Phone number ' : '휴대전화번호 '}<span style={{ color: T.amber }}>{en ? '(optional)' : '(선택)'}</span>
          </div>
          <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel"
            placeholder={en ? '010-0000-0000' : '010-0000-0000'}
            style={{ width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 9, fontSize: 13,
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }} />
          <p style={{ fontSize: 11, color: T.muted, marginTop: 7, lineHeight: 1.6 }}>
            {en ? '※ Collected only to send the SMS alerts you requested. Switching back to email deletes it. Not required to use the service.'
                : '※ 신청하신 SMS 알림 발송 목적으로만 수집합니다. 채널을 이메일로 바꾸면 삭제됩니다. 서비스 이용에 필수가 아닙니다.'}
          </p>
        </div>
      )}

      <Row>
        <label style={{ display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer', fontSize: 12.5 }}>
          <input type="checkbox" checked={onGrade} onChange={e => setOnGrade(e.target.checked)} />
          {en ? 'When a watched stock changes grade' : '관심종목 등급이 바뀌면'}
        </label>
      </Row>
      <Row>
        <span style={{ fontSize: 12.5, color: T.muted, minWidth: 62 }}>{en ? 'Score ≥' : '점수 도달'}</span>
        <input value={threshold} onChange={e => setThreshold(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
          placeholder={en ? 'e.g. 78 (blank = off)' : '예: 78 (비우면 미사용)'}
          style={{ width: 170, padding: '8px 11px', borderRadius: 9, fontSize: 13,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }} />
      </Row>

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={marketing} onChange={e => setMarketing(e.target.checked)} style={{ marginTop: 2 }} />
        <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.6 }}>
          {en ? <>Receive occasional service news and promotional messages <b style={{ color: T.text }}>(optional)</b></>
              : <>서비스 소식·광고성 정보 수신에 동의합니다 <b style={{ color: T.text }}>(선택)</b> — 동의하지 않아도 알림 기능은 정상 이용됩니다.</>}
        </span>
      </label>

      <button onClick={save}
        style={{ marginTop: 14, padding: '10px 18px', borderRadius: 9, fontWeight: 800, fontSize: 13,
          cursor: 'pointer', border: 'none', background: T.teal, color: T.onTeal }}>
        {en ? 'Save' : '저장'}
      </button>
      {saved && <span style={{ marginLeft: 10, fontSize: 12, color: T.green, fontWeight: 700 }}>{saved}</span>}

      <p style={{ fontSize: 11, color: T.muted, marginTop: 12, lineHeight: 1.6 }}>
        {en ? '※ Alert delivery is being wired up; settings are saved now and take effect when sending goes live.'
            : '※ 발송 파이프라인은 연결 작업 중입니다. 설정은 지금 저장되며 발송이 가동되면 그대로 적용됩니다.'}
      </p>
    </div>
  )
}

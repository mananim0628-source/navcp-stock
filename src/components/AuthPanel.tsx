'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { T, cardStyle } from '@/lib/theme'

// 매직링크 로그인 — 비밀번호를 저장하지 않아 유출 위험 자체가 없다.
// ⚠️ 개인정보 최소수집(개인정보보호법 §16): 이메일만 필수. 전화번호는 SMS 알림 신청자만 [선택].
export default function AuthPanel({ lang = 'ko' }: { lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const [email, setEmail] = useState('')
  const [agree, setAgree] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [user, setUser] = useState<{ email?: string } | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { email: data.user.email ?? undefined } : null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ? { email: s.user.email ?? undefined } : null))
    return () => sub.subscription.unsubscribe()
  }, [])

  async function sendLink() {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setErr(en ? 'Enter a valid email.' : '올바른 이메일을 입력해 주세요.'); return }
    if (!agree) { setErr(en ? 'Please agree to the privacy policy.' : '개인정보 수집·이용에 동의해 주세요.'); return }
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    })
    setBusy(false)
    if (error) { setErr(en ? 'Failed to send. Try again shortly.' : '전송에 실패했어요. 잠시 후 다시 시도해 주세요.'); return }
    setSent(true)
  }

  if (user) {
    return (
      <div style={{ ...cardStyle, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 13, color: T.muted }}>{en ? 'Signed in as' : '로그인 계정'}</div>
        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{user.email}</div>
        <button onClick={() => supabase.auth.signOut()}
          style={{ marginTop: 12, padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${T.cardBr}`, color: T.muted }}>
          {en ? 'Sign out' : '로그아웃'}
        </button>
      </div>
    )
  }

  if (sent) {
    return (
      <div style={{ ...cardStyle, borderRadius: 14, padding: 18, borderLeft: `3px solid ${T.teal}` }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{en ? 'Check your inbox' : '메일함을 확인해 주세요'}</div>
        <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.7, marginTop: 8 }}>
          {en
            ? `We sent a sign-in link to ${email}. Open it on this device to finish signing in. No password needed.`
            : `${email} 로 로그인 링크를 보냈습니다. 이 기기에서 링크를 열면 로그인이 완료돼요. 비밀번호는 필요 없습니다.`}
        </p>
      </div>
    )
  }

  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{en ? 'Free sign-up' : '무료 회원가입'}</div>
      <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, marginTop: 6 }}>
        {en
          ? 'Email only — no password. Sign in with a one-time link to save watchlists and receive alerts.'
          : '이메일만 있으면 됩니다 — 비밀번호 없이 일회용 링크로 로그인해요. 관심종목 저장과 알림에 사용됩니다.'}
      </p>

      <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email"
        onKeyDown={e => { if (e.key === 'Enter') sendLink() }}
        placeholder={en ? 'you@example.com' : '이메일 주소'}
        style={{ width: '100%', marginTop: 12, padding: '11px 13px', borderRadius: 10, fontSize: 14,
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }} />

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
        <span style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.6 }}>
          {en ? <>I agree to the collection and use of my email for account identification and alerts. <a href="/privacy" style={{ color: T.teal }}>Privacy Policy</a> <b style={{ color: T.text }}>(required)</b></>
              : <>회원 식별·알림 발송을 위한 <b style={{ color: T.text }}>이메일 수집·이용</b>에 동의합니다. <a href="/privacy" style={{ color: T.teal }}>개인정보 처리방침</a> <b style={{ color: T.text }}>(필수)</b></>}
        </span>
      </label>

      {err && <div style={{ fontSize: 11.5, color: T.red, marginTop: 8 }}>⚠️ {err}</div>}

      <button onClick={sendLink} disabled={busy}
        style={{ width: '100%', marginTop: 12, padding: '11px 0', borderRadius: 10, fontWeight: 800, fontSize: 14,
          cursor: 'pointer', border: 'none', background: T.teal, color: T.onTeal, opacity: busy ? 0.6 : 1 }}>
        {busy ? (en ? 'Sending…' : '전송 중…') : (en ? 'Send sign-in link' : '로그인 링크 받기')}
      </button>

      <p style={{ fontSize: 11, color: T.muted, marginTop: 10, lineHeight: 1.6 }}>
        {en
          ? '※ Phone number is optional and only requested if you turn on SMS alerts. All scores and analysis remain free without an account.'
          : '※ 전화번호는 SMS 알림을 켤 때만 [선택]으로 받습니다. 회원가입 없이도 모든 점수·분석은 무료로 보실 수 있어요.'}
      </p>
    </div>
  )
}

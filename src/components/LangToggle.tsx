'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { T } from '@/lib/theme'

// 한/영 전환 — 쿠키에 저장 후 router.refresh()로 서버 재렌더.
// (페이지가 서버 컴포넌트라 Context 대신 쿠키를 쓴다)
export default function LangToggle({ lang }: { lang: 'ko' | 'en' }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const next = lang === 'ko' ? 'en' : 'ko'
  return (
    <button
      onClick={() => {
        document.cookie = `navcp_lang=${next}; path=/; max-age=31536000; samesite=lax`
        start(() => router.refresh())
      }}
      aria-label={lang === 'ko' ? 'Switch to English' : '한국어로 전환'}
      style={{
        border: `1px solid ${T.cardBr}`, borderRadius: 8, padding: '3px 9px',
        fontSize: 11.5, fontWeight: 800, background: 'transparent',
        color: pending ? T.muted : T.text, cursor: 'pointer', letterSpacing: 0.3,
      }}
    >
      {lang === 'ko' ? 'EN' : '한국어'}
    </button>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { T, cardStyle } from '@/lib/theme'
import { trFiling } from '@/lib/terms'

// 공시 피드 — 기본 6건, '펼치기'로 전체 확인. 국내 DART + 미국 SEC 8-K 통합(국가 배지로 구분).
export type FilingItem = { symbol: string; name: string; nm?: string; dt?: string; us: boolean }

const fmtDt = (dt?: string) => (dt && dt.length === 8 ? `${+dt.slice(4, 6)}/${+dt.slice(6, 8)}` : '')

export default function FilingFeed({
  title, items, color, empty, lang = 'ko', initial = 6,
}: { title: string; items: FilingItem[]; color: string; empty: string; lang?: 'ko' | 'en'; initial?: number }) {
  const [open, setOpen] = useState(false)
  const en = lang === 'en'
  const shown = open ? items : items.slice(0, initial)
  const more = items.length - initial

  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color }}>{title}</span>
        <span style={{ fontSize: 11, color: T.muted }}>{items.length}{en ? '' : '건'}</span>
      </div>

      {shown.length === 0 ? (
        <div style={{ fontSize: 13, color: T.muted, padding: '8px 0' }}>{empty}</div>
      ) : (
        <>
          {/* 펼쳤을 때만 자체 스크롤 — 페이지가 지나치게 길어지는 것 방지 */}
          <div style={{ maxHeight: open ? 340 : 'none', overflowY: open ? 'auto' : 'visible' }}>
            {shown.map((f, i) => (
              <Link key={`${f.symbol}-${f.dt}-${i}`} href={`/scores/${f.symbol}`}
                style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '7px 0', borderTop: i ? `1px solid ${T.cardBr}` : 'none', textDecoration: 'none', color: T.text }}>
                <span style={{
                  fontSize: 10, fontWeight: 900, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 5,
                  background: f.us ? T.us : T.kr, color: '#0b1020', flexShrink: 0,
                }}>{f.us ? 'US' : 'KR'}</span>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 62, maxWidth: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 13, color: T.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trFiling(f.nm, lang)}</span>
                <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{fmtDt(f.dt)}</span>
              </Link>
            ))}
          </div>

          {more > 0 && (
            <button onClick={() => setOpen(o => !o)}
              style={{
                width: '100%', marginTop: 10, padding: '8px 0', borderRadius: 9, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${T.cardBr}`, color: T.muted,
                fontSize: 12, fontWeight: 700,
              }}>
              {open
                ? (en ? 'Collapse ▲' : '접기 ▲')
                : (en ? `Show ${more} more ▼` : `${more}건 더 보기 ▼`)}
            </button>
          )}
        </>
      )}
    </div>
  )
}

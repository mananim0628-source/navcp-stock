'use client'

import { useEffect, useState } from 'react'
import { T } from '@/lib/theme'

// 장 운영 상태 — 토스 market-calendar 실측 기준(응답이 KST 오프셋으로 오므로 그대로 비교).
// 토스 UX 원칙 '점진적 노출': 지금 필요한 한 줄(열림/닫힘 + 남은 시간)만 크게, 세부 세션은 작게.
export type Session = { label: string; start: string; end: string }
export type MarketDay = { flag: string; name: string; sessions: Session[] }

function fmtLeft(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}시간 ${m % 60}분` : `${m}분`
}
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

export default function MarketClock({ markets }: { markets: MarketDay[] }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {markets.map(mk => {
        const cur = now == null ? null : mk.sessions.find(s => now >= +new Date(s.start) && now < +new Date(s.end))
        const next = now == null ? null : mk.sessions.filter(s => +new Date(s.start) > now).sort((a, b) => +new Date(a.start) - +new Date(b.start))[0]
        const open = !!cur && cur.label === '정규장'
        const dot = now == null ? T.muted : open ? T.green : cur ? T.amber : T.muted
        return (
          <div key={mk.name} style={{
            flex: 1, minWidth: 200, borderRadius: 12, padding: '10px 13px',
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.cardBr}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, fontWeight: 800 }}>{mk.flag} {mk.name}</span>
              {/* 색만으로 전달하지 않도록 텍스트 라벨 병기 */}
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, color: dot }}>
                {now == null ? '…' : cur ? (open ? '정규장' : cur.label) : '장 마감'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>
              {now == null ? ' '
                : cur ? `${hhmm(cur.start)}–${hhmm(cur.end)} · ${fmtLeft(+new Date(cur.end) - now)} 남음`
                : next ? `다음 ${next.label} ${hhmm(next.start)} · ${fmtLeft(+new Date(next.start) - now)} 뒤`
                : '오늘 일정 종료'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

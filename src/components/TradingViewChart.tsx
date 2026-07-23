'use client'

import { useEffect, useRef } from 'react'

// 트레이딩뷰 고급차트 임베드 — 국내종목 심볼 KRX:{code}. 지표(RSI·이평 등) 사용자가 추가 가능.
// 토스도 트레이딩뷰 기반. 다크테마 고정, 반응형.
export default function TradingViewChart({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    ref.current.innerHTML = ''
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    s.type = 'text/javascript'
    s.async = true
    // 표준 최소 설정 — 커스텀 필드가 많으면 심볼이 거부되어 데모(AAPL)로 폴백됨.
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `KRX:${code}`,
      interval: 'D',
      timezone: 'Asia/Seoul',
      theme: 'dark',
      style: '1',
      locale: 'kr',
      allow_symbol_change: false,
      support_host: 'https://www.tradingview.com',
    })
    ref.current.appendChild(s)
  }, [code])

  return (
    <div style={{ height: 460, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(120,150,220,0.14)' }}>
      <div ref={ref} className="tradingview-widget-container" style={{ height: '100%', width: '100%' }}>
        <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  )
}

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
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `KRX:${code}`,
      interval: 'D',
      timezone: 'Asia/Seoul',
      theme: 'dark',
      style: '1',
      locale: 'kr',
      backgroundColor: 'rgba(14,20,38,0.6)',
      gridColor: 'rgba(120,150,220,0.08)',
      hide_side_toolbar: false,
      allow_symbol_change: false,
      studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'],
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

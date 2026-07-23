import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '투자나침반 주식 — 7팩터로 읽는 국내 증시',
  description:
    '국내 종목을 거시·수급·재무·기술 등 7가지 관점으로 점수화해 공개합니다. 특정 종목 추천이 아닌 분석·교육 목적이며, 무료 공개 도구입니다.',
  metadataBase: new URL('https://stock.navcp.xyz'),
  openGraph: {
    title: '투자나침반 주식 — 7팩터로 읽는 국내 증시',
    description: '국내 종목 7팩터 점수 공개. 종목 추천이 아닌 분석·교육 도구이며 무료입니다.',
    url: 'https://stock.navcp.xyz',
    siteName: '투자나침반 주식',
    locale: 'ko_KR',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}

import type { MarketDay, Session } from '@/components/MarketClock'

// 토스 Open API — 서버에서만 호출(클라이언트에 시크릿 노출 금지). 장 운영시간 전용.
// ⚠️ 주문(/orders) 계열은 규제상(투자일임·자동매매 배제) 절대 사용하지 않는다.
const BASE = 'https://openapi.tossinvest.com'

async function token(): Promise<string | null> {
  const id = process.env.TOSS_CLIENT_ID, secret = process.env.TOSS_CLIENT_SECRET
  if (!id || !secret) return null
  try {
    const r = await fetch(`${BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
      next: { revalidate: 3000 },
    })
    if (!r.ok) return null
    return (await r.json()).access_token ?? null
  } catch { return null }
}

const sess = (label: string, o: any): Session | null =>
  o?.startTime && o?.endTime ? { label, start: o.startTime, end: o.endTime } : null

// 실측 응답 구조: KR = result.today.integrated{preMarket,regularMarket,afterMarket}
//                US = result.today{dayMarket,preMarket,regularMarket,afterMarket}
export async function marketHours(): Promise<MarketDay[]> {
  const t = await token()
  if (!t) return []
  const get = async (c: 'KR' | 'US') => {
    try {
      const r = await fetch(`${BASE}/api/v1/market-calendar/${c}`, {
        headers: { Authorization: `Bearer ${t}` }, next: { revalidate: 1800 },
      })
      if (!r.ok) return null
      return (await r.json())?.result?.today ?? null
    } catch { return null }
  }
  const [kr, us] = await Promise.all([get('KR'), get('US')])
  const out: MarketDay[] = []
  if (kr?.integrated) {
    const g = kr.integrated
    const s = [sess('프리마켓', g.preMarket), sess('정규장', g.regularMarket), sess('애프터마켓', g.afterMarket)].filter(Boolean) as Session[]
    if (s.length) out.push({ flag: '🇰🇷', name: '국내 증시', sessions: s })
  }
  if (us) {
    const s = [sess('데이마켓', us.dayMarket), sess('프리마켓', us.preMarket), sess('정규장', us.regularMarket), sess('애프터마켓', us.afterMarket)].filter(Boolean) as Session[]
    if (s.length) out.push({ flag: '🇺🇸', name: '미국 증시', sessions: s })
  }
  return out
}

// 보조지표 — 국내·미국 엔진 공용. 전부 **이미 받아둔 캔들**로 계산해 추가 API 호출이 없다.
// 근거: 학술적으로 검증된 팩터는 가치·모멘텀·규모·퀄리티·저변동성·수익성.
//       우리 7팩터는 가치/퀄리티/수익성·수급·공시·공매도를 이미 다루므로
//       여기서는 **모멘텀·저변동성·상대강도**를 보강하고, 매매 판단용 **ATR**을 추가한다.
// ⚠️ 이 값들은 점수(7팩터 100점)에 합산하지 않는다. 팩터 배점을 바꾸면 과거 이력과 비교가 깨지기 때문.
//    보조지표는 별도 필드로 저장해 '참고 정보'로만 쓴다.

const mean = a => a.reduce((x, y) => x + y, 0) / a.length

// 중기 모멘텀 — 최근 1개월(21거래일)을 제외한 상승률.
// 학술 표준은 12-1개월(252봉)이지만 우리 캔들은 최대 200봉이라 **약 9개월** 구간이다.
// 있는 그대로 라벨링한다(mom_months로 실제 구간을 함께 저장).
export function momentum(rows) {
  if (!rows || rows.length < 80) return null
  const c = rows.map(r => r.c)
  const skip = 21                                  // 최근 1개월 제외(단기 반전 효과 회피)
  const endIdx = c.length - 1 - skip
  if (endIdx < 40) return null
  const startIdx = Math.max(0, c.length - 200)
  const base = c[startIdx], end = c[endIdx]
  if (!(base > 0) || !(end > 0)) return null
  const bars = endIdx - startIdx
  return {
    value: +(((end - base) / base) * 100).toFixed(2),
    months: +(bars / 21).toFixed(1),               // 실제 측정 구간(개월)
  }
}

// 실현 변동성 — 일간 수익률 표준편차의 연환산(%). 낮을수록 저변동성 팩터에 우호적.
export function realizedVol(rows, n = 20) {
  if (!rows || rows.length < n + 1) return null
  const c = rows.map(r => r.c).slice(-(n + 1))
  const rets = []
  for (let i = 1; i < c.length; i++) if (c[i - 1] > 0) rets.push(Math.log(c[i] / c[i - 1]))
  if (rets.length < 5) return null
  const m = mean(rets)
  const sd = Math.sqrt(mean(rets.map(r => (r - m) ** 2)))
  return +(sd * Math.sqrt(252) * 100).toFixed(1)   // 연환산 %
}

// ATR(14) — 손절·목표 폭 산정용. 종가 대비 %로도 함께 준다.
export function atr(rows, n = 14) {
  if (!rows || rows.length < n + 1) return null
  const w = rows.slice(-(n + 1))
  const trs = []
  for (let i = 1; i < w.length; i++) {
    const p = w[i - 1].c, h = w[i].h, l = w[i].l
    if (![p, h, l].every(Number.isFinite)) continue
    trs.push(Math.max(h - l, Math.abs(h - p), Math.abs(l - p)))
  }
  if (trs.length < 5) return null
  const a = mean(trs)
  const last = rows[rows.length - 1].c
  return { value: +a.toFixed(2), pct: last > 0 ? +((a / last) * 100).toFixed(2) : null }
}

// 상대강도 — 같은 기간 지수 대비 초과 상승률(%p). 양수면 시장보다 강함.
// ⚠️ 배열 위치가 아니라 **날짜**로 맞춘다(휴장일·거래정지로 종목/지수 거래일 수가 달라지면
//    위치 정렬은 서로 다른 날짜를 비교하게 됨 — 크립토 rel_strength 버그와 같은 유형).
export function relStrength(rows, bench, n = 60) {
  if (!rows || rows.length < n + 1 || !bench || bench.size < n + 1) return null
  const nowD = rows[rows.length - 1].d          // YYYYMMDD
  const pastD = rows[rows.length - 1 - n].d
  // 벤치마크에서 해당 날짜(없으면 그 이전 최근 거래일) 종가를 찾는다
  const benchAt = ymd => {
    if (bench.has(ymd)) return bench.get(ymd)
    let best = null, bestD = ''
    for (const [d, v] of bench) if (d <= ymd && d > bestD) { bestD = d; best = v }
    return best
  }
  const sNow = rows[rows.length - 1].c, sPast = rows[rows.length - 1 - n].c
  const bNow = benchAt(nowD), bPast = benchAt(pastD)
  if (![sNow, sPast, bNow, bPast].every(v => Number.isFinite(v) && v > 0)) return null
  const sR = (sNow / sPast - 1) * 100
  const bR = (bNow / bPast - 1) * 100
  return +(sR - bR).toFixed(2)
}

// 야후에서 지수 (날짜→종가) Map 반환 — 상대강도 벤치마크. 실패해도 엔진을 막지 않는다.
export async function benchCloses(symbol) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!r.ok) return null
    const res = (await r.json())?.chart?.result?.[0]
    const ts = res?.timestamp || []
    const cl = res?.indicators?.quote?.[0]?.close || []
    const m = new Map()
    for (let i = 0; i < ts.length; i++) {
      if (!Number.isFinite(cl[i])) continue
      const d = new Date(ts[i] * 1000).toISOString().slice(0, 10).replace(/-/g, '')  // YYYYMMDD
      m.set(d, cl[i])
    }
    return m.size > 70 ? m : null
  } catch { return null }
}

// 한 번에 계산해 scores에 넣을 형태로 반환
export function extras(rows, bench) {
  const m = momentum(rows), a = atr(rows)
  return {
    mom: m?.value ?? null,
    mom_months: m?.months ?? null,
    vol20: realizedVol(rows, 20),
    atr14: a?.value ?? null,
    atr_pct: a?.pct ?? null,
    rs60: relStrength(rows, bench, 60),
  }
}

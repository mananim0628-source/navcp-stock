// 미국 종목 7팩터 스코어링 — 토스(시세·캔들·종목정보) + SEC EDGAR(재무) + 자체 거시.
// ⚠️ 정직성 원칙(크립토 ZAMA 교훈): 측정 못 한 팩터는 추정하지 않고 naFactors로 표기하고,
//    total은 **측정된 배점만으로 정규화**한다. coverage를 반드시 함께 저장.
// v3 측정: 거시12 · 수급13(CMF) · 재무20 · 공시15 · 공매도15 · 기술20 · 전략5 = 최대 100%.
//   단, 수급은 국내의 '외국인·기관 순매수'와 **다른 지표**(거래량 기반 자금흐름)임을 UI에 반드시 표기.
// ⚠️ 토스 주문(/orders) 계열은 규제상(투자일임·자동매매 배제) 절대 사용하지 않는다.

const TOSS_ID = process.env.TOSS_CLIENT_ID, TOSS_SECRET = process.env.TOSS_CLIENT_SECRET
const TOSS_BASE = 'https://openapi.tossinvest.com'
// ⚠️ VPS 루트 env의 SUPABASE_URL은 **다른 프로젝트**(조각)를 가리킨다 → 절대 쓰지 말 것.
// 국내 엔진과 동일하게 NEXT_PUBLIC_SUPABASE_URL만 참조(미설정 시 navcp 기본값).
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lpdhtagnbqwjagtmifug.supabase.co'
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SEC_UA = { 'User-Agent': 'navcp-stock research contact@navcp.xyz', 'Accept-Encoding': 'gzip, deflate' }
const TARGET = Number(process.env.US_TARGET || 100)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const mean = a => a.reduce((x, y) => x + y, 0) / a.length

// ───────── 토스 ─────────
let _tok = null, _exp = 0
async function tossToken() {
  if (!TOSS_ID || !TOSS_SECRET) throw new Error('TOSS 키 없음')
  if (_tok && Date.now() < _exp) return _tok
  const r = await fetch(`${TOSS_BASE}/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: TOSS_ID, client_secret: TOSS_SECRET }),
  })
  if (!r.ok) throw new Error('toss token ' + r.status)
  const j = await r.json()
  _tok = j.access_token; _exp = Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000
  return _tok
}
// ⚠️ 과거 사고: 429 외 오류에서 즉시 null을 반환해 **조용히 실패**(에러 로그도 없이 팩터가 통째로 비었음).
//    → 모든 실패를 재시도하고, 끝내 실패하면 반드시 로그를 남긴다.
async function tossGet(path, retries = 4) {
  let lastStatus = ''
  for (let i = 0; i <= retries; i++) {
    try {
      const t = await tossToken()
      const r = await fetch(TOSS_BASE + path, { headers: { Authorization: `Bearer ${t}` } })
      if (r.ok) return await r.json()
      lastStatus = String(r.status)
      if (r.status === 401) { _tok = null; _exp = 0 }          // 토큰 만료 → 재발급
      await sleep(800 * (i + 1))
    } catch (e) { lastStatus = String(e.message).slice(0, 30); await sleep(800 * (i + 1)) }
  }
  console.log(`  ⚠️ toss 실패(${lastStatus}) ${path.split('?')[0]}`)
  return null
}

// ───────── SEC EDGAR (레이트리밋 10req/s → 여유 있게 간격) ─────────
let _cikMap = null
async function cikOf(ticker) {
  if (!_cikMap) {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: SEC_UA })
    if (!r.ok) throw new Error('sec tickers ' + r.status)
    const j = await r.json()
    _cikMap = new Map(Object.values(j).map(x => [String(x.ticker).toUpperCase(), String(x.cik_str).padStart(10, '0')]))
  }
  return _cikMap.get(ticker.toUpperCase()) || null
}
// 같은 태그의 최신 연간(10-K) 값. end 날짜 기준 최신 우선, 중복(fy 재기재) 제거.
const ANNUAL_FORMS = new Set(['10-K', '20-F', '40-F', '10-K/A', '20-F/A'])   // 국내기업·외국기업(20-F)·캐나다(40-F)
function latestAnnual(fact, unit) {
  const arr = fact?.units?.[unit]
  if (!Array.isArray(arr)) return null
  const ann = arr.filter(u => ANNUAL_FORMS.has(u.form) && u.end)
  if (!ann.length) return null
  const byEnd = new Map()
  for (const u of ann) byEnd.set(u.end, u)          // 같은 end면 나중 것(정정본)이 남음
  const sorted = [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end))
  return sorted[sorted.length - 1] || null
}
function prevAnnual(fact, unit) {
  const arr = fact?.units?.[unit]
  if (!Array.isArray(arr)) return null
  const byEnd = new Map()
  for (const u of arr.filter(u => ANNUAL_FORMS.has(u.form) && u.end)) byEnd.set(u.end, u)
  const s = [...byEnd.values()].sort((a, b) => a.end.localeCompare(b.end))
  return s.length >= 2 ? s[s.length - 2] : null
}
const pick = (facts, ...tags) => { for (const t of tags) if (facts?.[t]) return facts[t]; return null }

async function secFinancials(ticker, price, shares) {
  const cik = await cikOf(ticker)
  if (!cik) return null
  const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: SEC_UA })
  if (!r.ok) return null
  // 외국기업은 us-gaap 대신 ifrs-full 네임스페이스로 제출한다 → 병합해서 조회(커버리지 폴백)
  const facts = (await r.json())?.facts
  if (!facts) return null
  const g = { ...(facts['ifrs-full'] || {}), ...(facts['us-gaap'] || {}) }
  if (!Object.keys(g).length) return null

  const epsF = pick(g, 'EarningsPerShareDiluted', 'EarningsPerShareBasic',
    'DilutedEarningsLossPerShare', 'BasicEarningsLossPerShare')                      // ifrs-full
  const eqF = pick(g, 'StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'Equity', 'EquityAttributableToOwnersOfParent')                                   // ifrs-full
  const revF = pick(g, 'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet',
    'Revenue', 'RevenueFromContractsWithCustomers')                                   // ifrs-full
  const liaF = pick(g, 'Liabilities')

  // 단위 폴백: 외국기업은 USD 외 통화로 제출하기도 한다. 단위가 섞이면 비교가 깨지므로
  // **EPS와 BPS가 같은 통화일 때만** 밸류(PER/PBR)를 산출한다.
  const unitOf = (fact, prefer) => {
    const us = Object.keys(fact?.units || {})
    return us.find(u => u === prefer) || us[0] || null
  }
  const epsU = unitOf(epsF, 'USD/shares'), eqU = unitOf(eqF, 'USD')
  const eps = epsU ? latestAnnual(epsF, epsU)?.val ?? null : null
  const eq = eqU ? latestAnnual(eqF, eqU)?.val ?? null : null
  const liaU = unitOf(liaF, 'USD'), revU = unitOf(revF, 'USD')
  const lia = liaU ? latestAnnual(liaF, liaU)?.val ?? null : null
  const rev = revU ? latestAnnual(revF, revU)?.val ?? null : null
  const rev0 = revU ? prevAnnual(revF, revU)?.val ?? null : null
  const sameCcy = epsU && eqU && String(epsU).replace('/shares', '') === String(eqU)

  const bps = (eq != null && shares > 0) ? eq / shares : null
  // 가격은 USD → EPS/BPS가 USD일 때만 PER/PBR이 의미 있다(통화 혼용 방지)
  const usd = epsU === 'USD/shares'
  const per = (usd && eps != null && eps > 0 && price > 0) ? price / eps : null
  const pbr = (usd && bps != null && bps > 0 && price > 0) ? price / bps : null
  // ROE는 EPS/BPS로 산출 → PER·PBR과 내부 정합(국내판 분기EPS 함정 회피)
  const roe = (eps != null && bps != null && bps > 0) ? (eps / bps) * 100 : null
  const debt = (lia != null && eq != null && eq > 0) ? (lia / eq) * 100 : null
  const grs = (rev != null && rev0 != null && rev0 > 0) ? ((rev - rev0) / rev0) * 100 : null
  return { eps, bps, per, pbr, roe, debt, grs }
}

// ───────── FINRA RegSHO 일별 공매도 (무료·인증 불필요) ─────────
// 파일 1개에 전 종목이 들어 있어 **날짜별 1회 요청으로 유니버스 전체**를 채운다.
// 포맷: Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market → 공매도비중 = Short/Total
// 국내판 ssts_vol_rlim(공매도 거래량 비중)과 동일 개념 → 배점·구간 동일 적용 가능.
async function finraShortMap(days = 20) {
  const map = new Map()   // symbol -> [{d, ratio}] 최신순
  const today = new Date()
  let got = 0
  for (let i = 1; i <= days * 2 && got < days; i++) {
    const t = new Date(today.getTime() - i * 86400000)
    const dow = t.getUTCDay()
    if (dow === 0 || dow === 6) continue                       // 주말 스킵
    const ymd = t.toISOString().slice(0, 10).replace(/-/g, '')
    let txt
    try {
      const r = await fetch(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${ymd}.txt`)
      if (!r.ok) continue
      txt = await r.text()
    } catch { continue }
    got++
    for (const line of txt.split('\n')) {
      const p = line.split('|')
      if (p.length < 5 || p[0] === 'Date') continue
      const sym = p[1], sv = Number(p[2]), tv = Number(p[4])
      if (!sym || !(tv > 0) || !Number.isFinite(sv)) continue
      if (!map.has(sym)) map.set(sym, [])
      map.get(sym).push({ d: ymd, ratio: (sv / tv) * 100 })
    }
    await sleep(120)
  }
  for (const arr of map.values()) arr.sort((a, b) => b.d.localeCompare(a.d))   // 최신순
  console.log(`[US] FINRA 공매도 ${got}일치 · ${map.size}종목`)
  return map
}
// ⚠️ FINRA ShortVolume은 '공매도 잔고'가 아니라 **시장조성자 헤지가 포함된 short-flagged 거래량**이다.
//    미국은 40% 내외가 정상 수준이라, 국내 ssts_vol_rlim 기준(15% 미만=우호)을 그대로 쓰면
//    전 종목이 최저 구간으로 몰린다. → **미국 유니버스 내 상대 백분위**로 판정한다.
function computeDerivative(list, cuts) {
  if (!list || list.length < 5 || !cuts) return null
  const r = list.map(x => x.ratio)
  const avg = mean(r)
  const recent = mean(r.slice(0, Math.min(5, r.length)))
  const older = r.length >= 10 ? mean(r.slice(5, 10)) : avg
  // 낮을수록 우호: 유니버스 하위 25%=9, 50%=7, 75%=5, 그 위=3
  let s = avg <= cuts.p25 ? 9 : avg <= cuts.p50 ? 7 : avg <= cuts.p75 ? 5 : 3
  s += recent < older ? 4 : recent > older * 1.15 ? 0 : 2       // 감소 추세 가점
  return { score: Math.max(0, Math.min(15, s)), avg: +avg.toFixed(2) }
}
// 유니버스 종목들의 평균 공매도 비중 분포에서 사분위 임계 산출
function shortCuts(universe, map) {
  const avgs = universe.map(u => { const l = map.get(u.symbol); return l && l.length >= 5 ? mean(l.map(x => x.ratio)) : null })
    .filter(Number.isFinite).sort((a, b) => a - b)
  if (avgs.length < 8) return null
  const at = p => avgs[Math.min(avgs.length - 1, Math.floor(avgs.length * p))]
  return { p25: at(0.25), p50: at(0.5), p75: at(0.75) }
}

// ───────── SEC 8-K 공시 (공식 item 코드 기반) ─────────
// ⚠️ 8-K item 코드는 SEC가 뜻을 명시한 공식 분류다(임의 해석·환각 아님).
//    다만 **부정 신호만 명확**하고 긍정은 약하다(1.01 계약 체결 정도) → 비대칭임을 감안해
//    기본 중립에서 시작해 명백한 악재만 감점한다. 5.02(임원 변동)는 일상적 인사가 많아 제외.
const NEG_ITEMS = {
  '1.03': 3,   // 파산·법정관리
  '3.01': 3,   // 상장폐지 통지·상장요건 미달
  '4.02': 3,   // 과거 재무제표 신뢰 불가(비신뢰 선언)
  '2.06': 2,   // 자산 손상
  '2.04': 2,   // 채무 조기상환 촉발 사건
  '2.05': 1,   // 사업 철수·구조조정 비용
  '4.01': 1,   // 회계법인 교체
}
const POS_ITEMS = { '1.01': 2 }   // 중요 계약 체결 (국내 '단일판매·공급계약'에 대응)
async function secDisclosure(ticker) {
  const cik = await cikOf(ticker)
  if (!cik) return null
  let rec
  try {
    const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: SEC_UA })
    if (!r.ok) return null
    rec = (await r.json())?.filings?.recent
  } catch { return null }
  if (!rec?.form) return null
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)   // 최근 120일
  let s = 9, pos = 0, neg = 0
  const posNames = [], negNames = []
  for (let i = 0; i < rec.form.length; i++) {
    if (rec.form[i] !== '8-K') continue
    const dt = rec.filingDate[i]
    if (!dt || dt < cutoff) continue
    for (const it of String(rec.items[i] || '').split(',').map(x => x.trim())) {
      if (NEG_ITEMS[it] != null) { neg++; if (neg <= 3) s -= NEG_ITEMS[it]; if (negNames.length < 2) negNames.push({ dt: dt.replace(/-/g, ''), nm: `8-K ${it}` }) }
      else if (POS_ITEMS[it] != null) { pos++; if (pos <= 3) s += POS_ITEMS[it]; if (posNames.length < 2) posNames.push({ dt: dt.replace(/-/g, ''), nm: `8-K ${it} 중요계약` }) }
    }
  }
  return { score: Math.max(0, Math.min(15, s)), pos, neg, posNames, negNames }
}

// ───────── 수급(자금 흐름) — CMF ─────────
// ⚠️ 국내판 수급은 '외국인·기관 순매수'다. 미국엔 그 구분 자체가 없으므로 **같은 것이 아니다**.
//    대신 표준 지표인 CMF(Chaikin Money Flow)로 매집/분산 압력을 측정한다:
//    MFV = ((종가-저가) - (고가-종가)) / (고가-저가) × 거래량,  CMF = ΣMFV / Σ거래량 (20일)
//    +면 매집 우위, -면 분산 우위. UI에 '거래량 기반 자금흐름'으로 국내와 다르게 표기할 것.
function computeSupply(rows) {
  if (!rows || rows.length < 25) return null
  const w = rows.slice(-20)
  let mfv = 0, vol = 0
  for (const r of w) {
    const range = r.h - r.l
    if (!(range > 0) || !(r.v > 0)) continue
    mfv += (((r.c - r.l) - (r.h - r.c)) / range) * r.v
    vol += r.v
  }
  if (!(vol > 0)) return null
  const cmf = mfv / vol                                    // 보통 -0.3 ~ +0.3
  const prev = rows.slice(-40, -20)
  let pm = 0, pv = 0
  for (const r of prev) {
    const range = r.h - r.l
    if (!(range > 0) || !(r.v > 0)) continue
    pm += (((r.c - r.l) - (r.h - r.c)) / range) * r.v; pv += r.v
  }
  const prevCmf = pv > 0 ? pm / pv : null
  let sc = cmf >= 0.15 ? 9 : cmf >= 0.05 ? 7 : cmf >= -0.05 ? 5 : cmf >= -0.15 ? 3 : 2
  if (prevCmf != null) sc += cmf > prevCmf ? 4 : cmf < prevCmf * 0.85 ? 0 : 2   // 개선 추세 가점
  return {
    score: Math.max(0, Math.min(13, sc)),
    cmf: +cmf.toFixed(3),
    dir: cmf > 0.02 ? '매집 우위' : cmf < -0.02 ? '분산 우위' : '중립',
  }
}

// ───────── 팩터 계산 (국내판과 동일 배점·구간 → 비교 가능) ─────────
function computeFinancial(f, price) {
  if (!f) return null
  let s = 0
  const band = (v, a, b, c) => (v >= a ? 5 : v >= b ? 4 : v >= c ? 3 : v > 0 ? 2 : 1)
  s += Number.isFinite(f.grs) ? band(f.grs, 20, 10, 0) : 2
  s += 2                                                            // 영업이익성장: 미측정 중립값
  s += Number.isFinite(f.roe) ? (f.roe >= 15 ? 4 : f.roe >= 10 ? 3 : f.roe >= 5 ? 2 : 1) : 2
  s += Number.isFinite(f.debt) ? (f.debt < 100 ? 3 : f.debt < 200 ? 2 : 1) : 1
  let val = 0
  if (f.per != null) val += f.per < 10 ? 2 : f.per < 20 ? 1.5 : f.per < 40 ? 1 : 0.5
  if (f.pbr != null) val += f.pbr < 1 ? 2 : f.pbr < 2 ? 1.5 : f.pbr < 4 ? 1 : 0.5
  s += Math.round(val)
  const perShow = f.per != null && f.per > 0 && f.per <= 300 ? +f.per.toFixed(1) : null
  return {
    score: Math.max(0, Math.min(20, Math.round(s))), per: perShow,
    pbr: f.pbr != null ? +f.pbr.toFixed(2) : null,
    roe: f.roe != null ? +f.roe.toFixed(2) : null,
    grs: f.grs != null ? +f.grs.toFixed(1) : null,
  }
}
function rsi14(c) {
  if (c.length < 15) return null
  let g = 0, l = 0
  for (let i = c.length - 14; i < c.length; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d }
  if (g + l === 0) return 50
  return Math.round(100 - 100 / (1 + (g / 14) / ((l / 14) || 1e-9)))
}
const ma = (a, n) => a.length >= n ? mean(a.slice(-n)) : null
function computeTech(rows) {
  if (!rows || rows.length < 25) return null
  const c = rows.map(r => r.c), v = rows.map(r => r.v)
  const last = c[c.length - 1], r14 = rsi14(c), m5 = ma(c, 5), m20 = ma(c, 20), m60 = ma(c, 60)
  let s = 0
  if (r14 != null) s += r14 >= 70 ? 3 : r14 >= 55 ? 6 : r14 >= 45 ? 4 : r14 >= 30 ? 3 : 2
  if (m20 != null) s += last > m20 ? 4 : 1
  if (m60 != null) s += last > m60 ? 4 : 1
  if (m5 != null && m20 != null) s += m5 > m20 ? 3 : 1
  const vAvg = mean(v.slice(-20)), vNow = mean(v.slice(-5))
  s += vAvg > 0 && vNow > vAvg ? 3 : 1
  const win = rows.slice(-30)
  const support = Math.min(...win.map(r => r.l)), resistance = Math.max(...win.map(r => r.h))
  const w = rows.slice(-250)
  return {
    score: Math.max(0, Math.min(20, s)), rsi: r14,
    ma5: m5 != null ? +m5.toFixed(2) : null, ma20: m20 != null ? +m20.toFixed(2) : null, ma60: m60 != null ? +m60.toFixed(2) : null,
    support: +support.toFixed(2), resistance: +resistance.toFixed(2),
    w52_high: +Math.max(...w.map(r => r.h)).toFixed(2), w52_low: +Math.min(...w.map(r => r.l)).toFixed(2),
    candles: rows.slice(-120).map(r => [r.d, r.o, r.h, r.l, r.c]),
  }
}
// 거시: 미국 지수·변동성 (야후) — 국내판과 동일하게 시장 공통 1회
async function computeMacro() {
  const idx = async sym => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=6mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const c = ((await r.json())?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
      return c.length >= 60 ? c : null
    } catch { return null }
  }
  const [spx, vix] = await Promise.all([idx('^GSPC'), idx('^VIX')])
  if (!spx) return null
  let s = 6
  const last = spx[spx.length - 1]
  if (last > mean(spx.slice(-20))) s += 3
  if (last > mean(spx.slice(-60))) s += 2
  if (vix) { const v = vix[vix.length - 1]; s += v < 18 ? 1 : v > 28 ? -2 : 0 }
  return Math.max(0, Math.min(12, Math.round(s)))
}

// ───────── 유니버스: 거래대금 상위 → 필터 → 시총 상위 ─────────
async function fetchUniverse() {
  // 랭킹은 타입당 상위 100위가 상한 → 여러 타입을 합쳐 심볼 풀을 넓힌다(중복 제거).
  const TYPES = ['MARKET_TRADING_AMOUNT', 'MARKET_TRADING_VOLUME', 'TOSS_SECURITIES_TRADING_AMOUNT']
  const ranks = []
  const seen = new Set()
  for (const ty of TYPES) {
    const rk = await tossGet(`/api/v1/rankings?type=${ty}&marketCountry=US&duration=1d&count=100`)
    for (const r of (rk?.result?.rankings || [])) {
      if (!r.symbol || seen.has(r.symbol)) continue
      seen.add(r.symbol); ranks.push(r)
    }
    await sleep(300)
  }
  if (!ranks.length) return []
  console.log(`[US] 랭킹 병합 심볼 ${ranks.length}개`)
  const syms = ranks.map(r => r.symbol)
  const out = []
  for (let i = 0; i < syms.length; i += 50) {
    const batch = syms.slice(i, i + 50)
    const st = await tossGet('/api/v1/stocks?symbols=' + batch.join(','))
    const list = Array.isArray(st?.result) ? st.result : (st?.result?.stocks || [])
    for (const x of list) {
      // 정화: 보통주 ETF/ETN·레버리지·상폐 제외
      if (x.securityType !== 'STOCK') continue
      if (x.status !== 'ACTIVE' || x.delistDate) continue
      if (x.isCommonShare === false) continue
      if (x.leverageFactor != null) continue
      const shares = Number(x.sharesOutstanding)
      const pr = ranks.find(r => r.symbol === x.symbol)
      const price = Number(pr?.price?.lastPrice ?? NaN)   // 스펙 실측: RankingPrice.lastPrice
      if (!(shares > 0) || !(price > 0)) continue
      out.push({ symbol: x.symbol, name: x.englishName || x.name, market: x.market, shares, price, cap: shares * price })
    }
    await sleep(300)
  }
  out.sort((a, b) => b.cap - a.cap)
  return out.slice(0, TARGET)
}

async function candles(sym) {
  const j = await tossGet(`/api/v1/candles?symbol=${sym}&interval=1d&count=200&adjusted=true`)
  const cs = j?.result?.candles
  if (!Array.isArray(cs) || cs.length < 25) return null
  const rows = cs.map(k => ({
    d: String(k.timestamp).slice(0, 10).replace(/-/g, ''),
    o: Number(k.openPrice), h: Number(k.highPrice), l: Number(k.lowPrice), c: Number(k.closePrice), v: Number(k.volume),
  })).filter(r => isFinite(r.c) && r.c > 0)
  rows.sort((a, b) => a.d.localeCompare(b.d))
  return rows.length >= 25 ? rows : null
}

// ───────── 스코어링 (측정분만 정규화) ─────────
const CAPS = { macro: 12, supply: 13, financial: 20, ai: 15, derivative: 15, technical: 20, strategy: 5 }
function scoreStock({ price, chg, macro, fin, tech, deriv, disc, sup }) {
  const na = []
  let pts = 0, cap = 0
  const add = (k, v) => { if (v == null) { na.push(k); return null } pts += v; cap += CAPS[k]; return v }
  const m = add('macro', macro)
  const sp = add('supply', sup?.score ?? null)   // CMF 자금흐름(국내 '외국인·기관 순매수'와 다른 지표)
  const f = add('financial', fin?.score ?? null)
  const a = add('ai', disc?.score ?? null)          // SEC 8-K 공식 item 코드 기반
  const dv = add('derivative', deriv?.score ?? null) // FINRA RegSHO 공매도 비중
  const t = add('technical', tech?.score ?? null)
  // 전략: 기술·재무가 함께 우호적일 때만 가점(둘 다 측정된 경우에만 산정)
  const strat = (t != null && f != null) ? ((t >= 13 ? 3 : t >= 9 ? 2 : 1) + (f >= 14 ? 2 : 1)) : null
  add('strategy', strat != null ? Math.min(5, strat) : null)

  const coverage = +(cap / 100).toFixed(2)
  const total = cap > 0 ? Math.round(pts / cap * 100) : 0
  return {
    scores: {
      total, macro: m, supply: sp, financial: f, ai: a, derivative: dv,
      technical: t, strategy: strat != null ? Math.min(5, strat) : null, coverage,
      per: fin?.per ?? null, pbr: fin?.pbr ?? null, roe: fin?.roe ?? null, grs: fin?.grs ?? null,
      short_ratio: deriv?.avg ?? null,
      ai_disc: disc ? `8-K 호재 ${disc.pos}·악재 ${disc.neg} (최근 120일)` : null,
      ai_pos: disc?.posNames ?? null, ai_neg: disc?.negNames ?? null,
      price, chg, sector: null,
      rsi: tech?.rsi ?? null, ma5: tech?.ma5 ?? null, ma20: tech?.ma20 ?? null, ma60: tech?.ma60 ?? null,
      support: tech?.support ?? null, resistance: tech?.resistance ?? null,
      w52_high: tech?.w52_high ?? null, w52_low: tech?.w52_low ?? null,
      supply_dir: sup?.dir ?? null, supply_days: null, cmf: sup?.cmf ?? null, candles: tech?.candles ?? null,
      naFactors: na,
    },
    coverage,
  }
}

async function upsert(row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/stock_score_cache`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
  if (!r.ok) throw new Error('upsert ' + r.status + ' ' + (await r.text()).slice(0, 120))
}
const gradeOf = t => t >= 78 ? '강한우호' : t >= 66 ? '우호' : t >= 56 ? '중립' : t >= 48 ? '주의' : '경계'

;(async () => {
  if (!SUPA_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 없음')
  const now = new Date().toISOString(), today = now.slice(0, 10)
  const macro = await computeMacro()
  const UNIVERSE = await fetchUniverse()
  const shortMap = await finraShortMap(20)
  const cuts = shortCuts(UNIVERSE, shortMap)
  if (cuts) console.log(`[US] 공매도 임계(유니버스 상대) p25=${cuts.p25.toFixed(1)}% p50=${cuts.p50.toFixed(1)}% p75=${cuts.p75.toFixed(1)}%`)
  console.log(`[US] 유니버스 ${UNIVERSE.length}종목 · 거시점수 ${macro ?? 'n/a'}`)
  const history = []
  let ok = 0
  for (const s of UNIVERSE) {
    try {
      const rows = await candles(s.symbol)
      const tech = computeTech(rows)
      const price = rows ? rows[rows.length - 1].c : s.price
      const prev = rows && rows.length >= 2 ? rows[rows.length - 2].c : null
      const chg = prev ? +(((price - prev) / prev) * 100).toFixed(2) : null
      const fin = computeFinancial(await secFinancials(s.symbol, price, s.shares), price)
      const sup = computeSupply(rows)
      const deriv = computeDerivative(shortMap.get(s.symbol), cuts)
      const disc = await secDisclosure(s.symbol)
      const { scores, coverage } = scoreStock({ price, chg, macro, fin, tech, deriv, disc, sup })
      await upsert({ symbol: s.symbol, name: s.name, market: s.market, country: 'US', scores, coverage, cached_at: now })
      history.push({ d: today, symbol: s.symbol, name: s.name, total: scores.total, grade: gradeOf(scores.total), coverage, price, country: 'US', snapshot_at: now })
      console.log(`  ${String(s.symbol).padEnd(6)} total ${String(scores.total).padStart(3)} · cov ${Math.round(coverage * 100)}% · PER ${scores.per} · 공매도 ${scores.short_ratio}% · 8-K(${disc?.pos ?? '-'}/${disc?.neg ?? '-'})`)
      ok++
    } catch (e) { console.log('  err', s.symbol, String(e.message).slice(0, 70)) }
    await sleep(400)   // 토스 + SEC 레이트리밋 여유
  }
  // 이번 런에 갱신 안 된 US stale 행 정리
  try {
    await fetch(`${SUPA_URL}/rest/v1/stock_score_cache?country=eq.US&cached_at=lt.${encodeURIComponent(now)}`, {
      method: 'DELETE', headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: 'return=minimal' },
    })
  } catch {}
  if (history.length) {
    const r = await fetch(`${SUPA_URL}/rest/v1/stock_score_history?on_conflict=d,symbol`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(history),
    })
    console.log(`[US] 이력 스냅샷 ${history.length}건 (${r.ok ? 'ok' : 'fail ' + r.status})`)
  }
  console.log(`[US] 완료: ${ok}/${UNIVERSE.length}`)
})()

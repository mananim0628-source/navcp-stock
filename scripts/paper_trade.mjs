// 자동 모의매매 워커 — 규칙대로 '가상' 진입/청산을 기록한다. **실제 주문은 절대 내지 않는다.**
//
// ⚠️ 프레임(§6): 이건 '진입 신호'가 아니라 **규칙이 이렇게 판정했다는 기록**이다.
//    목적은 "우리 점수가 실제로 먹히는가"를 실측으로 검증하는 것. 이용자는 이 기록을 보고 직접 판단한다.
// ⚠️ 정직성: 청산가는 **다음 거래일 이후 실제 캔들**로만 판정한다. 미래를 앞당겨 보지 않는다.
//    진입가도 판정일 종가를 쓴다(당일 저가 체결 같은 유리한 가정 금지).
//
// 실행: node scripts/paper_trade.mjs   (엔진 실행 뒤 크론)

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lpdhtagnbqwjagtmifug.supabase.co'
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 없음')

// ── 규칙 (한 곳에 모아둠. 바꾸면 rule 이름도 바꿔서 과거 기록과 섞이지 않게 할 것)
// v2: 점수 하나로 타이트하게 자르지 않고, **거시·수급·공시·기술을 종합**해 근거가 충분하면 진입.
//     현물이라 하방이 제한적 → 진입 문턱은 낮추되 **손절을 빠르게**(ATR 1.2×)로 대응.
const RULE = process.env.PT_RULE || 'context1'
// 실행 시점 — 07시(장전) 배치는 preopen, 16시(종가) 배치는 close.
// 진입 근거에 '어느 시점 정보로 판정했는지'를 남겨야 나중에 재현·검증이 가능하다.
const SESSION = process.env.PT_SESSION === 'close' ? 'close' : 'preopen'
const SESSION_KO = SESSION === 'close' ? '종가' : '장전'
const MIN_SCORE = Number(process.env.PT_MIN || 62)       // 최소 점수(중립 상단 이상이면 판정 대상)
const MIN_COVERAGE = 0.9                                  // 커버리지 낮으면 판정 제외(신뢰 부족)
const ATR_STOP = 1.2                                      // 손절 = 진입가 - 1.2×ATR (빠른 손절)
const ATR_TARGET = 2.8                                    // 목표 = 진입가 + 2.8×ATR (손익비 2.33 = R 2.3)
const MAX_DAYS = 20                                       // 최대 보유 20거래일(타임아웃)
const MAX_OPEN = 12                                       // 동시 보유 상한(집중 방지)

// ── 리스크 기반 비중 (ATR 사이징) — 프로 표준: 비중 = (시드 × 위험%) ÷ (ATR × 손절배수)
//    변동성 큰 종목은 자동으로 작게, 작은 종목은 크게. 전체 위험(포트폴리오 히트) 상한도 둔다.
const SEED = Number(process.env.PT_SEED || 10_000_000)   // 시뮬레이션 전체 시드(표시·비중 계산 기준)
const RISK_PCT = Number(process.env.PT_RISK || 1.0)      // 1종목당 감수 위험(시드 대비 %)
const MAX_WEIGHT = Number(process.env.PT_MAXW || 20)     // 1종목 비중 상한(%)
const PORT_HEAT = Number(process.env.PT_HEAT || 6)       // 전체 열려있는 위험 합 상한(%)

// 종합 진입 판정 — 점수 문턱을 넘고, 아래 '가점 근거'가 2개 이상이면 진입.
// 거시(시장 국면)·수급·공시(악재 없음)·기술(추세)·상대강도를 두루 본다.
function entrySignal(sc, macroFavorable) {
  const n = v => (v == null ? null : Number(v))
  const total = n(sc.total)
  if (total == null || total < MIN_SCORE) return null
  const reasons = []
  if (macroFavorable) reasons.push('거시 우호')
  if (n(sc.supply) != null && n(sc.supply) >= 9) reasons.push('수급 강함')
  if (sc.supply_dir === '순매수') reasons.push('기관·외국인 순매수')
  if (n(sc.technical) != null && n(sc.technical) >= 13) reasons.push('기술 추세 양호')
  if (n(sc.rs60) != null && n(sc.rs60) > 0) reasons.push('시장 대비 강세')
  if (n(sc.mom) != null && n(sc.mom) > 0) reasons.push('중기 모멘텀 +')
  if (n(sc.price) != null && n(sc.ma20) != null && n(sc.price) > n(sc.ma20)) reasons.push('20일선 위')
  // 악재 공시가 있으면 근거 하나 차감(있는 사실만 반영)
  const neg = Array.isArray(sc.ai_neg) ? sc.ai_neg.length : 0
  if (neg > 0) reasons.push(`⚠️악재공시 ${neg}건(감안)`)
  const strong = reasons.filter(r => !r.startsWith('⚠️')).length
  // 78+ 강한우호면 근거 1개로도 충분, 그 아래는 2개 이상 요구
  const need = total >= 78 ? 1 : 2
  if (strong - (neg > 0 ? 1 : 0) < need) return null
  return reasons
}

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }
const rest = async (path, init = {}) => {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 160)}`)
  return r.status === 204 ? null : r.json()
}
const pct = (a, b) => +(((a - b) / b) * 100).toFixed(2)

// 진입 근거 자동 생성 — 실제 팩터 값만 인용한다(없는 사실을 지어내지 않음).
function entryReason(sc) {
  const bits = []
  const n = v => (v == null ? null : Number(v))
  if (n(sc.total) != null) bits.push(`종합 ${Math.round(n(sc.total))}점(${sc.grade || ''})`)
  if (n(sc.financial) != null) bits.push(`재무 ${n(sc.financial)}/20`)
  if (n(sc.technical) != null) bits.push(`기술 ${n(sc.technical)}/20`)
  if (n(sc.supply) != null) bits.push(`수급 ${n(sc.supply)}/13${sc.supply_dir ? `(${sc.supply_dir})` : ''}`)
  if (n(sc.per) != null) bits.push(`PER ${n(sc.per)}`)
  if (n(sc.roe) != null) bits.push(`ROE ${n(sc.roe)}%`)
  if (n(sc.rsi) != null) bits.push(`RSI ${n(sc.rsi)}`)
  if (n(sc.mom) != null) bits.push(`모멘텀 ${n(sc.mom)}%(${sc.mom_months ?? '?'}개월)`)
  if (n(sc.rs60) != null) bits.push(`상대강도 ${n(sc.rs60)}%p`)
  if (n(sc.vol20) != null) bits.push(`변동성 ${n(sc.vol20)}%`)
  return `커버리지 ${Math.round((n(sc.coverage) ?? 0) * 100)}% · ` + bits.join(' · ')
}
function exitReason(kind, t, price, sc) {
  const p = pct(price, t.entry_price)
  const base = {
    target: `목표가 ${t.target_price} 도달 → 청산`,
    stop: `손절가 ${t.stop_price} 이탈 → 청산`,
    grade_drop: `등급이 진입 시(${t.entry_grade})보다 두 단계 이상 하락 → 청산`,
    timeout: `최대 보유 ${MAX_DAYS}거래일 경과 → 청산`,
  }[kind]
  return `${base}. 손익 ${p > 0 ? '+' : ''}${p}%` + (sc?.total != null ? ` (청산 시 종합 ${Math.round(Number(sc.total))}점)` : '')
}

// MAE/MFE — 진입 이후 최악·최선 도달폭(%). 손절·목표 위치 최적화용(프로 매매일지 표준).
function maeMfe(entry, afterCandles) {
  let mae = 0, mfe = 0
  for (const [, , h, l] of afterCandles) {
    const dh = ((Number(h) - entry) / entry) * 100
    const dl = ((Number(l) - entry) / entry) * 100
    if (dh > mfe) mfe = dh
    if (dl < mae) mae = dl
  }
  return { mae: +mae.toFixed(2), mfe: +mfe.toFixed(2) }
}

const RANK = { 경계: 0, 주의: 1, 중립: 2, 우호: 3, 강한우호: 4 }
const gradeOf = t => t >= 78 ? '강한우호' : t >= 66 ? '우호' : t >= 56 ? '중립' : t >= 48 ? '주의' : '경계'

;(async () => {
  // 오늘자 점수 스냅샷 (엔진이 이미 적재한 것)
  const cache = await rest('stock_score_cache?select=symbol,name,country,scores,coverage,cached_at')
  if (!cache.length) { console.log('[paper] 점수 캐시 없음'); return }
  const today = String(cache[0].cached_at).slice(0, 10)
  const byS = new Map(cache.map(r => [r.symbol, r]))

  // ── 1) 보유 중 포지션 청산 판정 — 진입 이후 실제 캔들로만 본다
  const open = await rest('stock_paper_trade?select=*&status=eq.open')
  let closed = 0
  for (const t of open) {
    const row = byS.get(t.symbol)
    if (!row) continue
    const sc = row.scores || {}
    const candles = Array.isArray(sc.candles) ? sc.candles : null
    if (!candles) continue
    // 진입일 '이후' 봉만 사용 (미래 참조·당일 유리 체결 방지)
    const after = candles.filter(c => String(c[0]).slice(0, 8) > String(t.entry_date).replace(/-/g, ''))
    if (!after.length) continue

    let kind = null, price = null, when = null
    for (const [d, , h, l, c] of after) {
      const dd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      if (t.stop_price != null && Number(l) <= Number(t.stop_price)) { kind = 'stop'; price = Number(t.stop_price); when = dd; break }
      if (t.target_price != null && Number(h) >= Number(t.target_price)) { kind = 'target'; price = Number(t.target_price); when = dd; break }
      if (after.indexOf(after.find(x => x[0] === d)) + 1 >= MAX_DAYS) { kind = 'timeout'; price = Number(c); when = dd; break }
    }
    // 등급 급락은 최신 점수로 판정
    if (!kind) {
      const g = sc.grade || gradeOf(Number(sc.total))
      if ((RANK[t.entry_grade] ?? 0) - (RANK[g] ?? 0) >= 2) {
        kind = 'grade_drop'; price = Number(sc.price); when = today
      }
    }
    if (!kind || !(price > 0)) continue

    const days = after.findIndex(x => `${x[0].slice(0,4)}-${x[0].slice(4,6)}-${x[0].slice(6,8)}` === when) + 1
    const usedAfter = after.slice(0, days > 0 ? days : after.length)
    const { mae, mfe } = maeMfe(Number(t.entry_price), usedAfter)
    const pnl = pct(price, t.entry_price)
    // R-multiple = 실현손익 ÷ 진입 시 감수했던 하락폭(진입가-손절가)
    const riskPer = t.stop_price != null ? (Number(t.entry_price) - Number(t.stop_price)) / Number(t.entry_price) * 100 : null
    const rMul = riskPer && riskPer > 0 ? +(pnl / riskPer).toFixed(2) : null
    await rest(`stock_paper_trade?id=eq.${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'closed', exit_date: when, exit_price: price, exit_kind: kind,
        exit_reason: exitReason(kind, t, price, sc),
        pnl_pct: pnl, holding_days: days > 0 ? days : null,
        r_multiple: rMul, mae_pct: mae, mfe_pct: mfe,
      }),
    })
    closed++
  }

  // ── 2) 신규 진입 판정 — 종합 근거 기반(점수 하나로 자르지 않음) + 거시 국면 반영
  const stillOpenRows = await rest('stock_paper_trade?select=symbol,risk_pct&status=eq.open')
  const room = Math.max(0, MAX_OPEN - stillOpenRows.length)
  const openSyms = new Set(stillOpenRows.map(r => r.symbol))
  let openHeat = stillOpenRows.reduce((a, r) => a + (Number(r.risk_pct) || 0), 0)   // 현재 열린 위험 합

  // 거시 국면 — 야후 지수로 KR/US 각각 판정(우호면 진입에 가점)
  const idxUp = async sym => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const c = ((await r.json())?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
      if (c.length < 25) return false
      return c[c.length - 1] > c.slice(-20).reduce((a, b) => a + b, 0) / 20   // 20일선 위
    } catch { return false }
  }
  const macroKR = await idxUp('^KS11'), macroUS = await idxUp('^GSPC')

  const scored = []
  for (const r of cache) {
    const sc = r.scores || {}
    if (openSyms.has(r.symbol)) continue
    if (Number(r.coverage) < MIN_COVERAGE) continue
    if (!(Number(sc.price) > 0) || !(Number(sc.atr14) > 0)) continue
    const macroFav = r.country === 'US' ? macroUS : macroKR
    const reasons = entrySignal(sc, macroFav)
    if (!reasons) continue
    scored.push({ r, sc, reasons })
  }
  // 점수 높은 순으로 채우되, 비중·전체위험(히트) 상한을 지킨다
  scored.sort((a, b) => Number(b.sc.total) - Number(a.sc.total))

  // 현재 열려있는 자본 투입 합(현물은 100% 초과 불가) — 신규 진입은 남은 현금 안에서만.
  const openWeight = stillOpenRows.reduce((a, r) => a + (Number(r.weight_pct) || 0), 0)
  let usedCapital = openWeight

  const news = []
  for (const { r, sc, reasons } of scored) {
    if (news.length >= room) break
    if (openHeat >= PORT_HEAT) break                     // 전체 위험 한도 도달 → 신규 중단
    if (usedCapital >= 99) break                         // 현금 소진 → 신규 중단
    const price = Number(sc.price), a = Number(sc.atr14)
    const stop = +(price - ATR_STOP * a).toFixed(2)
    // 리스크 기반 비중: (시드 × 위험%) ÷ (손절까지 하락률). 상한·잔여히트·잔여현금으로 캡.
    const stopDistPct = ((price - stop) / price) * 100
    if (!(stopDistPct > 0)) continue
    let weight = (RISK_PCT / stopDistPct) * 100          // 시드 대비 투입 비중(%)
    weight = Math.min(weight, MAX_WEIGHT)
    // 남은 히트 여유로 캡
    const heatRoom = Math.max(0, PORT_HEAT - openHeat)
    if (weight * stopDistPct / 100 > heatRoom) weight = heatRoom / stopDistPct * 100
    // 남은 현금으로 캡 (자본 100% 초과 방지)
    const cashRoom = Math.max(0, 100 - usedCapital)
    if (weight > cashRoom) weight = cashRoom
    weight = +weight.toFixed(2)
    if (weight < 1) continue                             // 너무 작은 비중은 건너뜀
    const finalRisk = +(weight * stopDistPct / 100).toFixed(2)
    openHeat += finalRisk
    usedCapital += weight
    const invest = Math.round(SEED * weight / 100)
    news.push({
      symbol: r.symbol, country: r.country, name: r.name, rule: RULE,
      entry_date: today, entry_price: price,
      entry_score: Math.round(Number(sc.total)),
      entry_grade: sc.grade || gradeOf(Number(sc.total)),
      session: SESSION,
      entry_reason: `[${SESSION_KO} 매수] ${reasons.join(' · ')} || ` + entryReason({ ...sc, coverage: r.coverage, grade: sc.grade || gradeOf(Number(sc.total)) }),
      stop_price: stop,
      target_price: +(price + ATR_TARGET * a).toFixed(2),
      weight_pct: +weight.toFixed(2), risk_pct: finalRisk,
      meta: { atr: a, atr_stop: ATR_STOP, atr_target: ATR_TARGET, max_days: MAX_DAYS, seed: SEED, invest, stop_dist_pct: +stopDistPct.toFixed(2), session: SESSION },
    })
  }

  let opened = 0
  if (news.length) {
    const r = await fetch(`${SUPA_URL}/rest/v1/stock_paper_trade?on_conflict=symbol,rule,entry_date`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(news),
    })
    opened = r.ok ? (await r.json()).length : 0
  }

  console.log(`[paper] ${today} · 청산 ${closed} · 신규 ${opened} (보유 ${stillOpenRows.length - closed + opened}/${MAX_OPEN}) · 거시 KR:${macroKR ? '우호' : '주의'}/US:${macroUS ? '우호' : '주의'} · 열린위험 ${openHeat.toFixed(1)}%/${PORT_HEAT}% · 규칙 ${RULE}`)
})()

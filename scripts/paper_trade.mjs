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
// 트레일링(연속) — RULE=trail1일 때. 고정목표 대신 고점−K×ATR로 손절을 끌어올려 이익을 잠근다.
const TRAIL_K = Number(process.env.PT_TRAILK || 2.5)     // 트레일 배수(고점 − K×ATR)
const BE_ATR = Number(process.env.PT_BE || 1.0)          // +N×ATR 도달 시 손절선을 본전(진입가)으로 이동
const MAX_DAYS = 20                                       // 최대 보유 20거래일(타임아웃)
const MAX_OPEN = 12                                       // 동시 보유 상한(집중 방지)

// ── 리스크 기반 비중 (ATR 사이징) — 프로 표준: 비중 = (시드 × 위험%) ÷ (ATR × 손절배수)
//    변동성 큰 종목은 자동으로 작게, 작은 종목은 크게. 전체 위험(포트폴리오 히트) 상한도 둔다.
const SEED = Number(process.env.PT_SEED || 10_000_000)   // 시뮬레이션 전체 시드(표시·비중 계산 기준)
const RISK_PCT = Number(process.env.PT_RISK || 1.0)      // 1종목당 감수 위험(시드 대비 %)
const MAX_WEIGHT = Number(process.env.PT_MAXW || 20)     // 1종목 비중 상한(%)
const PORT_HEAT = Number(process.env.PT_HEAT || 6)       // 전체 열려있는 위험 합 상한(%)
// ── 현금 관리 — 현물이라 손절만이 답이 아니다. 급락 대응·물타기 여력으로 현금 쿠션을 남긴다.
const MAX_INVESTED = Number(process.env.PT_MAXINV || 80) // 신규 진입은 총투입 80%까지만(현금 20% 보존)
// 위성(비메이저) 배분 — 현금의 일부를 시총 하위지만 지표 강한 종목에 배정(코어=대형주 위성=중소형).
// ⚠️ 아무 소형주가 아니라 '우리 지표상 강한'(모멘텀·상대강도 +) 종목만. 근거 없는 소형주 매수 금지.
const SAT_ENABLED = process.env.PT_SAT !== '0'
const SAT_BUDGET = Number(process.env.PT_SATBUDGET || 10)  // 위성에 배정할 최대 투입 비중(%)
const SAT_CAP_MAX = Number(process.env.PT_SATCAP || 30000) // 시총 3조원(억원 30000) 미만을 비메이저로 본다
// 물타기(추가매수): 보유 종목이 진입가 대비 크게 하락 + 점수가 여전히 유효하면 1회 추가 매수.
const ADD_ENABLED = process.env.PT_ADD !== '0'
const ADD_DROP = Number(process.env.PT_ADDDROP || 8)     // 진입가 대비 -8% 이상 하락 시 후보
const ADD_MAX = 1                                        // 종목당 물타기 최대 횟수

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
  let base
  if (RULE === 'trail1' && (kind === 'target' || kind === 'stop')) {
    base = kind === 'target'
      ? `트레일링 손절선 ${Number(price).toLocaleString()} 도달 → 이익 잠금 청산`
      : `초기 손절선 이탈 → 청산(트레일 전)`
  } else base = {
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
  const nowIso = new Date().toISOString()
  const kstHM = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16)   // KST HH:MM
  const byS = new Map(cache.map(r => [r.symbol, r]))

  // ── 0) 대기(pending) 체결 — 장전 판정은 '다음 시가'로만 체결한다(판정 시점엔 시가 미확정 = 정직).
  //   판정일 이후 첫 캔들의 **시가**로 진입가를 확정하고 open 으로 전환. 손절·목표도 그 가격 기준.
  const pending = await rest(`stock_paper_trade?select=*&status=eq.pending&rule=eq.${RULE}`)
  let filled = 0, canceled = 0
  const dayMs = 86400e3
  for (const t of pending) {
    const sc = byS.get(t.symbol)?.scores
    const candles = Array.isArray(sc?.candles) ? sc.candles : null
    // ⚠️ 유니버스 회전으로 종목이 캐시에서 빠지거나, 판정 후 4일 넘게 체결 못 하면 취소한다.
    //    (그 진입 기회는 이미 지났으므로 억지로 체결하면 정직하지 않음)
    const staleDays = (Date.parse(today) - Date.parse(t.entry_date)) / dayMs
    if (!candles) {
      if (staleDays >= 4) {                        // 캐시에서 사라진 지 오래 → 취소
        await rest(`stock_paper_trade?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'canceled', exit_reason: '유니버스 이탈로 체결 불가 → 취소' }) })
        canceled++
      }
      continue
    }
    const fillC = candles.find(c => String(c[0]).slice(0, 8) > String(t.entry_date).replace(/-/g, ''))
    if (!fillC) {
      if (staleDays >= 4) {                        // 4일 지나도 다음 캔들 없음(거래정지 등) → 취소
        await rest(`stock_paper_trade?id=eq.${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'canceled', exit_reason: '체결 기회 경과 → 취소' }) })
        canceled++
      }
      continue                                     // 아직 다음 캔들 없음 → 다음 실행 때 체결
    }
    const fillOpen = Number(fillC[1])             // [날짜,시,고,저,종] → 시가
    const fillDate = `${fillC[0].slice(0,4)}-${fillC[0].slice(4,6)}-${fillC[0].slice(6,8)}`
    if (!(fillOpen > 0)) continue
    const a = Number(sc.atr14) || fillOpen * 0.03
    await rest(`stock_paper_trade?id=eq.${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'open', entry_price: fillOpen, entry_date: fillDate,
        stop_price: +(fillOpen - ATR_STOP * a).toFixed(2),
        target_price: +(fillOpen + ATR_TARGET * a).toFixed(2),
        entry_reason: `${t.entry_reason} → ${fillDate} 시가 ${fillOpen} 체결`,
      }),
    })
    filled++
  }

  // ── 1) 보유 중 포지션 청산 판정 — 진입 이후 실제 캔들로만 본다
  const open = await rest(`stock_paper_trade?select=*&status=eq.open&rule=eq.${RULE}`)
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
    if (RULE === 'trail1') {
      // 연속 트레일링 — 고정목표 없음. +BE_ATR×ATR 도달 시 손절을 본전으로, 이후 고점−K×ATR로 '위로만' 끌어올림.
      // 끌어올린 손절선이 진입가 위에서 깨지면 '이익잠금 청산'(target), 아래면 손절(stop).
      const atr = (Number(t.entry_price) - Number(t.stop_price)) / ATR_STOP
      let trail = Number(t.stop_price), hi = Number(t.entry_price), be = false
      for (let i = 0; i < after.length; i++) {
        const [d, , h, l, c] = after[i]
        const dd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        // 보수적: '어제까지 확정된' trail로 오늘 저가를 먼저 검사(당일 고점으로 올린 trail로 당일 청산 금지)
        if (Number(l) <= trail) { kind = trail >= Number(t.entry_price) ? 'target' : 'stop'; price = trail; when = dd; break }
        hi = Math.max(hi, Number(h))
        if (!be && atr > 0 && hi >= Number(t.entry_price) + BE_ATR * atr) { trail = Math.max(trail, Number(t.entry_price)); be = true }
        if (be && atr > 0) trail = Math.max(trail, hi - TRAIL_K * atr)
        if (i + 1 >= MAX_DAYS) { kind = 'timeout'; price = Number(c); when = dd; break }
      }
    } else {
      // ⚠️ 고정목표 규칙 — 같은 봉에서 손절·목표 동시 도달 시 손절 우선(보수적, 부풀림 방지).
      for (let i = 0; i < after.length; i++) {
        const [d, , h, l, c] = after[i]
        const dd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        if (t.stop_price != null && Number(l) <= Number(t.stop_price)) { kind = 'stop'; price = Number(t.stop_price); when = dd; break }
        if (t.target_price != null && Number(h) >= Number(t.target_price)) { kind = 'target'; price = Number(t.target_price); when = dd; break }
        if (i + 1 >= MAX_DAYS) { kind = 'timeout'; price = Number(c); when = dd; break }
      }
    }
    // 등급 급락 청산 — 즉시 종가(미래가정)가 아니라 **가장 최근 실제 봉의 종가**로 체결(정직).
    if (!kind) {
      const g = sc.grade || gradeOf(Number(sc.total))
      if ((RANK[t.entry_grade] ?? 0) - (RANK[g] ?? 0) >= 2) {
        const last = after[after.length - 1]
        kind = 'grade_drop'; price = Number(last[4])
        when = `${last[0].slice(0, 4)}-${last[0].slice(4, 6)}-${last[0].slice(6, 8)}`
      }
    }
    if (!kind || !(price > 0)) continue

    const days = after.findIndex(x => `${x[0].slice(0,4)}-${x[0].slice(4,6)}-${x[0].slice(6,8)}` === when) + 1
    const usedAfter = after.slice(0, days > 0 ? days : after.length)
    // MAE/MFE는 **원 진입가** 기준(물타기 평단으로 계산하면 물타기 전 구간이 왜곡됨 — H 수정).
    const { mae, mfe } = maeMfe(Number(t.entry_price), usedAfter)
    // 손익·R은 **평단(실제 비용)** 기준. 물타기 없으면 avg_price=null → entry_price.
    const cost = Number(t.avg_price || t.entry_price)
    const pnl = pct(price, cost)
    const riskPer = t.stop_price != null ? (cost - Number(t.stop_price)) / cost * 100 : null
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

  // 거시 국면 — 야후 지수로 KR/US 각각 판정(물타기·신규진입 공용)
  const idxUp = async sym => {
    try {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const res = (await r.json())?.chart?.result?.[0]
      const c = (res?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
      if (c.length < 25) return false
      // 장중엔 오늘 봉 종가가 비어(필터 제외) 어제값이 된다 → 실시간가로 추세 판정(대시보드 idx와 동일 수정).
      const last = Number(res?.meta?.regularMarketPrice) || c[c.length - 1]
      return last > c.slice(-20).reduce((a, b) => a + b, 0) / 20
    } catch { return false }
  }
  const macroPre = { kr: await idxUp('^KS11'), us: await idxUp('^GSPC') }

  // ── 1.5) 물타기(추가매수) — 현물 특성상 손절만이 답은 아니다.
  //   보유 종목이 평단 대비 -ADD_DROP% 이상 하락했지만 **점수가 여전히 유효**하면,
  //   현금 쿠션 범위에서 1회 추가 매수해 평단을 낮춘다. 손절선은 새 평단 기준으로 재설정.
  //   ⚠️ 예산·위험(히트)은 신규 진입과 동일 한도를 지킨다. pending 포지션도 자본/위험에 포함.
  const openLike = await rest(`stock_paper_trade?select=*&status=in.(open,pending)&rule=eq.${RULE}`)
  let usedNow = openLike.reduce((a, r) => a + (Number(r.weight_pct) || 0), 0)   // 총투입%(open+pending)
  let heatNow = openLike.reduce((a, r) => a + (Number(r.risk_pct) || 0), 0)      // 총위험%(open+pending)
  let added = 0
  if (ADD_ENABLED) {
    for (const t of openLike) {
      if (t.status !== 'open') continue                       // 아직 체결 안 된 pending엔 물타기 없음
      if ((t.add_count || 0) >= ADD_MAX) continue
      if (usedNow >= MAX_INVESTED || heatNow >= PORT_HEAT) break
      const row = byS.get(t.symbol); if (!row) continue
      const sc = row.scores || {}
      // ⚠️ 체결가: 최신 실제 종가(sc.price = 엔진이 적재한 마지막 종가, 과거 실가). 미래가 아님.
      const cur = Number(sc.price); if (!(cur > 0)) continue
      const base = Number(t.avg_price || t.entry_price)
      const drop = ((cur - base) / base) * 100
      if (drop > -ADD_DROP) continue                          // 아직 물탈 만큼 안 빠짐
      // 점수가 여전히 유효해야 물탄다(추세 꺾였으면 손절이 맞음)
      const macroFav = t.country === 'US' ? macroPre.us : macroPre.kr
      if (!entrySignal(sc, macroFav)) continue
      const oldW = Number(t.weight_pct)
      const a = Number(sc.atr14) || (base * 0.03)
      // 새 평단 가정에서의 손절 거리(추가 위험 계산용) — 먼저 addW 후보로 평단 근사
      let addW = Math.min(oldW / 2, MAX_INVESTED - usedNow, MAX_WEIGHT - oldW)
      if (addW < 1) continue
      addW = +addW.toFixed(2)
      const newW = +(oldW + addW).toFixed(2)
      const newAvg = +((base * oldW + cur * addW) / newW).toFixed(2)   // 비중가중 평단
      const newStop = +(newAvg - ATR_STOP * a).toFixed(2)
      const newTarget = +(newAvg + ATR_TARGET * a).toFixed(2)
      const stopDistPct = ((newAvg - newStop) / newAvg) * 100
      const newRisk = +(newW * stopDistPct / 100).toFixed(2)
      // 히트 상한 초과하면 물타기 스킵(신규진입과 동일 규율)
      if (heatNow - (Number(t.risk_pct) || 0) + newRisk > PORT_HEAT + 0.01) continue
      await rest(`stock_paper_trade?id=eq.${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          weight_pct: newW, avg_price: newAvg,               // ⚠️ entry_price는 원 진입가 유지(H: MAE/MFE 오염 방지)
          stop_price: newStop, target_price: newTarget,
          risk_pct: newRisk,
          add_count: (t.add_count || 0) + 1,
          entry_reason: `${t.entry_reason} || [물타기 ${(t.add_count||0)+1}회] ${cur} 매수(${drop.toFixed(1)}% 하락, 점수 유효) → 평단 ${newAvg}`,
        }),
      })
      usedNow += addW; heatNow += newRisk - (Number(t.risk_pct) || 0); added++
    }
  }

  // ── 2) 신규 진입 판정 — 종합 근거 기반(점수 하나로 자르지 않음) + 거시 국면 반영
  const stillOpenRows = await rest(`stock_paper_trade?select=symbol,risk_pct,weight_pct,status,tier&status=in.(open,pending)&rule=eq.${RULE}`)
  const room = Math.max(0, MAX_OPEN - stillOpenRows.length)
  const openSyms = new Set(stillOpenRows.map(r => r.symbol))
  let openHeat = stillOpenRows.reduce((a, r) => a + (Number(r.risk_pct) || 0), 0)   // 현재 열린 위험 합

  const macroKR = macroPre.kr, macroUS = macroPre.us

  const scored = []
  for (const r of cache) {
    const sc = r.scores || {}
    if (openSyms.has(r.symbol)) continue
    // 레버리지 상품은 재무·공시가 구조상 없어 커버리지 상한이 ~60% → 기준 완화(대신 점수·근거로 게이팅).
    const covFloor = sc.leverage != null ? 0.5 : MIN_COVERAGE
    if (Number(r.coverage) < covFloor) continue
    if (!(Number(sc.price) > 0) || !(Number(sc.atr14) > 0)) continue
    const macroFav = r.country === 'US' ? macroUS : macroKR
    const reasons = entrySignal(sc, macroFav)
    if (!reasons) continue
    // 코어(대형주) vs 위성(비메이저): 시총 기준. 위성은 지표(모멘텀·상대강도)가 강한 종목만.
    const cap = Number(sc.mcap)
    const isSat = SAT_ENABLED && Number.isFinite(cap) && cap > 0 && cap < SAT_CAP_MAX
      && (Number(sc.mom) > 0 || Number(sc.rs60) > 0)     // 비메이저는 '강한' 것만
    scored.push({ r, sc, reasons, tier: isSat ? 'satellite' : 'core' })
  }
  // 점수 높은 순으로 채우되, 비중·전체위험(히트) 상한을 지킨다
  scored.sort((a, b) => Number(b.sc.total) - Number(a.sc.total))

  // 현재 열려있는 자본 투입 합(현물은 100% 초과 불가) — 신규 진입은 남은 현금 안에서만.
  const openWeight = stillOpenRows.reduce((a, r) => a + (Number(r.weight_pct) || 0), 0)
  let usedCapital = openWeight
  // 코어 예산 = 전체투입 - 위성예산. 위성은 별도 버킷으로 SAT_BUDGET까지만.
  const coreCap = MAX_INVESTED - SAT_BUDGET
  // ⚠️ 기존 위성 노출을 반영해 시작(G: 매 실행 0 초기화하면 SAT_BUDGET 초과 가능)
  let usedSat = stillOpenRows.filter(r => r.tier === 'satellite').reduce((a, r) => a + (Number(r.weight_pct) || 0), 0)
  // 코어 먼저, 그다음 위성 순으로 처리(위성이 코어 자리를 뺏지 않게)
  const ordered = [...scored.filter(x => x.tier === 'core'), ...scored.filter(x => x.tier === 'satellite')]

  const news = []
  for (const { r, sc, reasons, tier } of ordered) {
    if (news.length >= room) break
    if (openHeat >= PORT_HEAT) break                     // 전체 위험 한도 도달 → 신규 중단
    // 버킷별 예산 체크: 코어는 coreCap, 위성은 SAT_BUDGET
    const budgetLeft = tier === 'satellite'
      ? Math.min(SAT_BUDGET - usedSat, MAX_INVESTED - usedCapital)
      : Math.min(coreCap - (usedCapital - usedSat), MAX_INVESTED - usedCapital)
    if (budgetLeft < 1) continue
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
    // 버킷 예산으로 캡
    if (weight > budgetLeft) weight = budgetLeft
    weight = +weight.toFixed(2)
    if (weight < 1) continue                             // 너무 작은 비중은 건너뜀
    const finalRisk = +(weight * stopDistPct / 100).toFixed(2)
    openHeat += finalRisk
    usedCapital += weight
    if (tier === 'satellite') usedSat += weight
    const invest = Math.round(SEED * weight / 100)
    // 체결 방식: 장전 판정은 '다음 시가'(당일 시가 미확정 → pending), 종가 판정은 '당일 종가' 즉시 체결.
    const isPre = SESSION === 'preopen'
    news.push({
      symbol: r.symbol, country: r.country, name: r.name, rule: RULE, tier,
      status: isPre ? 'pending' : 'open',
      entry_date: today, entry_price: price,     // pending은 다음 실행에서 시가로 덮어씀
      entry_score: Math.round(Number(sc.total)),
      entry_grade: sc.grade || gradeOf(Number(sc.total)),
      session: SESSION, decided_at: nowIso,
      fill_basis: isPre ? 'next_open' : 'close',
      entry_reason: `[${SESSION_KO} 판정 ${kstHM} KST · ${isPre ? '다음 시가 체결' : '당일 종가 체결'}] ${reasons.join(' · ')} || ` + entryReason({ ...sc, coverage: r.coverage, grade: sc.grade || gradeOf(Number(sc.total)) }),
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

  const finalInvested = usedNow + news.reduce((a, n) => a + (Number(n.weight_pct) || 0), 0)
  console.log(`[paper] ${today} · 청산 ${closed} · 취소 ${canceled} · 물타기 ${added} · 신규 ${opened} (보유 ${stillOpenRows.length - closed + opened}/${MAX_OPEN}) · 투입 ${finalInvested.toFixed(0)}%/현금 ${(100 - finalInvested).toFixed(0)}% · 거시 KR:${macroKR ? '우호' : '주의'}/US:${macroUS ? '우호' : '주의'} · 규칙 ${RULE}`)
})()

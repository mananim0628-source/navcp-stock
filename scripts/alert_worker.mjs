// 알림 워커 — ①감지: 관심종목의 등급 변화·점수 임계 도달을 stock_score_history로 판정
//              ②적재: stock_alert_outbox에 대기열로 쌓음(중복은 unique로 차단)
//              ③발송: SMTP 설정이 있을 때만 실제 전송, 없으면 적재까지만 하고 종료
// 실행: node scripts/alert_worker.mjs   (엔진 실행 뒤 크론으로 호출)
//
// ⚠️ 원칙
//  - 알림은 "점수가 이렇게 바뀌었다"는 **사실 통지**다. 매수·매도 권유 문구를 절대 넣지 않는다(§6).
//  - 광고성 정보가 아니므로 별도 수신동의 없이 발송 가능하나, 본문에 그 사실을 명시한다.
//  - 사용자가 신청한 관심종목에 대해서만 보낸다. 신청하지 않은 종목을 끼워 보내지 않는다.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lpdhtagnbqwjagtmifug.supabase.co'
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SITE = process.env.SITE_URL || 'https://stock.navcp.xyz'
const DRY = process.env.ALERT_DRY_RUN === '1'

if (!SUPA_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 없음')

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }
const rest = async (path, init = {}) => {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 160)}`)
  return r.status === 204 ? null : r.json()
}
const gradeOf = t => t >= 78 ? '강한우호' : t >= 66 ? '우호' : t >= 56 ? '중립' : t >= 48 ? '주의' : '경계'
const RANK = { 경계: 0, 주의: 1, 중립: 2, 우호: 3, 강한우호: 4 }

;(async () => {
  // 1) 최근 2개 스냅샷 날짜
  const days = await rest('stock_score_history?select=d&order=d.desc&limit=500')
  const uniq = [...new Set(days.map(x => x.d))].sort().reverse()
  if (uniq.length < 2) { console.log('[alert] 이력이 2일 미만 — 변화 판정 불가, 종료'); return }
  const [today, prev] = uniq
  console.log(`[alert] 비교: ${prev} → ${today}`)

  // 2) 관심종목 + 알림설정 (설정 없는 사용자는 기본값으로 간주하지 않고 제외 = 명시 신청자만)
  const [watch, prefs] = await Promise.all([
    rest('stock_watchlist?select=user_id,symbol,country'),
    rest('stock_alert_pref?select=user_id,channel,on_grade_change,on_threshold'),
  ])
  if (!watch.length || !prefs.length) { console.log('[alert] 관심종목/알림설정 없음 — 종료'); return }
  const prefBy = new Map(prefs.map(p => [p.user_id, p]))

  // 3) 대상 종목의 오늘/어제 점수
  const symbols = [...new Set(watch.map(w => w.symbol))]
  const inList = `in.(${symbols.map(s => `"${s}"`).join(',')})`
  const [curr, past] = await Promise.all([
    rest(`stock_score_history?select=symbol,name,total,grade,country&d=eq.${today}&symbol=${inList}`),
    rest(`stock_score_history?select=symbol,total,grade&d=eq.${prev}&symbol=${inList}`),
  ])
  const cur = new Map(curr.map(r => [r.symbol, r]))
  const old = new Map(past.map(r => [r.symbol, r]))

  // 4) 이메일 조회(서비스 롤 전용 admin API)
  const emailOf = new Map()
  const userIds = [...new Set(watch.map(w => w.user_id))]
  for (const id of userIds) {
    try {
      const r = await fetch(`${SUPA_URL}/auth/v1/admin/users/${id}`, { headers: H })
      if (r.ok) { const j = await r.json(); if (j?.email) emailOf.set(id, j.email) }
    } catch {}
  }

  // 5) 이벤트 생성
  const rows = []
  for (const w of watch) {
    const p = prefBy.get(w.user_id)
    if (!p) continue
    const email = emailOf.get(w.user_id)
    if (!email) continue
    const c = cur.get(w.symbol), o = old.get(w.symbol)
    if (!c) continue
    const curGrade = c.grade || gradeOf(Number(c.total))
    const oldGrade = o ? (o.grade || gradeOf(Number(o.total))) : null

    // 등급 변화
    if (p.on_grade_change && oldGrade && oldGrade !== curGrade) {
      rows.push({
        user_id: w.user_id, email, symbol: w.symbol, country: c.country || w.country, name: c.name,
        kind: 'grade_change',
        event_key: `${today}:${w.symbol}:grade:${oldGrade}->${curGrade}`,
        payload: { from: oldGrade, to: curGrade, total: c.total, up: (RANK[curGrade] ?? 0) > (RANK[oldGrade] ?? 0) },
      })
    }
    // 점수 임계 도달(어제는 미달 → 오늘 도달한 순간만)
    const th = p.on_threshold
    if (th != null && o != null && Number(o.total) < th && Number(c.total) >= th) {
      rows.push({
        user_id: w.user_id, email, symbol: w.symbol, country: c.country || w.country, name: c.name,
        kind: 'threshold',
        event_key: `${today}:${w.symbol}:th${th}`,
        payload: { threshold: th, total: c.total, grade: curGrade },
      })
    }
  }

  if (!rows.length) { console.log('[alert] 발생한 이벤트 없음'); return }

  // 6) 적재 (중복은 unique 제약이 걸러냄)
  const ins = await fetch(`${SUPA_URL}/rest/v1/stock_alert_outbox?on_conflict=user_id,event_key`, {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(rows),
  })
  const queued = ins.ok ? await ins.json() : []
  console.log(`[alert] 이벤트 ${rows.length}건 감지 · 신규 적재 ${queued.length}건`)

  // 7) 발송 — SMTP 미설정이면 적재까지만(없는 기능을 있는 척하지 않음)
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
  if (DRY || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log('[alert] SMTP 미설정(또는 DRY) — 대기열 적재까지만 수행. 설정 후 재실행하면 발송됩니다.')
    return
  }
  const nodemailer = await import('nodemailer').catch(() => null)
  if (!nodemailer) { console.log('[alert] nodemailer 미설치 — npm i nodemailer 후 재실행'); return }
  const port = Number(process.env.SMTP_PORT || 587)
  const tx = nodemailer.default.createTransport({
    host: SMTP_HOST, port, secure: port === 465,
    // Gmail 앱 비밀번호는 'xxxx xxxx xxxx xxxx' 형태로 복사되는 경우가 많다 → 공백 제거
    auth: { user: SMTP_USER, pass: String(SMTP_PASS).replace(/\s/g, '') },
  })

  const pending = await rest('stock_alert_outbox?select=*&status=eq.pending&order=created_at&limit=200')
  let sent = 0, failed = 0
  for (const m of pending) {
    const nm = m.name || m.symbol
    const p = m.payload || {}
    const subj = m.kind === 'grade_change'
      ? `[투자나침반] ${nm} 등급 변화: ${p.from} → ${p.to}`
      : `[투자나침반] ${nm} 점수 ${p.total}점 (설정 ${p.threshold}점 도달)`
    // ⚠️ 매수·매도 권유 문구 금지. 사실 통지 + 면책만.
    const html = `
      <div style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:520px">
        <h2 style="font-size:18px;margin:0 0 12px">${nm} <span style="color:#8A93B5;font-weight:400">${m.symbol}</span></h2>
        <p style="font-size:15px;line-height:1.7;margin:0 0 14px">
          ${m.kind === 'grade_change'
            ? `등급이 <b>${p.from}</b>에서 <b>${p.to}</b>로 바뀌었습니다. (현재 ${p.total}점)`
            : `점수가 <b>${p.total}점</b>이 되어 설정하신 <b>${p.threshold}점</b>에 도달했습니다. (현재 등급 ${p.grade})`}
        </p>
        <p style="margin:0 0 18px">
          <a href="${SITE}/scores/${m.symbol}" style="background:#19C2B0;color:#06121f;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">상세 보기</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0">
        <p style="font-size:12px;color:#6b7280;line-height:1.7;margin:0">
          이 메일은 회원님이 관심종목으로 등록하고 알림을 신청하신 종목의 <b>점수 변화를 알려드리는 안내</b>이며,
          매수·매도 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다.<br>
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다.<br>
          광고성 정보가 아닙니다. 알림 해제: <a href="${SITE}/my">${SITE}/my</a>
        </p>
      </div>`
    try {
      await tx.sendMail({ from: SMTP_FROM || SMTP_USER, to: m.email, subject: subj, html })
      await rest(`stock_alert_outbox?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }) })
      sent++
    } catch (e) {
      await rest(`stock_alert_outbox?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error: String(e.message).slice(0, 200) }) })
      failed++
    }
    await new Promise(r => setTimeout(r, 300))
  }
  console.log(`[alert] 발송 ${sent}건 · 실패 ${failed}건`)
})()

#!/bin/bash
# ── 중복 실행 방지 잠금 ──
# 과거 사고: 엔진을 겹쳐 실행하면 각자의 stale 정리(DELETE cached_at < now)가 서로가 쓴 행을 지워
# 테이블이 통째로 비었다(US 70종목 -> 2종목). flock 으로 원천 차단.
LOCK=/var/lock/navcp_paper.lock
exec 9>"$LOCK" || exit 1
flock -n 9 || { echo "[skip] 이미 실행 중 $(date "+%F %T")"; exit 0; }
SRK=$(docker exec n8n printenv SUPABASE_SERVICE_ROLE_KEY)
SUPABASE_SERVICE_ROLE_KEY=$SRK /usr/bin/node /root/paper_trade.mjs >> /root/paper.log 2>&1

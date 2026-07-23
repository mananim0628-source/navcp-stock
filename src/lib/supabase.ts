import { createClient } from '@supabase/supabase-js'

// 웹은 공개 anon 키로 stock_score_cache만 읽음(RLS select=true). 쓰기는 엔진(service_role)만.
// 빌드 시 env 없어도 createClient가 안 터지게 placeholder 폴백(실배포엔 Vercel env 주입).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(url, anon)

export type StockScore = {
  symbol: string
  name: string | null
  market: string | null
  scores: Record<string, number | string | null>
  coverage: number | null
  cached_at: string
}

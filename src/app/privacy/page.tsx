import Link from 'next/link'
import { T, bgGradient, cardStyle } from '@/lib/theme'
import { getLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

export const metadata = { title: '개인정보 처리방침 — 투자나침반 주식' }

// 개인정보 처리방침 — 개인정보보호법 제30조 기재사항 반영(수집항목·목적·보유기간·위탁·국외이전·권리·파기·책임자).
// ⚠️ 법률 자문이 아닙니다. 회원가입/알림 기능을 실제로 열기 전 변호사 검토를 받으세요.
const EFFECTIVE = '2026-07-24'

type Sec = { h: string; body: string[] }

const KO: Sec[] = [
  { h: '1. 총칙', body: [
    '투자나침반 주식(stock.navcp.xyz, 이하 "서비스")은 이용자의 개인정보를 중요하게 생각하며, 「개인정보 보호법」 등 관련 법령을 준수합니다.',
    '서비스는 회원가입 없이도 모든 점수·분석 정보를 무료로 열람할 수 있습니다. 아래 개인정보는 선택 기능(관심종목 저장, 알림 수신, 커뮤니티 이용)을 사용할 때에 한해 처리됩니다.',
  ]},
  { h: '2. 수집하는 개인정보 항목', body: [
    '· 회원가입(선택): 이메일 주소',
    '· 서비스 이용 과정에서 자동 생성: 접속 IP, 브라우저·기기 정보, 접속 일시, 쿠키',
    '· 커뮤니티 이용 시: 익명 닉네임(자동 생성), 작성 내용, 작성 일시',
    '· 주민등록번호, 계좌번호, 결제정보 등 민감정보·고유식별정보는 일절 수집하지 않습니다.',
  ]},
  { h: '3. 개인정보의 처리 목적', body: [
    '· 이메일: 회원 식별·로그인(매직링크), 관심종목 저장, 이용자가 신청한 알림 발송',
    '· 접속기록·쿠키: 서비스 유지·보안(부정 이용 및 도배 방지), 언어 설정 저장, 통계 분석',
    '· 커뮤니티 기록: 게시판 운영, 부적절한 게시물(허위·비방·투자 권유) 관리',
    '· 수집한 개인정보는 위 목적 외의 용도로 이용하지 않으며, 목적이 변경될 경우 별도 동의를 받습니다.',
  ]},
  { h: '4. 보유 및 이용 기간', body: [
    '· 회원정보: 회원 탈퇴 시 지체 없이 파기',
    '· 커뮤니티 게시물: 작성일로부터 1년 또는 이용자 삭제 요청 시까지',
    '· 접속기록: 「통신비밀보호법」에 따라 3개월간 보관 후 파기',
    '· 관련 법령에 보존 의무가 있는 경우 해당 기간 동안 보관합니다.',
  ]},
  { h: '5. 통합 계정 안내', body: [
    '본 서비스의 회원 계정은 동일 운영자가 제공하는 「투자나침반」 서비스군(크립토 분석 서비스 navcp.xyz 포함)과 하나의 인증 시스템을 공유합니다.',
    '따라서 어느 한 서비스에서 가입하면 동일한 이메일로 다른 서비스에도 로그인할 수 있습니다.',
    '각 서비스의 이용 기록(관심종목·알림 설정 등)은 서비스별로 분리 저장되며, 이용자 본인만 접근할 수 있도록 행 수준 보안(RLS)이 적용됩니다.',
    '본 주식 서비스는 계정 종류나 다른 서비스의 결제 여부와 무관하게 모든 이용자에게 전면 무료로 제공됩니다. 유료 회원 전용 정보나 등급별 차등 제공은 존재하지 않습니다.',
    '회원 탈퇴 시 통합 계정이 삭제되어 모든 서비스의 이용이 종료됩니다.',
  ]},
  { h: '6. 개인정보의 제3자 제공', body: [
    '서비스는 이용자의 개인정보를 제3자에게 제공하지 않습니다.',
    '다만 법령에 특별한 규정이 있거나 수사기관이 적법한 절차에 따라 요구하는 경우에는 예외로 합니다.',
  ]},
  { h: '7. 개인정보 처리의 위탁 및 국외 이전', body: [
    '서비스는 안정적 운영을 위해 아래와 같이 개인정보 처리를 위탁하며, 해당 사업자의 서버는 국외에 소재합니다.',
    '· Supabase Inc. (미국) — 회원 인증, 데이터베이스 저장. 이전 항목: 이메일, 커뮤니티 기록. 보유기간: 위탁계약 종료 또는 회원 탈퇴 시까지',
    '· Vercel Inc. (미국) — 웹 호스팅. 이전 항목: 접속 IP·기기정보 등 접속기록. 보유기간: 위탁계약 종료 시까지',
    '이용자는 국외 이전을 거부할 수 있으나, 거부 시 회원 기능(관심종목·알림) 이용이 제한될 수 있습니다. 비회원 열람에는 영향이 없습니다.',
  ]},
  { h: '8. 정보주체의 권리와 행사 방법', body: [
    '이용자는 언제든지 개인정보 열람·정정·삭제·처리정지를 요구할 수 있으며, 회원 탈퇴로 동의를 철회할 수 있습니다.',
    '아래 연락처로 요청하시면 지체 없이(관련 법령상 기간 내) 조치합니다. 법정대리인을 통해서도 행사할 수 있습니다.',
  ]},
  { h: '9. 개인정보의 파기', body: [
    '보유기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다.',
    '전자적 파일은 복구할 수 없는 방법으로 영구 삭제하고, 출력물은 분쇄 또는 소각합니다.',
  ]},
  { h: '10. 개인정보의 안전성 확보 조치', body: [
    '· 전송 구간 암호화(HTTPS), 데이터베이스 접근 권한 최소화(행 수준 보안 정책 적용)',
    '· 관리자 권한 분리 및 접근 기록 관리, 비밀키의 소스코드 하드코딩 금지',
    '· 커뮤니티 도배·부적절 게시물 차단을 위한 기술적 조치 적용',
  ]},
  { h: '11. 쿠키의 사용', body: [
    '서비스는 언어 설정 저장, 익명 닉네임 유지, 부정 이용 방지를 위해 쿠키 및 브라우저 저장소를 사용합니다.',
    '이용자는 브라우저 설정에서 쿠키 저장을 거부할 수 있으며, 이 경우 일부 기능이 정상 동작하지 않을 수 있습니다.',
  ]},
  { h: '12. 개인정보 보호책임자', body: [
    '· 책임자: 투자나침반 운영자',
    '· 문의: contact@navcp.xyz',
    '개인정보 침해에 대한 상담이 필요하시면 개인정보침해신고센터(privacy.kisa.or.kr, 118), 대검찰청 사이버수사과(1301), 경찰청 사이버수사국(182)에 문의하실 수 있습니다.',
  ]},
  { h: '13. 처리방침의 변경', body: [
    '법령·서비스 변경에 따라 내용이 추가·삭제될 경우 시행 7일 전부터 서비스 내 공지합니다.',
    '중요한 권리·의무의 변경이 있는 경우에는 최소 30일 전에 공지합니다.',
  ]},
]

const EN: Sec[] = [
  { h: '1. Overview', body: [
    'Investment Compass Stocks (stock.navcp.xyz, the "Service") respects your privacy and complies with the Personal Information Protection Act of Korea (PIPA) and related laws.',
    'All scores and analysis are free to view without an account. The personal data below is processed only when you use optional features (watchlists, notifications, community).',
  ]},
  { h: '2. Personal Data We Collect', body: [
    '· Sign-up (optional): email address',
    '· Automatically generated: IP address, browser/device information, access timestamps, cookies',
    '· Community use: auto-generated anonymous nickname, message content, timestamp',
    '· We never collect resident registration numbers, bank account numbers, payment details, or other sensitive/unique identifying information.',
  ]},
  { h: '3. Purpose of Processing', body: [
    '· Email: account identification and magic-link login, saving watchlists, sending notifications you requested',
    '· Access logs and cookies: service operation and security (abuse and spam prevention), language preference, statistics',
    '· Community records: operating the board and moderating inappropriate posts (false claims, defamation, investment solicitation)',
    '· We do not use collected data for any other purpose. If the purpose changes, we will obtain separate consent.',
  ]},
  { h: '4. Retention Period', body: [
    '· Account data: destroyed without delay upon account deletion',
    '· Community posts: one year from posting, or until you request deletion',
    '· Access logs: retained for 3 months under the Protection of Communications Secrets Act, then destroyed',
    '· Where retention is required by law, data is kept for the statutory period.',
  ]},
  { h: '5. Unified Account', body: [
    'Your account is shared across the Investment Compass family of services operated by the same operator, including the crypto analysis service at navcp.xyz, via a single authentication system.',
    'Signing up on one service therefore lets you sign in to the others with the same email address.',
    'Activity records for each service (watchlists, alert settings, and so on) are stored separately and protected by row-level security so that only you can access them.',
    'This stock service is provided entirely free to every user, regardless of account type or of any payment made on another service. There are no paid-member-only contents or tiered access here.',
    'Deleting your account removes the unified account and ends access to all of these services.',
  ]},
  { h: '6. Disclosure to Third Parties', body: [
    'We do not provide your personal data to third parties.',
    'Exceptions apply only where required by law or requested by investigative authorities through lawful process.',
  ]},
  { h: '7. Processing Consignment and Overseas Transfer', body: [
    'We entrust processing to the following providers, whose servers are located outside Korea:',
    '· Supabase Inc. (USA) — authentication and database storage. Data: email, community records. Period: until the contract ends or you delete your account',
    '· Vercel Inc. (USA) — web hosting. Data: access logs including IP and device information. Period: until the contract ends',
    'You may refuse the overseas transfer, but member features (watchlists, notifications) may then be unavailable. Browsing as a non-member is unaffected.',
  ]},
  { h: '8. Your Rights', body: [
    'You may request access, correction, deletion, or suspension of processing at any time, and may withdraw consent by deleting your account.',
    'Contact us using the details below and we will act without delay, within the periods required by law. Requests may also be made through a legal representative.',
  ]},
  { h: '9. Destruction of Personal Data', body: [
    'Data is destroyed without delay once the retention period expires or the purpose is fulfilled.',
    'Electronic files are permanently deleted by unrecoverable means; printed materials are shredded or incinerated.',
  ]},
  { h: '10. Security Measures', body: [
    '· Encryption in transit (HTTPS) and least-privilege database access (row-level security policies)',
    '· Separation of administrative privileges, access logging, and a strict ban on hard-coding secrets in source code',
    '· Technical controls against community spam and inappropriate posts',
  ]},
  { h: '11. Cookies', body: [
    'We use cookies and browser storage to remember your language, maintain your anonymous nickname, and prevent abuse.',
    'You can refuse cookies in your browser settings; some features may then not work correctly.',
  ]},
  { h: '12. Privacy Officer', body: [
    '· Officer: Operator, Investment Compass',
    '· Contact: contact@navcp.xyz',
    'For privacy complaints in Korea you may also contact the Privacy Infringement Report Center (privacy.kisa.or.kr, 118), the Supreme Prosecutors’ Office Cybercrime Division (1301), or the National Police Agency Cyber Bureau (182).',
  ]},
  { h: '13. Changes to This Policy', body: [
    'If this policy changes due to law or service updates, we will post notice in the Service at least 7 days before it takes effect.',
    'For changes materially affecting your rights or obligations, notice will be given at least 30 days in advance.',
  ]},
]

export default function Privacy() {
  const lang = getLang()
  const isEn = lang === 'en'
  const secs = isEn ? EN : KO

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: T.text }}>🧭 {isEn ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{isEn ? 'Stocks' : '주식'}</span></Link>
          <LangToggle lang={lang} />
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px 60px' }}>
        <h1 style={{ fontSize: 25, fontWeight: 900 }}>{isEn ? 'Privacy Policy' : '개인정보 처리방침'}</h1>
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>
          {isEn ? `Effective date: ${EFFECTIVE}` : `시행일: ${EFFECTIVE}`}
        </p>

        <div style={{ ...cardStyle, borderRadius: 12, padding: 14, marginTop: 16, fontSize: 12.5, color: T.muted, lineHeight: 1.7, borderLeft: `3px solid ${T.amber}` }}>
          {isEn
            ? 'Note: this document is a draft prepared for the operator and is not legal advice. Have it reviewed by a qualified lawyer before enabling accounts or notifications.'
            : '안내: 이 문서는 운영자용 초안이며 법률 자문이 아닙니다. 회원가입·알림 기능을 실제로 열기 전에 변호사 검토를 받으시기 바랍니다.'}
        </div>

        {secs.map(s => (
          <section key={s.h} style={{ marginTop: 26 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800 }}>{s.h}</h2>
            {s.body.map((p, i) => (
              <p key={i} style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.85, marginTop: 7 }}>{p}</p>
            ))}
          </section>
        ))}

        <p style={{ fontSize: 12, color: T.muted, marginTop: 34, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          <Link href="/" style={{ color: T.teal }}>{isEn ? '← Back to dashboard' : '← 대시보드로'}</Link>
        </p>
      </main>
    </div>
  )
}

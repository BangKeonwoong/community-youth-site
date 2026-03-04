# Supabase 운영 가이드

## 포함된 마이그레이션

- `migrations/20260301_initial.sql`
- `migrations/20260302_bootstrap_owner_profile.sql`
- `migrations/20260303_admin_invite_multiuse.sql`
- `migrations/20260304_public_invite_birthday_messages.sql`
- `migrations/20260305_schedule_calendar_events.sql`
- `migrations/20260306_realtime_chat_and_comments.sql`
- `migrations/20260307_grace_scripture_anonymous.sql`
- `migrations/20260308_login_id_member_type_auth.sql`
- `migrations/20260309_signup_no_invite_window.sql`

포함 내용:
- 핵심 테이블 10종
  - `profiles`
  - `invite_codes`
  - `meetups`
  - `meetup_participants`
  - `grace_posts`
  - `grace_post_likes`
  - `prayer_requests`
  - `prayer_supports`
  - `praise_recommendations`
  - `praise_likes`
- 공통 `updated_at` 트리거 함수: `set_updated_at()`
- 관리자 판별 함수: `is_admin(uuid)`
- 첫 가입자 관리자 부트스트랩 트리거: `bootstrap_first_user_admin()`
- 초대코드 사용 RPC: `redeem_invite_code(code, login_id, display_name, birth_date, phone_number, member_type, gender)`
- 최초 관리자 부트스트랩 RPC: `bootstrap_owner_profile(login_id, display_name, birth_date, phone_number, member_type, gender)`
- 아이디 매핑 RPC: `resolve_login_email(login_id)`
- 가입 정책 조회 RPC: `get_signup_policy()`
- 초대코드 면제 기간 설정 RPC: `set_no_invite_signup_until(until)`
- 가입 완료 RPC: `complete_signup_profile(code, login_id, display_name, birth_date, phone_number, member_type, gender)`
- 전체 RLS 활성화 및 정책

## 적용 방법

Supabase CLI 기준:

```bash
supabase db push
```

또는 SQL Editor에서 `migrations/20260301_initial.sql` 내용을 실행합니다.

## 관리자 부트스트랩

- `profiles` 첫 INSERT 시점에 기존 관리자(`is_admin = true`)가 없으면 첫 사용자에게 `is_admin = true`가 자동 부여됩니다.
- 동시성 이슈를 줄이기 위해 advisory lock을 사용합니다.

## Invite Redeem RPC

함수 시그니처:

```sql
select *
from public.redeem_invite_code(
  p_code => 'ABC12345',
  p_login_id => 'sample.id',
  p_display_name => '홍길동',
  p_birth_date => '2008-01-01',
  p_phone_number => '01012345678',
  p_member_type => 'student',
  p_gender => 'male'
);
```

동작:
- 로그인 사용자(`auth.uid()`) 필요
- 유효한 초대코드인지 검증
- 만료/중복 사용/사용량 검증
- `profiles` upsert
- `invite_codes`를 사용 완료 상태로 변경

## First Owner Bootstrap RPC

함수 시그니처:

```sql
select *
from public.bootstrap_owner_profile(
  p_login_id => 'admin.id',
  p_display_name => '관리자',
  p_birth_date => '1990-01-01',
  p_phone_number => '01012345678',
  p_member_type => 'pastor',
  p_gender => 'male'
);
```

동작:
- 로그인 사용자(`auth.uid()`) 필요
- `profiles`가 비어 있을 때만 실행 가능
- 최초 1명 프로필을 `is_admin = true`로 생성

## 초대코드 면제 기간 정책

관리자는 일정 기간 동안 초대코드 없이 가입 가능하도록 설정할 수 있습니다.

- 정책 조회:

```sql
select public.get_signup_policy();
```

- 면제 기간 설정(관리자 전용, 지금부터 지정 시각까지 유효):

```sql
select public.set_no_invite_signup_until(
  p_until => '2026-03-31T23:59:00+09:00'
);
```

- 면제 기간 즉시 종료:

```sql
select public.set_no_invite_signup_until(
  p_until => null
);
```

- 가입 완료(클라이언트에서 가입 직후 호출):

```sql
select *
from public.complete_signup_profile(
  p_code => null,
  p_login_id => 'sample.id',
  p_display_name => '홍길동',
  p_birth_date => '2008-01-01',
  p_phone_number => '01012345678',
  p_member_type => 'student',
  p_gender => 'male'
);
```

동작 요약:
- `profiles`가 비어 있으면 기존과 동일하게 첫 관리자 부트스트랩 분기
- 면제 기간 활성 시: 초대코드 미입력만 허용
- 면제 기간 비활성 시: 초대코드 필수

## 보안 원칙

- 프론트엔드에는 **`anon` 키만** 사용합니다.
- `service_role` 키는 RLS를 우회하므로 브라우저/모바일 앱 번들/공개 저장소에 절대 노출하면 안 됩니다.
- `service_role` 키는 서버 환경(백엔드, 서버리스 함수, CI의 신뢰 구간)에서만 사용합니다.

## Auth 필수 설정 (아이디 기반 가입)

이 프로젝트는 로그인 아이디 기반으로 내부 이메일(`loginId@domain`)을 사용해 가입합니다.
Supabase 대시보드 또는 Management API에서 아래 값을 권장합니다.

- `mailer_autoconfirm = true`
  - 가입 확인 메일을 강제하지 않아 `Email rate limit exceeded`를 크게 줄일 수 있습니다.
- `site_url = https://bangkeonwoong.github.io/community-youth-site/`
  - 인증 링크/리다이렉트 기본 URL

참고:
- `rate_limit_email_sent` 상향은 **커스텀 SMTP 설정이 있을 때만** 적용됩니다.
- 기본 SMTP를 쓰는 경우에는 `mailer_autoconfirm=true`가 실질적인 해결책입니다.

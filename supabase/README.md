# Supabase 운영 가이드

## 포함된 마이그레이션

- `migrations/20260301_initial.sql`
- `migrations/20260302_bootstrap_owner_profile.sql`

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
- 초대코드 사용 RPC: `redeem_invite_code(code, display_name)`
- 최초 관리자 부트스트랩 RPC: `bootstrap_owner_profile(display_name)`
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
from public.redeem_invite_code('ABC12345', '홍길동');
```

동작:
- 로그인 사용자(`auth.uid()`) 필요
- 유효한 초대코드인지 검증
- 만료/중복 사용/이메일 불일치 검증
- `profiles` upsert
- `invite_codes`를 사용 완료 상태로 변경

## First Owner Bootstrap RPC

함수 시그니처:

```sql
select *
from public.bootstrap_owner_profile('홍길동');
```

동작:
- 로그인 사용자(`auth.uid()`) 필요
- `profiles`가 비어 있을 때만 실행 가능
- 최초 1명 프로필을 `is_admin = true`로 생성

## 보안 원칙

- 프론트엔드에는 **`anon` 키만** 사용합니다.
- `service_role` 키는 RLS를 우회하므로 브라우저/모바일 앱 번들/공개 저장소에 절대 노출하면 안 됩니다.
- `service_role` 키는 서버 환경(백엔드, 서버리스 함수, CI의 신뢰 구간)에서만 사용합니다.

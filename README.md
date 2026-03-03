# 커뮤니티 프론트엔드 (Vite + React)

중고등부 커뮤니티 웹앱 프론트엔드 프로젝트입니다.

## 1) 로컬 실행

```bash
npm ci
cp .env.example .env
npm run dev
```

로컬 개발 서버는 항상 `/` 경로(base)로 동작합니다.

## 2) 환경변수

`.env` 또는 CI 환경에서 아래 값을 설정합니다.

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

- `VITE_` 접두사는 브라우저 번들에 포함됩니다.
- `VITE_SUPABASE_ANON_KEY`는 클라이언트 공개용 키입니다.
- `SUPABASE_SERVICE_ROLE_KEY`는 절대 프론트엔드(코드/`.env`/GitHub Pages)에 넣지 않습니다.

초대코드 기반 가입 플로우를 즉시 사용하려면 Supabase Auth 설정에서
`Confirm email`을 비활성화하거나, 이메일 인증 직후 로그인 후 초대코드 등록을 진행해야 합니다.

초기 온보딩:
- 첫 사용자 1명은 `/invite`에서 초대코드를 비워 가입하면 관리자 프로필이 자동 부트스트랩됩니다.
- 이후 사용자는 관리자가 발급한 초대코드로만 가입해야 합니다.

## 3) GitHub Pages 배포

배포 워크플로우: `.github/workflows/deploy.yml`

동작 순서:
1. `npm ci`
2. `npm run build`
3. Pages artifact 업로드
4. Pages 배포

`build` 단계에서 아래 GitHub Repository Secrets를 사용합니다.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 4) Vite base 경로

`vite.config.js`는 다음 규칙으로 base를 설정합니다.

- `npm run dev`(serve): `/`
- build: `GITHUB_REPOSITORY`(예: `owner/repo`)의 repo명을 추출해 `/{repo}/`

즉, GitHub Pages의 project repository 배포 경로와 맞게 자동 설정됩니다.

## 5) Supabase 스키마

초기 스키마/RLS/RPC는 아래 마이그레이션 파일을 사용합니다.

- `supabase/migrations/20260301_initial.sql`
- `supabase/migrations/20260302_bootstrap_owner_profile.sql`
- `supabase/migrations/20260306_realtime_chat_and_comments.sql`

적용/운영 가이드는 `supabase/README.md`를 참고하세요.

## 6) Gemini CLI 운영 정책 (Gemini 3 전용)

이 저장소에서는 Gemini CLI 호출 시 아래 모델 순서를 고정합니다.

1. `gemini-3-flash-preview`
2. `gemini-3.1-pro-preview`
3. `gemini-3-pro-preview`

`gemini-3-pro`는 현재 환경에서 직접 호출 시 `ModelNotFound(404)`가 발생할 수 있어,
`gemini-3-pro-preview`를 Pro 계열 fallback으로 사용합니다.

### 표준 실행

```bash
npm run ai:run -- --prompt "Return exactly: OK"
```

또는 stdin과 함께 사용할 수 있습니다.

```bash
echo "Summarize this text" | npm run ai:run -- --prompt "Keep it short"
```

### 재시도 규칙

- `429` / `MODEL_CAPACITY_EXHAUSTED`일 때만 재시도
- 총 재시도 예산: 15분 (`900s`)
- 모델별 단일 호출 timeout: 기본 `120s`

환경변수로 조정 가능합니다.

```bash
GEMINI_MAX_WAIT_SECONDS=900 GEMINI_CALL_TIMEOUT_SECONDS=120 npm run ai:run -- --prompt "..."
```

### 종료 코드

- `0`: 성공
- `42`: 용량 문제로 재시도 예산(최대 대기시간) 초과
- `1`: 기타 실패(인증/모델 미존재/입력 오류 등)

### 모델 상태 프로브

```bash
npm run ai:probe
```

필요하면 특정 모델만 검사할 수 있습니다.

```bash
npm run ai:probe -- gemini-3.1-pro-preview gemini-3-pro-preview
```

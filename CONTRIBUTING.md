# 기여 가이드

프로젝트의 코딩, 검증과 Git 커밋 규칙을 설명한다.

## 개발 환경

- Node.js 22.12 이상
- npm 10 이상
- 의존성 설치는 `npm ci`를 사용한다.

## 아키텍처

- 단일 Vite SPA와 단일 저장소 구조를 유지한다.
- 최상위 의존 방향은 `app → pages → widgets → entities → shared`다.
- Slice 외부에서는 각 Slice의 `index.ts` Public API만 사용한다.
- 같은 레이어의 Slice끼리 직접 참조하지 않는다.
- `pages/control`, `pages/mlops`, `pages/bigdata`는 Slice Group이며 그룹 공용 `index.ts`, `model`, `api`를 만들지 않는다.
- 범용 transport는 `shared`, 도메인 Port·Mapper·Adapter는 `entities`, 실제 구현 조립은 `app`에서 소유한다.
- `shared/ui/<component>`와 `shared/lib/<module>`도 각 디렉터리의 `index.ts`를 Public API로 사용한다.
- UI는 제조사 문자열이 아니라 Capability와 Integration Profile을 기준으로 분기한다.
- 새 레이어, 빈 Slice 또는 범용 추상화를 실제 사용 사례보다 먼저 만들지 않는다.

## TypeScript와 React

- TypeScript strict를 유지한다.
- `any`와 TypeScript `enum`을 사용하지 않는다.
- 외부 입력은 `unknown`에서 명시적으로 검증한 뒤 내부 모델로 변환한다.
- React 컴포넌트는 함수 컴포넌트와 named export를 사용한다. 도구가 요구하는 설정 파일의 default export만 예외다.
- 외부 입력의 단위, clock, 좌표와 식별자 의미는 Mapper에서 확인한다.
- 확인되지 않은 값을 `0`, 빈 문자열, 임의 sequence·timestamp 또는 외부 ID처럼 보이는 값으로 만들지 않는다. 안전하게 파생할 수 없다면 `null`, `unknown` 또는 기능 비활성화를 사용한다.
- 시간과 랜덤 값은 시험에서 제어할 수 있도록 주입한다.
- 고주기 원본 데이터를 React state에 무제한 누적하지 않는다.
- timer, subscription, listener와 `MediaStreamTrack`은 대상 변경, 화면 이탈과 재마운트 시 정리한다.
- 비동기 초기화는 오래된 작업이 중지 이후 상태나 연결을 되살리지 않도록 경쟁 상태를 처리한다.

## UI

- 재사용 UI는 `shared/ui/<component>`에서 소유하고 해당 디렉터리의 `index.ts`를 통해 공개한다.
- 업무 Slice는 `shared/ui` 내부 구현이나 외부 UI 라이브러리를 직접 import하지 않는다.
- UI 라이브러리와 상호작용 Primitive는 실제로 필요한 컴포넌트만 추가하고 `shared/ui` 내부에서 래핑한다.
- 접근성, 키보드 조작, focus visible과 Loading·Empty·Error·Retry·Ready 상태를 함께 구현한다.
- `className`을 통한 업무 코드의 재정의는 배치와 크기 같은 레이아웃 조정으로 제한한다.
- 실제 사용 사례 없이 거대한 variant API, 불필요한 애니메이션 또는 미래용 컴포넌트를 만들지 않는다.

## Adapter와 상태 처리

- Page, Widget과 Entity UI는 Adapter 구현 종류로 분기하거나 구체적인 in-memory·fixture·simulation 구현을 import하지 않는다.
- fixture와 Adapter는 내부 표준 DTO를 반환하며 구현 식별자를 업무 payload나 사용자 문구에 넣지 않는다.
- Runtime Config 전체는 `app`에서 소비하고 필요한 최소 설정만 하위 계층에 전달한다.
- Entity 간 후속 작업은 Entity Slice끼리 직접 참조하지 않고 `app/composition`에서 조립한다.
- Page에 고정 기준 시각이나 합성 집계를 두지 않고 주입된 Clock과 Entity·Analytics Port를 사용한다.
- 목록의 검색·필터·정렬·페이지와 export는 같은 record 집합과 query 의미를 사용한다.
- 장기 원본 시계열은 Page나 브라우저 메모리에 누적하지 않고 집계 Port에서 표시점을 제한한다.
- 조회와 변경 command는 Promise 기반 Port를 사용하고 변경 가능한 Repository는 subscribe로 invalidation을 알린다.

## 문구와 주석

- 사용자 문구, 문서와 주석은 자연스러운 한국어로 작성한다. 적절한 한국어가 분명하지 않으면 널리 쓰이는 영어 원문을 사용한다.
- 코드 식별자와 파일명은 영어를 사용한다.
- 주석은 코드가 무엇을 하는지 반복하지 않고 해당 선택의 이유와 유지해야 할 불변식을 설명한다.
- 단위, 시간 기준, 좌표계, 식별자 수명과 안전 제약처럼 오해하기 쉬운 의미를 명시한다.
- 모든 필드에 형식적인 JSDoc을 붙이지 않는다.
- 공개 도메인 API와 동작이 분명하지 않은 API에는 의미 있는 JSDoc을 작성한다.

## 검증

변경 후 기본 품질 게이트를 실행한다.

```bash
npm run lint:fix
npm run verify
```

- 실행 가능한 결과물을 변경했다면 `npm run build`도 실행한다.
- 화면, 라우팅, Shell, MediaStream 또는 접근성에 영향을 줬다면 `npm run verify:browser`를 실행한다.
- 브라우저 회귀는 768px·1024px·1440px 구성을 유지하고 console 오류·경고, Vite 오류 overlay와 빈 화면을 실패로 처리한다.
- 장시간 Telemetry·MediaStream 자원 정리를 변경했다면 `npm run test:e2e:soak`을 실행한다.
- 테스트를 통과시키기 위해 assertion을 완화하거나 테스트를 skip하지 않는다.
- 스냅샷 테스트를 사용하지 않는다.
- FSD 규칙을 변경했다면 역방향 import와 deep import가 실제 lint 오류가 되는지 확인한다.
- query 경쟁, command 중복, timer·subscription·listener·track 정리와 bounded 상태를 회귀 시험으로 유지한다.
- 실패 시 console 오류, Vite 오류 overlay, screenshot과 trace를 함께 확인한다.

## Git 커밋

커밋은 한 가지 목적만 담고 관련 없는 리팩터링을 섞지 않는다. 메시지는 Conventional Commits 형식을 사용한다.

```text
<type>(<scope>): <summary>
```

`scope`는 필수이며 실제 변경 영역을 짧은 영어 식별자로 작성한다.

| type | 용도 |
| --- | --- |
| `feat` | 사용자에게 보이는 기능 추가 |
| `fix` | 결함 수정 |
| `refactor` | 동작 변경 없는 구조 개선 |
| `perf` | 성능 개선 |
| `test` | 테스트 추가·수정 |
| `docs` | 문서만 변경 |
| `build` | 빌드 시스템·의존성 변경 |
| `ci` | CI 설정 변경 |
| `chore` | 위 범주에 속하지 않는 유지보수 |

예시:

```text
feat(monitoring): add telemetry empty state
fix(runtime-config): reject unknown adapter keys
docs(repo): document deployment requirements
```

- 제목은 변경 결과가 드러나도록 짧고 구체적으로 작성한다.
- 호환성을 깨는 변경은 type 또는 scope 뒤에 `!`를 붙이고 본문에 `BREAKING CHANGE:`를 기록한다.
- 커밋 전 `git diff --check`와 변경 범위에 필요한 품질 게이트가 통과했는지 확인한다.

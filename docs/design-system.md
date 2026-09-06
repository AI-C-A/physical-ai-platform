# 통합 디자인 시스템

모니터링 화면의 레이어 중심 표현을 전체 업무 화면의 기준으로 사용한다.

## 원칙

1. 정적 표면은 배경 레이어로 구분하고 외곽 보더와 상시 그림자를 쓰지 않는다.
2. 입력 보더, 포커스 링, 표 행 구분선처럼 기능을 설명하는 경계는 유지한다.
3. 모든 floating 표면은 반투명 배경, backdrop blur, elevation을 함께 사용한다.
4. translucent 표면은 지도와 영상 위에서 floating보다 배경 맥락을 더 드러내는 오버레이에 사용한다.
5. 운영 화면은 40px 이상 조작 영역과 48px 이상 데이터 행을 유지한다.
6. 색상, 곡률, blur, elevation은 중앙 토큰을 사용하고 페이지에서 값을 직접 선택하지 않는다.

## 곡률과 중첩 표면

- 제품의 기존 곡률을 유지한다. 카드·다이얼로그·메뉴는 `design-radius-surface`(12px), 버튼·입력·내비게이션 항목은 `design-radius-control`(8px)을 기준으로 한다. `design-radius-field`는 control, `design-radius-menu`는 surface의 별칭이다.
- 밀착된 무보더 표면은 `바깥 곡률 = 안쪽 곡률 + 균일한 여백`으로 맞춘다. `layout-surface-inset`은 4px, `design-radius-surface-inner`는 `calc(surface - inset)`이므로 12px와 8px 모서리의 중심이 일치한다. soft-group과 메뉴 항목은 이 내부 곡률을 공유하며 메뉴 패딩도 같은 inset 토큰을 사용한다.
- 카드를 감싸는 밀착 프레임은 `<Surface density="inset"><Surface layer="soft-group">…</Surface></Surface>`로 구성한다. 바깥 패딩이나 자식 margin·보더를 추가하지 않는다. 0px 여백으로 붙는 미디어는 부모 Surface의 `overflow-hidden`으로 외곽을 공유한다.
- 동심원 규칙은 대응하는 모서리 사이의 가로·세로 거리가 같을 때 적용한다. 간격을 변경할 때는 중앙 inset 토큰과 파생 곡률을 함께 사용한다. 보더가 필요하면 실제 간격에 보더 두께까지 포함한다. 반지름보다 큰 여백이나 비대칭 배치에는 동심원을 강제하지 않는다.
- 일반 카드의 compact(16px)·normal(20px) 패딩은 콘텐츠 간격이다. 카드 내부의 독립된 입력·버튼을 일괄 축소하거나 카드 외곽을 크게 만들지 않는다. 원형 요소의 round 및 데이터 행의 list-row 곡률은 기존 토큰을 유지한다.

## 컴포넌트 조합과 공식 변형

- 기본 컴포넌트 → 공식 옵션 → 공통 부품 조합 → 토큰을 사용하는 제품 전용 컴포넌트 순서로 확장한다. 제품의 조회·이동·녹화 로직은 제품 컴포넌트에 두고, 색상·곡률·여백·상호작용 표현은 공통 부품이 소유한다.
- `Input`·`Select`·`SearchField`의 `controlSize="default" | "large"`는 40px·48px 최소 조작 높이를 제공한다. `surface="default" | "overlay"`는 일반 입력과 지도·영상 위 입력을 구분한다. overlay는 공통 반투명 배경·블러·고도를 사용하며 hover·focus·error·disabled 상태도 공통 필드 규칙을 따른다.
- 입력 글자는 모바일 16px·sm 이상 14px로 공통 관리한다. `Input.endAdornment`로 끝쪽 조작 부품을 조합할 수 있다. 내부 디자인을 덮어쓰던 `inputClassName`, Select의 `triggerClassName`·`contentClassName`·`itemClassName`은 제공하지 않는다.
- `SearchField`는 검색 아이콘·검색 역할·선택적 지우기 버튼·지운 뒤 입력으로 돌아오는 포커스를 함께 제공한다. `value`와 `onValueChange`는 화면의 필터 상태에 연결한다. 비활성·읽기 전용에서는 지우기 버튼을 표시하지 않는다.
- `Menu.Root`·`Menu.Trigger`·`Menu.Content`·`Menu.Label`·`Menu.Item`은 스타일이 포함된 조합 부품이다. Content는 Portal·고도·곡률·여백·애니메이션을 소유하고 `width="content" | "trigger" | "wide"`를 제공한다. Item은 `label`, `description`, `icon`, `selected`, `disabled`를 지원하며 설명 연결·선택 표시·키보드 탐색을 유지한다. 간단한 목록은 같은 부품으로 만든 `Dropdown`을 사용한다.
- `ChoiceCard`가 선택 배경·곡률·선택 표시를 소유한다. 제목·설명·보조 표시·본문은 조합 가능하며 `density="compact" | "normal"`로 간격을 선택한다. 자원·모델·데이터셋 선택은 이 부품을 공유한다.
- 지도 위 표면은 `Surface layer="translucent"` 또는 `getOverlaySurfaceClassName()`을 사용한다. 밀착 카드 프레임에는 `Surface density="inset"`을 사용한다.
- 페이지의 `className`은 외부 배치(너비·정렬·주변 간격)에 사용한다. 입력·검색·Select·메뉴·선택 카드의 내부 색상·곡률·패딩·포커스를 변경할 때는 공통 옵션을 추가하고 해당 상태를 검증한다. `check:design-system`은 직접 HTML 컨트롤, Radix 직접 사용, 내부 스타일 클래스 및 주요 컨트롤의 명시적 디자인 재정의를 검출한다. 동적으로 전달되는 모든 스타일을 증명하는 검사는 아니므로 시각 검증도 병행한다.

| 조사한 구현 | 공통화 결과 |
| --- | --- |
| 관제·다중 로봇·수집·세션·에피소드·데이터셋 검색 8곳 | `SearchField` |
| 지도 위 사이트 선택 | `Select surface="overlay" controlSize="large"` |
| 미니앱 전환·일반 Dropdown | 공통 `Menu` 부품, 앱 이동 로직은 `AppLauncher`에 유지 |
| 자원·모델·데이터셋 선택 카드 | `ChoiceCard` |
| JSON 내보내기 동작 | 공통 `Button` |
| 지도 위 패널·조작부 표면 | 공통 translucent 표면 표현 |

지도·영상·손 포즈·차트처럼 제품 고유의 시각화는 전용 컴포넌트를 유지한다. 이러한 컴포넌트도 주변 입력·메뉴·버튼·표면에는 공통 부품을 사용한다.

## 보더 최소화와 버튼 상태

- 공통 버튼은 무보더로 표시하고 보조·녹화 정지 버튼은 `action-secondary`의 중립 채움색으로 조작 영역을 구분한다. hover·active는 채움색 단계로 전달한다.
- 다이얼로그는 외곽 보더 없이 기존 floating 배경·블러·고도로 구분한다. 단계 카드와 계보 카드도 배경·간격으로 묶으며 현재 단계는 선택 배경과 상태 문구로 전달한다.
- 보조 버튼의 `action-secondary`는 adaptive greyOpacity100, `action-secondary-foreground`는 adaptive grey700에 연결한다. 라이트 채움은 `rgba(2,32,71,0.05)`, 다크 채움은 `rgba(217,217,255,0.11)`이며 각 표면 위에 합성된다.
- 눌림은 고정 grey700을 기본 채움 위에 26% 합성한 `action-secondary-active`를 사용한다. 데스크톱 hover는 adaptive greyOpacity200에 연결한다. Ghost 버튼의 hover·active는 별도 `action-ghost-*` 토큰으로 opacity100·200에 연결한다.
- 작은 버튼 문구의 대비를 위해 눌림 글자색은 공통 `action-secondary-active-foreground`에서 adaptive grey800을 사용한다. 모든 보조 버튼은 합성된 눌림 배경에서도 4.5:1 이상의 텍스트 대비를 유지해야 한다.
- 팔레트 → adaptive → semantic → 공통 컴포넌트 순서로 연결하고 모든 adaptive·semantic 토큰은 테마 영역에서 다시 계산한다. 표면은 캔버스·정적 업무 표면·플로팅 표면의 역할을 구분한다. floating 투명도·블러와 작은 글자 대비를 위한 primary·danger fill 및 상태 글자색은 공통 토큰으로 관리한다.
- `base`·`raised`·`floating` 표면에서 보조 버튼의 합성 배경·텍스트 대비, hover·active, 중첩 테마를 확인한다. 페이지나 개별 다이얼로그에서 버튼 색상을 재정의하지 않는다.
- 입력·오류 경계, 선택 컨트롤, 표의 행 구분선, 키보드 포커스는 기능을 위해 유지한다. 강제 색상 모드에서는 채움색이 사라지므로 버튼과 다이얼로그에 시스템 색상 테두리를 표시한다.
- 색상 팔레트와 곡률·움직임은 중앙 토큰을 사용하고, 조작 영역과 키보드 포커스를 유지한다.

## 한글 타이포그래피

- 한글로 표시되는 메뉴, 그룹명, 레이블에는 영문 섹션 헤더용 `text-transform: uppercase`를 적용하지 않는다.
- 한글 UI 문구에는 임의로 자간을 벌리지 않고 기본 자간을 사용한다. Tailwind에서는 `normal-case`와 `tracking-normal`을 기준으로 한다.
- `uppercase`와 확장 자간은 영문 브랜드 또는 영문 표기 사양이 명시된 경우에만 사용하며, 영문용 시각 규칙을 한글 문구에 일괄 적용하지 않는다.

## 운영 데이터의 정보 구조

- BigData 개요는 수집 데이터와 주행 운영을 각각 하나의 표면으로 묶는다. 주요 비율을 먼저 표시하고 관련 수치와 단위를 행으로 정리한다. 같은 비율을 별도 차트로 반복하지 않는다.
- 최근 학습·평가·배포는 생성 시각이 가장 최근인 항목의 이름, 상태, 생성 시각, 상세 링크를 제공한다. 각 목록의 로딩·실패·빈 상태와 재시도는 독립적으로 표시한다.
- `DefinitionGrid`는 표면 안의 평평한 정의 목록이다. 필드마다 배경과 둥근 모서리를 추가하지 않는다. 좁은 화면에서는 레이블과 값을 한 행에 배치하고 긴 값은 줄바꿈한다.
- 공통 차트의 축 문자는 `muted`, 축과 격자는 `border`, 툴팁은 `layer-raised`와 `foreground`를 사용해 테마를 따른다.
- 상태의 API 값은 유지하되 표시 문구는 공통 `flywheel-status` 사전을 사용한다. 맥락에 따라 필요한 표현은 `StatusBadge`의 `label`로 지정한다.
- 목록과 상세의 삭제 진입점은 `ghost` 버튼으로 표시하고, 확인 다이얼로그 안의 최종 삭제만 `danger`로 강조한다.
- 수집 빈 화면은 현재 상태와 새 수집 행동을 먼저 제공한다. 세부 절차는 키보드로 열 수 있는 접힌 안내에 둔다.

## 드롭다운과 사이드바

- Dropdown·Select 목록·AppLauncher는 `ui-menu-surface`와 `ui-menu-item`을 공유한다. 기본 문구는 adaptive grey700, hover 배경은 adaptive greyOpacity100을 사용한다. 곡률은 12px 표면·4px 패딩·8px 행으로 통일한다. 행은 44px 이상 조작 영역을 확보하고, 공통 floating 배경·블러·고도로 구분하며 외곽 보더를 추가하지 않는다.
- `menu-*` 토큰은 기본 문구, 선택, hover, 눌림, 비활성을 담당한다. 선택은 체크·굵기·강조 글자색으로 전달하고 키보드 탐색에는 독립된 내부 포커스 링을 둔다. 선택 글자색은 반투명 표면에서 작은 글자 대비를 유지하도록 라이트 blue900·다크 adaptive blue800을 사용한다.
- 사이드바는 `navigation-background`로 본문과 구분하고 외곽 구분선을 쓰지 않는다. 일반·선택·hover는 `navigation-*` 토큰을 사용하며 버튼의 눌림 토큰을 현재 메뉴에 재사용하지 않는다.
- 메뉴 그룹은 간격과 제목으로 구분한다. 현재 경로는 배경·강조 글자·굵기와 `aria-current`로 표시한다. 접힌 사이드바에서도 앱 전환과 메뉴 툴팁을 제공하고, 모바일 시트는 같은 내비게이션 항목과 공통 닫기 버튼을 사용한다.

## 페이지 레이아웃

- `standard`: 일반 목록과 상세
- `wide`: 고밀도 데이터와 대시보드
- `focused`: 설정과 편집
- `full-bleed`: 지도 같은 공간형 화면
- `immersive`: 영상 관제

- 일반 목록은 공통 페이지 셸의 최대 너비와 페이지 여백을 공유한다. 수집 목록과 그 위에 열리는 새 수집·장치 연결 모달의 배경도 `standard`를 사용한다.
- `Table`이 표면과 셀 여백을 담당한다. 표만 표시할 때는 패딩이 있는 `Panel`이나 `DetailPane`으로 다시 감싸지 않는다. 제목이 필요한 표는 바깥 패딩과 배경이 없는 `TableSection`을 사용한다.

## 수집 세션의 화면 높이

- 데스크톱에서는 세션 설정부터 녹화·검토까지 `100dvh` 안에 헤더, 작업 영역, 하단 조작부를 배치한다. 페이지와 작업 영역에는 세로 스크롤을 만들지 않는다.
- 주요 검증 환경은 1280×720, 1366×768, 1920×1080이다. 미리보기는 남은 높이에 맞추고 카메라의 16:9 원본 비율을 보존한다.
- 작업 정의와 장치 입력은 가로 화면에서 두 열로 배치한다. 장치 연결 이후에는 연결 정보와 준비 상태를 나란히 표시한다.
- 수집 상세는 카메라와 시각화를 대체하지 않는다. 데스크톱에서는 우측 inspector와 바깥쪽 56px 세로 메뉴를 나란히 배치한다. `세션 / 수집 / 문제` 메뉴는 패널을 닫아도 유지한다. 좁은 화면에서는 선택한 상세와 모니터를 세로로 배치하고 메뉴는 오른쪽에 고정한다. 녹화 시간과 정지·저장 조작부는 계속 표시한다.
- 사람 시연 모니터는 Head RGB, External RGB, Head 깊이·세그멘테이션, Unitree G1 기준 모델, Quest 손 포즈를 동시에 표시한다. G1은 원본 회색·검정 재질의 정적 모델이며 관절 수신 상태나 좌우 강조를 표시하지 않는다. Quest 손 포즈와 임의로 융합하지 않으며, 소스 결과가 없으면 대기 상태로 표시한다. 깊이 단위는 소스가 제공한 값으로 표시한다.
- 작업 지시는 세션 정보 안에 둔다. Episode와 현재 단계는 하단 조작부에서 `Episode 02 · 녹화 중`, `Episode 02 · 검토 중`처럼 한 번에 표시하고 inspector에서 반복하지 않는다. 저장 누계는 같은 조작부에 `저장 완료 1개`로 보조 표시하며 0개는 생략한다. 하단 조작부는 녹화 단계의 동작을 담당한다.
- Quest 연결은 `수집 상태` 탭의 `Quest 손 추적` 장치 항목에 둔다. 장치 ID와 연결 동작은 한 번만 표시하고 좌우 손 스트림을 그 아래로 묶는다. 연결 코드는 다이얼로그에서만 표시한다. 녹화본 검토 중에는 재연결 안내를 숨긴다.
- 오류·경고와 조회 재시도는 `문제` 탭에만 모으며 별도 알림 카드나 `문제 확인` 링크를 만들지 않는다. 문제 개수는 세로 메뉴의 배지에만 표시해 패널을 닫아도 바로 열 수 있다. 녹화 전에는 저장·품질 진단을 표시하지 않는다.
- 상세 패널 헤더에는 선택한 항목 제목과 우측 X 닫기 버튼을 둔다. 선택한 메뉴를 다시 누르면 패널을 닫고, 닫으면 포커스는 대응하는 세로 메뉴로 돌아간다. 메뉴는 위아래 방향키로 탐색하고 Enter·Space로 열거나 닫는다. 닫힌 상태에서는 선택 강조를 해제한다. 세션 전체 헤더에 패널 토글을 두지 않는다.
- inspector 내부 정보를 아코디언으로 숨기지 않는다. 세션 정보는 원본 기록·데이터 품질을 라벨과 값을 정렬한 행으로 배치하고, 식별 정보는 아래에 둔다. 수집 상태는 필수·선택·파생 그룹을 바로 보여 주며 장치 ID, 수신 상태·수신률, 시간 차이, 최근 누락·지연 구간을 같은 소스 행에 모은다. 동기화 요약에는 최대 시간 차이와 허용값을 표시한다. 별도 동기화 탭이나 중복 장치 목록을 만들지 않고 명령 응답은 수집 상태 탭 하단에 둔다. 관측값이 없으면 0이나 정상으로 표시하지 않는다.
- 데스크톱에서는 inspector 상단과 탭을 고정하고 탭 내용만 스크롤한다. 긴 작업 지시도 제한된 영역 안에서 스크롤해 탭을 밀어내지 않는다. 미리보기와 하단 녹화 조작부의 높이는 유지한다. 콘솔 배경은 `base`, 미디어 헤더와 inspector는 `raised`로 구분하고 inspector에 공통 `Surface`를 사용한다.
- 896px 미만과 확대 환경에서는 선택한 상세 다음에 원본 카메라·깊이·손 포즈·기준 모델을 세로 배치하고 작업 영역의 내부 스크롤을 허용한다. 원본은 16:9 판독 크기를 유지한다. 핵심 조작부는 스크롤 영역 밖에 둔다.

## Adapter 독립 UI와 초기 입력

- Mock·Real 선택은 Composition 내부에서 끝낸다. Page·Widget·Entity UI에는 실행 방식이나 이를 대신하는 환경 Context를 전달하지 않으며, 환경별 배너·문구·입력 버튼을 만들지 않는다. 화면은 같은 Port 계약과 데이터·연결·지원 상태만 소비한다.
- 수집 기록의 환경·전달 방식·출처와 평가 대상 환경은 업무 메타데이터다. 이를 Adapter 종류로 해석하거나 예시 영상 제공 여부를 결정하는 데 사용하지 않는다. 기록 영상이 연결되지 않았으면 대기 상태를 표시한다.
- 새 수집의 작업·장치 ID는 빈 값으로 시작하고 사용자가 입력한다. 선택 외부 카메라가 비어 있으면 source binding을 추가하지 않는다.
- 모바일 지도는 기본으로 공간을 확보하고 로봇 목록을 버튼으로 펼치거나 접는다. 선택한 로봇의 정보는 지도와 함께 유지한다.

## 상태·문구·접근성 판단 기준

- 수집 상태는 연결, 녹화, 파일 저장, 검토를 구분한다. 실제 진행률을 알 수 없는 작업에는 임의 백분율을 만들지 않고 현재 단계와 가능한 조치를 표시한다.
- 오류는 실패한 작업과 다음 행동을 함께 설명한다. 버튼은 실제로 수행하는 동작을 명명하고, 운영자가 알아야 할 정보부터 제시한다. 한국어 존댓말로 안내하며 수행 주체와 동작을 명확히 쓴다.
- 정상 텍스트 대비는 4.5:1, 큰 텍스트와 의미 있는 비텍스트 요소는 3:1을 기준으로 확인한다. 성공·경고 의미 토큰도 밝은 화면에서 작은 글자로 읽을 수 있어야 한다. 상태는 색 외에 문구와 아이콘으로 전달한다. [WCAG 2.2](https://www.w3.org/TR/WCAG22/#contrast-minimum)를 기준으로 삼으며, 개별 검증을 전체 준수 인증으로 표현하지 않는다.
- 폼 오류는 해당 입력에 연결하고 첫 오류로 포커스를 이동한다. 다이얼로그를 닫으면 유효한 위치로 포커스를 돌린다. 지도 핀도 키보드로 선택할 수 있는 버튼으로 제공한다.
- 검색·필터·정렬과 JSON 내보내기는 같은 레코드 집합을 사용한다. 기록 정보 내보내기는 원본 영상 다운로드와 구분한다. 데이터가 없거나 조회를 실패한 상태에서 정상적인 빈 결과를 가장하지 않는다.

## 표면 선택

- `base`: 캔버스와 같은 깊이
- `raised`: 일반 정적 업무 표면
- `floating`: 팝오버, 드롭다운, 다이얼로그, 시트, 토스트. `layer-floating` 반투명 배경과 공통 backdrop blur, elevation을 함께 사용한다.
- `translucent`: 지도와 영상 위에서 배경 맥락을 더 많이 드러내야 하는 반투명 오버레이

## 수집 미디어 패널 계약

- 깊이·분할, 손 추적, 전신 자세 카드는 `shared/ui/media-panel`의 `MediaPanel`을 사용한다. 공통 `Surface layer="canvas"`가 12px surface 곡률과 외곽 clipping을 담당한다.
- 카메라 카드도 `Surface as="figure" layer="canvas"`를 사용한다. 모든 수집 시각화 카드의 외곽은 12px 곡률·무보더·무외곽선·무그림자로 통일한다. 이름·연결 상태·FPS·관절 상태는 영상을 덮지 않는 상단 캡션에 배치하고 `layer-raised`와 `foreground` 토큰을 사용한다.
- RGB·깊이 영상은 16:9 영상 위에 제목을 붙이는 구조다. `FittedMedia`가 실제 제목·설명 높이를 제외한 공간에 카드 전체 너비를 맞춘다. 카드 내부를 늘려 여백을 만들거나 `object-cover`로 자르지 않는다. 영상은 `object-contain`, 관절 SVG는 `xMidYMid meet`로 원본 좌표계를 보존하며, 공간이 남으면 카드 바깥에 둔다.
- 패널 헤더는 공통 40px 최소 높이와 12px 가로·8px 세로 패딩을 사용하며, 콘텐츠가 늘어나면 높이가 확장된다. 헤더의 raised 레이어와 canvas 본문을 구분한다.
- 미디어 배경·문구·scrim은 `--media-*`, 3D 좌우·재질·grid·조명은 `--visual-pose-*` 의미 토큰으로 관리한다. 3D 토큰은 CSS에서 해석한 sRGB 색을 읽으며 light/dark에 따라 의미가 달라지지 않는다.
- Input·Textarea·Select는 `--design-radius-field`(control과 동일한 8px)와 공통 `field-*` 시멘틱 토큰으로 입력 표면을 공유한다.
- 수집 inspector의 세로 메뉴는 Radix Tabs의 수직 키보드 탐색을 사용한다. 선택한 메뉴는 `raised` 배경과 글자색으로 구분하며 별도의 세로 표시선을 넣지 않는다. 일반 가로 탭은 공통 `Tabs`를 사용하며 공통 버튼 색상을 페이지에서 재정의하지 않는다. 수집 하단 조작부는 `StickyActionBar appearance="plain"`으로 별도 배경과 구분선 없이 배치한다. 녹화 정지의 비파괴적 강조는 `Button variant="recording-stop"`에서 관리한다.

## 입력·선택·포커스

- 상태의 목적은 hover(조작 가능), focus(현재 조작 위치), selected(유지되는 선택)로 구분한다. 선택된 카드·옵션에도 별도의 포커스 표시가 남아야 한다.
- Input·Textarea·Select는 `ui-field`를 공유한다. 배경은 adaptive greyOpacity50, 글자색은 grey800, 기본 경계는 greyOpacity100에 연결한다. dark에서도 경계가 구분되도록 adaptive 투명 팔레트를 사용한다. 포커스·오류 배경은 각각 고정 blue900·red900을 5% 합성한다.
- 기본/hover 경계는 `field-border`/`field-border-hover`, 포커스는 필드 경계에 붙는 2px 선을 사용한다. 보더 두께는 바뀌지 않는다. 라벨은 `ui-field-group`에서 포커스·오류 상태에 맞춰 색상을 바꾸며 오류가 우선한다. 데스크톱 hover 배경은 opacity100으로 확장한다.
- 플레이스홀더는 작은 글자의 대비를 위해 adaptive grey700을 사용한다. 비활성 입력은 adaptive grey200 배경과 같은 보조 글자색을 사용한다. 선택 카드의 경계는 `choice-border` 토큰으로 분리해 입력 스타일과 독립적으로 유지한다.
- 입력 오류는 오류색 보더와 연결된 메시지로 표시한다. 오류 입력에 포커스가 오면 오류색 3px 내부 선으로 조작 위치를 표시한다. 읽기 전용은 점선 경계와 읽을 수 있는 글자 대비를 유지하며 비활성과 구별한다.
- 입력 텍스트의 드래그 선택은 `text-selection-background`, 캐럿은 `focus`를 사용한다. 라이트·다크 및 부분 테마 영역에서 의미 토큰을 다시 계산한다.
- 버튼·링크의 기본 키보드 포커스는 2px 외곽선과 2px 간격이다. 기본 규칙은 `@layer base`에 두어 컴포넌트별 표현을 덮어쓰지 않는다.
- 카드 선택은 `ui-choice`의 선택 배경·고정 두께 보더와 체크 표시로 전달한다. `focus` 토큰을 선택이나 hover의 대용으로 쓰지 않는다.
- Select·Dropdown의 `ui-menu-item`은 선택 배경·체크와 탐색 배경을 구분하며, 키보드 포커스에는 내부 선을 추가한다. 팝업은 Portal과 `design-z-popover`를 사용해 다이얼로그 위에 표시한다.
- 스크롤 경계의 탭·목록 행·표·계보 링크에는 `ui-focus-inset`을 사용한다. 체크박스 행 전체의 포커스는 `ui-focus-within`으로 표시해 이중 링을 피한다. 미디어·표의 필요한 clipping은 유지하며 자식의 z-index로 잘림을 해결하지 않는다.
- 검증은 라이트·다크, 선택+포커스, 오류+포커스, 비활성, 읽기 전용, 첫·마지막 스크롤 항목, 다이얼로그 안 셀렉트, 좁은 화면 및 강제 색상 모드를 포함한다.
- 포커스와 선택의 구분은 [WAI 키보드 인터페이스 지침](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/#focus-vs-selection-and-the-perception-of-dual-focus)을 기준으로 확인한다.

## 슬라이더

- 재생 위치 선택은 `shared/ui/slider`의 `Slider`를 사용한다. 5px 둥근 트랙과 24px 원형 손잡이를 사용하며 크기는 `--design-slider-*` 토큰으로 관리한다.
- 진행 구간은 `action-primary`, 남은 구간과 손잡이의 얇은 테두리는 `border`, 손잡이 내부는 `action-on-fill`을 사용한다. 손잡이에는 그림자를 추가하지 않으며 실제 조작 높이는 `--layout-control-height`(40px)를 유지한다.
- 현재·전체 시간은 트랙 양옆에 고정하고 `aria-valuetext`로도 제공한다. `valueLabel`은 hover·키보드 포커스·드래그 중 손잡이 위에 표시하며 공통 floating 표면을 사용한다. 같은 값을 중복 낭독하지 않도록 시각적 표시만 제공한다. 네이티브 range의 방향키·Home·End 조작을 유지하며 hover halo, `focus` 링, active 테두리, disabled 상태를 구분한다.

## 플로팅 표면 계약

- 플로팅 요소는 `Surface layer="floating"` 또는 공통 `getFloatingSurfaceClassName()`을 사용한다.
- `layer-floating`은 밝은 모드와 어두운 모드 모두 88% 불투명도를 유지한다.
- 배경 블러는 `--design-backdrop-blur-floating` 토큰을 사용한다.
- 플로팅 배경, 블러, 그림자를 화면이나 컴포넌트에서 개별 조합하지 않는다. 필요한 고도만 `default`, `prominent`, `subtle` 중에서 선택한다.
- 텍스트와 조작 요소는 반투명 배경에서도 semantic foreground 대비를 유지해야 한다.

## 공통 인터랙션 모션

- 입력 피드백은 눌림·복귀·등장·퇴장 상태별 공통 모션 토큰을 사용한다. Radix의 키보드·포커스·Presence 처리를 유지하고 CSS `:active`와 `data-state`에 모션을 연결한다.
- `ui-pressable`은 누름 180ms, 복귀 280ms를 공유한다. `design-tokens.css`의 `--design-ease-press/release`는 스프링(stiffness 1000/800, damping 55, mass 1)을 각각 180/280ms에서 샘플링하고 끝점을 1로 정규화한 `linear()` 곡선이다. 미지원 브라우저는 cubic-bezier로 대체한다.
- 축소 비율은 control 0.96(버튼·탭), compact 0.9(체크박스), subtle 0.98(메뉴 항목·Select), surface 0.99(선택 카드) 토큰으로 관리한다. modifier 클래스는 공통 컴포넌트에서 선택하며 페이지에서 숫자를 재정의하지 않는다. CSS `scale`을 사용해 실제 레이아웃 치수는 유지한다.
- 비활성·로딩 상태는 축소하지 않는다. `prefers-reduced-motion`에서는 press와 체크 표시의 크기 전환을 제거한다. 포커스·선택·오류 표시는 모션과 독립적으로 유지한다.
- Dropdown과 Select는 `motion.css`에서 공통 등장·퇴장 규칙을 사용한다. 실제 Radix 배치의 transform origin과 side를 기준으로 0.92→1 확대와 짧은 이동·페이드를 적용한다. 닫기는 1→0.96 축소·페이드로 마무리하고 퇴장 중 클릭을 막는다. Radix Presence가 퇴장 완료 후 제거와 포커스 복원을 처리한다.
- 메뉴·Select·Dialog·Sheet의 등장은 280ms release 곡선, 퇴장은 140ms exit 곡선을 사용한다. 큰 시트는 슬라이드, 다이얼로그는 작은 확대·이동으로 역할을 구분한다. 메뉴는 데스크톱의 가독성을 위해 scale 0.92부터 시작한다.
- reduced motion에서는 등장·퇴장을 이동 없는 1ms 페이드로 줄여 Presence의 종료 이벤트를 보존한다. Toast는 기존 수명 관리와 동기화된 180/120ms를 유지하고 Tooltip은 기존 짧은 피드백을 유지한다.
- 사이드바 업무·설정 링크도 `ui-pressable`을 사용한다. 펼친 목록은 subtle(0.98), 접힌 아이콘 메뉴는 control(0.96)이며 모바일 업무 메뉴에도 동일하게 적용한다.
- Dialog의 `onOpenChange(false)`에서는 `open`만 false로 바꾼다. 선택 데이터와 Dialog 자체는 유지하고, 라우트 이동·데이터 제거는 `onAfterClose`에서 수행한다. 이는 Radix Content가 퇴장 후 제거되는 시점에 호출되므로 모션 감소 설정과 CSS 시간 변경에도 별도 타이머가 필요 없다. `onCloseAutoFocus`는 포커스 복원만 담당하며, `cancelDisabled`이면 취소 버튼·Escape·바깥 클릭을 통한 닫기를 함께 막는다.

## 라우트 Morph 전환

- 버튼이나 링크에서 전체 화면으로 이어지는 전환은 `@/shared/ui/route-morph`의 `useRouteMorph`를 사용한다.
- source마다 고유한 ID를 부여하고 `getTriggerProps(to)`를 실제 조작 요소에 펼친다. 목적지의 최상위 표면에는 `useRouteMorphTarget()`이 반환한 props를 적용한다.
- 전환은 페이지 snapshot을 `object-fit: cover`로 잘라 사용하므로 source와 목적지의 비율이 달라도 콘텐츠를 찌그러뜨리지 않는다.
- 시간과 easing은 `--design-motion-route`, `--design-ease-route` 토큰을 기준으로 하며 화면별 조정은 훅의 navigation option으로만 제한한다.
- 일반적인 사각형과 `border-radius` 표면은 자동 측정한다. 자유로운 `clip-path`나 SVG 실루엣은 화면에서 별도 mask를 제공한다.
- 새 탭, 다운로드, modifier 클릭은 브라우저 기본 탐색을 유지하며 View Transition API 미지원 환경과 reduced motion에서는 일반 라우팅으로 안전하게 축소한다.

# Real Quest 손 추적 수집

PC의 **MLOps → 수집 → 새 수집**에서 실제 수집 세션을 생성하고 그 세션에 Quest를 연결한다. 양손 25개 관절 좌표·회전·반경을 PC의 3D 뷰어로 확인하며, 같은 수집 콘솔에서 Episode 녹화·정지·저장을 수행한다. 외골격과 카메라는 이 수집의 필수 장치가 아니다.

## 실행

```powershell
npm run gateway:dev
```

Patrol 설정 없이 Quest만 사용할 때는 위 명령 대신 `npm run gateway:quest`를 실행한다. **두 gateway를 동시에 실행하지 않는다.** 기본 포트는 둘 다 `127.0.0.1:8787`이다. `EADDRINUSE`는 해당 포트에서 이미 서버가 실행 중이라는 뜻이다. 코드 변경을 적용할 때 기존 gateway를 종료한 뒤 다시 실행한다.

별도 터미널에서 frontend를 시작한다.

```powershell
npm run dev:real
```

Vite가 `/api/quest`를 gateway로 전달한다. PC 수집 화면에서 서버 오류가 보이면 gateway가 실행 중인지, 새 수집 API가 포함된 코드로 재시작했는지 확인한다.

## 연결과 녹화

1. PC에서 **MLOps → 수집**(`/mlops/collection`)을 열고 **새 수집**을 누른다.
2. 세션 이름, 작업 ID, 작업 지시, Quest 장치 ID를 입력하고 세션을 생성한다.
3. 생성된 세션에 표시되는 6자리 Quest 연결 코드를 확인한다.
4. Quest 브라우저에서 같은 서버에 연결되는 HTTPS 사이트의 `/collect/quest`를 열어 코드를 입력하고 **세션 연결**을 누른다.
5. Quest에서 **MR 모드 시작**을 누르고 권한 요청을 허용한다. 기기의 손 추적을 켜고 양손이 인식되도록 둔다.
6. PC에서 연결 확인이 끝나면 **수집 콘솔 열기**를 누른다. 움직이는 양손 관절을 확인하고 **Episode 녹화 시작**을 누른다.
7. 녹화를 정지한 뒤 Quest의 남은 프레임 전송이 끝나면 녹화본을 저장한다. 다음 Episode를 같은 수집에서 이어서 기록할 수 있다.

연결 코드는 5분 동안 한 번만 사용할 수 있다. 코드가 만료되거나 Quest 페이지를 새로고침한 경우 해당 PC 수집 세션에서 코드를 갱신하고 다시 연결한다. gateway 재시작 후에도 수집 기록은 남지만 Quest는 다시 페어링해야 한다.

## Quest가 접속할 주소

### 로컬 개발: Tailscale Funnel

Mac에서 Tailscale에 로그인하고 HTTPS/Funnel 사용을 활성화한 뒤 `npm run dev:funnel`을 실행한다. frontend는 `npm run dev:real`로 5173 포트에서 실행한다. 포트가 이미 사용 중이면 기존 frontend를 중지한 뒤 다시 시작한다.

Funnel이 출력하는 HTTPS 주소 뒤에 `/collect/quest`를 붙여 Quest에서 접속한다. Git에서 제외되는 `.env.local`에 `DEV_ALLOWED_HOSTS=<Funnel 호스트명>`을 설정한 뒤 frontend를 실행해 해당 호스트만 허용한다.

주소는 매 실행마다 바뀌지 않는다. Tailscale 기기 이름이나 tailnet 이름을 변경하면 접속 주소와 `DEV_ALLOWED_HOSTS`도 갱신한다. Quest에는 Tailscale 앱이나 별도 인증서를 설치할 필요가 없다.

WebStorm에서도 frontend, gateway와 `npm run dev:funnel`을 compound 실행 설정으로 묶을 수 있다. `.idea`는 Git에서 제외되므로 checkout마다 설정한다. Funnel은 foreground로 실행하며 해당 실행 탭에서 중지한다. 이미 수동 실행 중인 Funnel이 있다면 먼저 중지한다.

Funnel은 인터넷에 frontend와 프록시 API를 공개한다. 사설 tailnet 전용 접근이 아니며, Mac의 Tailscale 연결과 인터넷 연결이 필요하다.

### 공통 연결 조건

PC와 Quest의 `/api/quest` 요청은 같은 gateway에 도달해야 한다. 동일한 HTTPS 사이트 주소를 사용하는 구성이 가장 간단하다. Quest의 `localhost`나 `127.0.0.1`은 Quest 자신을 가리킨다. 일반 HTTP LAN 주소는 WebXR 보안 연결 조건을 충족하지 않으므로 Quest가 신뢰하는 HTTPS 인증서를 사용하는 reverse proxy 또는 HTTPS 배포 환경이 필요하다.

배포 시 `npm run build:real` 결과인 `dist/`를 제공하고 다음 경로를 연결한다.

- `/api/quest/*`: gateway `127.0.0.1:8787`로 전달한다. HTTP 메서드, JSON 본문, Authorization 헤더를 유지하고 캐시하지 않는다.
- `/collect/quest`와 기타 frontend 경로: SPA의 `index.html`로 fallback한다.
- 동일 gateway 프로세스로 라우팅한다. 현재 연결 상태는 여러 인스턴스 사이에 공유되지 않는다.

HTTPS와 사용자 동작에 따른 immersive 세션 시작은 [WebXR Device API 규격](https://www.w3.org/TR/webxr/)의 요구 사항이다. 페이지 접속 뒤 Quest에서 MR 시작 버튼을 눌러야 한다.

## 저장과 연결 상태

수집 메타데이터는 gateway 작업 디렉터리의 `data/quest/<collection-id>.json`, Episode 관절 원본은 `data/quest/<episode-id>.ndjson`에 저장한다. `QUEST_COLLECTION_DATA_DIR` 환경 변수로 저장 위치를 바꿀 수 있다. PC 새로고침과 gateway 재시작 후 저장된 기록을 다시 읽는다. gateway를 배포할 때 이 디렉터리에 영속 볼륨을 연결해야 파일이 유지된다.

녹화 중단 시 Quest의 전송 완료 응답과 실제 원본 프레임이 있어야 저장 가능 상태가 된다. 서버 재시작으로 녹화가 중단되면 완료로 처리하지 않는다. 전송 완료 응답이 없는 녹화본은 자동 복구할 수 없으며, 원본을 확인하고 무효 처리한 뒤 다음 Episode를 시작한다. Episode당 최대 64MB, 수집당 최대 100개 Episode를 보관한다.

실시간 전송과 PC 조회는 약 100ms 간격이며 실제 속도는 네트워크와 브라우저에 따라 달라진다. 1.5초 이상 오래된 손 프레임은 화면에서 숨긴다. 실제 Dataset 생성과 외골격·카메라 수집은 별도 어댑터가 필요하다.

수집을 만들지 않는 임시 실시간 미리보기는 `/collect/quest?view=pc`에서 별도로 사용할 수 있다. 이 임시 모드는 녹화하지 않으며 최신 프레임만 메모리에 보관한다.

## 검증

```powershell
npm run test:gateway
npm run test:unit -- src/entities/hand-pose src/pages/collect/quest
node scripts/verify-quest-collection.mjs
```

수집 브라우저 검증은 자체 임시 gateway와 Real frontend를 실행하고 종료한다. 별도 PC·Quest 브라우저 컨텍스트에서 **새 수집 → 세션 생성 → 페어링 → 수집 콘솔 → 녹화 → 정지·저장 → PC 새로고침**을 수행하고 실제 NDJSON 파일 생성을 확인한다. 화면 캡처와 원본은 `artifacts/quest-collection-test-<timestamp>/`에 생성한다.

WebXR 하드웨어 API만 모사하며 frontend, HTTP 통신과 파일 저장은 실제 구현을 사용한다. Quest 기기의 브라우저 권한과 센서 동작은 실기기에서 별도로 확인해야 한다.

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

- `/api/quest/stream`: WebSocket Upgrade를 허용하고 gateway와 같은 프로세스로 전달한다. HTTPS 페이지에서는 WSS를 사용한다.
- `/api/quest/*`: gateway `127.0.0.1:8787`로 전달한다. HTTP 메서드, JSON 본문, Authorization 헤더를 유지하고 캐시하지 않는다.
- `/collect/quest`와 기타 frontend 경로: SPA의 `index.html`로 fallback한다.
- 동일 gateway 프로세스로 라우팅한다. 현재 연결 상태는 여러 인스턴스 사이에 공유되지 않는다.

HTTPS와 사용자 동작에 따른 immersive 세션 시작은 [WebXR Device API 규격](https://www.w3.org/TR/webxr/)의 요구 사항이다. 페이지 접속 뒤 Quest에서 MR 시작 버튼을 눌러야 한다.

## 저장과 연결 상태

수집 메타데이터는 gateway 작업 디렉터리의 `data/quest/<collection-id>.json`, Episode 관절 원본은 `data/quest/<episode-id>.ndjson`에 저장한다. `QUEST_COLLECTION_DATA_DIR` 환경 변수로 저장 위치를 바꿀 수 있다. PC 새로고침과 gateway 재시작 후 저장된 기록을 다시 읽는다. gateway를 배포할 때 이 디렉터리에 영속 볼륨을 연결해야 파일이 유지된다.

녹화 중단 시 Quest의 전송 완료 응답과 실제 원본 프레임이 있어야 저장 가능 상태가 된다. 서버 재시작으로 녹화가 중단되면 완료로 처리하지 않는다. 전송 완료 응답이 없는 녹화본은 자동 복구할 수 없으며, 원본을 확인하고 무효 처리한 뒤 다음 Episode를 시작한다. Episode당 최대 64MB, 수집당 최대 100개 Episode를 보관한다.

실시간 손 미리보기는 같은 LAN에서 WebRTC DataChannel 직접 연결을 우선 사용해 최대 60Hz 전송한다. PC는 각 화면 갱신 주기에 도착한 최신 프레임만 반영한다. 실제 속도는 Quest의 XR 프레임 주기와 네트워크·브라우저에 따라 달라진다. 전송 버퍼가 차면 미리보기만 버려 오래된 동작이 쌓이지 않게 한다. 직접 연결에 실패하면 WebSocket 중계로 전환하고, WebSocket도 끊기면 자동 재연결과 HTTP 미리보기·조회로 대체한다. 1.5초 이상 오래된 손 프레임은 화면에서 숨긴다. 실제 Dataset 생성과 외골격·카메라 녹화 수집은 별도 어댑터가 필요하다. 헤드캠과 전신 카메라의 실시간 미리보기는 [카메라 연결 안내](collection-cameras.md)를 따른다.

수집을 만들지 않는 임시 실시간 미리보기는 `/collect/quest?view=pc`에서 별도로 사용할 수 있다. 이 임시 모드는 녹화하지 않으며 최신 프레임만 메모리에 보관한다.

## 검증

```powershell
npm run test:gateway
npm run test:unit -- src/entities/hand-pose src/pages/collect/quest
node scripts/verify-quest-collection.mjs
```

수집 브라우저 검증은 자체 임시 gateway와 Real frontend를 실행하고 종료한다. 별도 PC·Quest 브라우저 컨텍스트에서 **새 수집 → 세션 생성 → 페어링 → 수집 콘솔 → 녹화 → 정지·저장 → PC 새로고침**을 수행하고 실제 NDJSON 파일 생성을 확인한다. 화면 캡처와 원본은 `artifacts/quest-collection-test-<timestamp>/`에 생성한다.

WebXR 하드웨어 API만 모사하며 frontend, HTTP 통신과 파일 저장은 실제 구현을 사용한다. Quest 기기의 브라우저 권한과 센서 동작은 실기기에서 별도로 확인해야 한다.

### 손 추적 1인칭 시점

WebXR의 같은 `local-floor` 프레임에서 손 관절과 `getViewerPose()`의 머리 위치·회전을 함께 읽는다.
`viewerPose`가 있는 실시간 프레임과 새 HTTP/NDJSON 녹화는 손 관절에서 머리 위치를 빼고 머리 회전의 역회전을 적용해 고정 카메라에 표시하며,
손 좌표를 중앙으로 이동하거나 자동 확대하지 않는다. 모니터의 수직 화각은 85도다.
실시간 머리 자세가 없거나 추적이 유실되면 수신 대기를 표시한다. 머리 자세 없는 기존 녹화만 고정 시점으로 표시한다.
바닥 격자는 표시하지 않는다.
기존 binary v1 payload는 손 전용이며, 머리 자세는 HTTP JSON의 frames에 보존한다.
적용 시 게이트웨이를 재시작하고 PC·Quest 페이지를 새로고침한 뒤 다시 연결한다.
실제 Quest의 시각적 확인은 별도로 필요하다.

### 손 추적 지연 개선

- 미리보기는 녹화 중에도 독립적으로 전송한다. 저장을 마친 과거 배치가 최신 손 위치를 덮어쓰지 않는다.
- 녹화 원본은 HTTP로 최대 64개씩 전송한다. 첫 배치는 50ms 이내 예약하며, 응답 뒤 대기열이 남아 있으면 추가 100ms 대기 없이 계속 비운다. 원본 큐는 기존 600개 상한과 유실 카운터를 유지한다. 네트워크가 장시간 중단되면 원본 유실 가능성은 남는다.
- PC의 메타데이터는 약 1초마다 별도로 갱신한다. 메타데이터 응답 대기가 손 위치 갱신을 막지 않는다.
- HTTPS 접속 주소와 연결 코드는 그대로 사용한다. gateway와 Vite를 재시작하고 PC·Quest 페이지를 새로고침해야 새 WebSocket 프록시가 적용된다. 진행 중인 Episode는 먼저 정지·저장한다.
- 같은 LAN에서는 기존 HTTPS 페이지로 접속한 뒤 인증된 WebSocket으로 연결 정보만 교환하고 손 미리보기는 Quest↔PC WebRTC로 직접 보낸다. 외부 STUN/TURN이나 Quest 앱·인증서 설치는 사용하지 않는다. AP의 클라이언트 격리, 방화벽, 브라우저의 로컬 네트워크 제한 때문에 직접 연결이 안 되면 중계 연결로 동작한다.
- 직접 미리보기는 순서를 기다리거나 손실 패킷을 재전송하지 않는다. 역순 프레임과 전송 버퍼가 찬 시점의 프레임은 버린다. 녹화 원본 전송에는 이 정책을 적용하지 않는다.
- 중계 연결도 서버·PC 수신 ACK 전에는 다음 프레임을 쌓지 않는다. 브라우저의 `bufferedAmount`만 확인할 때 보이지 않던 프록시 적체를 제한한다. 직접 연결 중에도 준비 상태와 대체 미리보기를 위해 서버로 약 5Hz의 최신 프레임을 보낸다.
- 손 뷰어의 `직접 연결 · 왕복 Nms`로 현재 경로와 왕복 시간을 확인한다. 왕복 시간은 같은 PC 시계로 측정한 DataChannel ping/pong이며 센서 처리나 디스플레이 지연은 포함하지 않는다. `중계 연결`이면 직접 연결에 성공하지 못했거나 재연결 중이다.

`node scripts/verify-quest-collection.mjs`는 Chrome의 별도 PC·Quest 컨텍스트에서 XR 하드웨어만 모사하고 실제 WebRTC, WebSocket, HTTP, 파일 저장을 검사한다. `QUEST_VERIFY_DIRECT=0`으로 WebRTC를 비활성화한 대체 경로도 검사할 수 있다. 기본적으로 녹화 요청에 120ms 지연을 추가한다(`QUEST_VERIFY_BATCH_DELAY_MS`로 변경). 4초 동안 수신 FPS와 모사 XR 프레임 생성부터 PC DOM 반영까지의 p50/p95를 `artifacts/quest-collection-test-*/latency.json`에 남기며, 원본 sequence 연속성과 저장 후 새로고침을 확인한다. 같은 Mac의 로컬 실험이므로 실제 Quest 센서 지연이나 Funnel을 포함한 측정값이 아니다.

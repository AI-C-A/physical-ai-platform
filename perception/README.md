# 수집 카메라 분석 서버

Mac은 카메라 수신과 화면 표시를 담당하고, NVIDIA 데스크탑은 추론을 담당한다.

## PC별 실행 순서

최초 모델 설치를 마친 뒤에는 데스크탑의 모델 서버 세 개를 먼저 실행하고, Mac에서 수집 앱을 실행한다. 아래 Python 명령은 Linux/WSL의 Bash 기준이다. 각 터미널에서 해당 모델의 Python 환경을 먼저 활성화하고 `/path/to/...`를 실제 경로로 바꾼다.

| PC | 실행 항목 | 포트 |
| --- | --- | --- |
| Mac | `npm run dev:real` — 수집 화면과 모델 서버 프록시 | 5173 |
| Mac | `npm run gateway:quest` — Quest 연결과 관절 녹화 | 8787 |
| Mac | `npm run dev:funnel` — Quest용 HTTPS 접속 주소 | 5173으로 전달 |
| NVIDIA 데스크탑 | RF-DETR 세그멘테이션 | 8790 |
| NVIDIA 데스크탑 | 4D Humans 전신 분석 | 8791 |
| NVIDIA 데스크탑 | MediaPipe + 세그멘테이션 헤드 분석 | 8792 |

데스크탑의 서로 다른 터미널 세 개에서 실행한다.

```bash
# 터미널 1: RF-DETR 환경
SEGMENTATION_HOST=0.0.0.0 SEGMENTATION_DEVICE=cuda:0 \
  python /path/to/robot-army-tiger-fe/segmentation/server.py
```

```bash
# 터미널 2: 4D Humans 환경
cd /path/to/4D-Humans
PERCEPTION_DEVICE=cuda:0 PYOPENGL_PLATFORM=egl \
  python /path/to/robot-army-tiger-fe/perception/server.py --mode full-body --host 0.0.0.0
```

```bash
# 터미널 3: MediaPipe 환경
HAND_LANDMARKER_MODEL=/path/to/hand_landmarker.task \
PERCEPTION_SEGMENTATION_URL=http://127.0.0.1:8790/infer \
  python /path/to/robot-army-tiger-fe/perception/server.py --mode head --host 0.0.0.0
```

Mac의 `.env.local`에는 아래 [Mac에서 연결](#mac에서-연결)의 세 주소를 지정한다. 두 PC가 Tailscale에 연결되어 있고 Mac에서 데스크탑의 8790~8792 포트에 접근할 수 있어야 한다. WSL을 사용한다면 설정한 Tailscale IP에서 WSL의 서버까지 실제로 연결되는지 확인한다.

Mac의 WebStorm에서는 compound 설정 `Real`에 다음 세 npm 실행 항목만 넣는다. 로컬 GPU 실행 항목은 포함하지 않는다.

- `Real (Frontend)` → `dev:real`
- `Real (Quest Gateway)` → `gateway:quest`
- `Real (Tailscale Funnel)` → `dev:funnel`

이 설정으로 `Real`을 한 번 실행하면 Mac의 세 프로세스가 시작된다. 이미 실행 중인 기존 프로세스는 먼저 중지한다. `.idea` 설정은 Git에서 제외되므로 다른 checkout에서는 다시 구성한다. Patrol 관제도 필요하면 Quest Gateway를 `gateway:dev`로 교체하고 Patrol 환경변수를 설정한다. 두 gateway는 같은 포트를 사용하므로 동시에 실행하지 않는다.

Mac 터미널에서 `curl --max-time 5 http://<데스크탑-IP>:8790/health`를 실행하고 8791, 8792도 확인한다. `/health` 성공 후 수집 콘솔의 헤드·전신 분석 카드에서 실제 추론 결과까지 확인한다.

## 분석 구성

- 전신: 4D Humans의 HMR2 + RegNetY 검출기(CUDA) → 원본과 별도의 3D 메시 카드.
- 헤드: 기존 RF-DETR-Seg(CUDA) + MediaPipe Hand Landmarker(CPU) → 동일 프레임 위에 마스크와 손 관절 합성.
- 현재 전신은 프레임별 메시 복원이다. PHALP의 시간축 ID 추적, 동작 이름 분류, 브라우저 3D 회전, 녹화는 포함하지 않는다.

## NVIDIA 데스크탑 준비

4D Humans의 Detectron2·EGL 의존성 때문에 Linux 환경을 기준으로 한다. Windows에서는 CUDA·EGL 사용 가능 여부를 확인한 WSL2 환경을 사용한다. Mac에 CUDA 패키지를 설치하지 않는다. 아래 절차는 구현용 설치 가이드이며 이 Mac에서 GPU 조합 검증을 완료한 것은 아니다.

세 모델의 의존성 충돌을 피하도록 별도 Python 환경/프로세스를 사용한다. 체크포인트와 SMPL 파일은 Git에 넣지 않는다.

### 1. RF-DETR-Seg · 포트 8790

저장소의 [세그멘테이션 설치 안내](../segmentation/README.md)에 따라 CUDA용 PyTorch와 `segmentation/requirements.txt`를 별도 환경에 설치한다. 저장소 루트에서:

```bash
SEGMENTATION_HOST=0.0.0.0 SEGMENTATION_DEVICE=cuda:0 npm run segmentation:dev
```

`SEGMENTATION_PYTHON`으로 해당 환경의 Python을 지정할 수 있다. Mac의 관제 화면에서도 접속할 수 있도록 바인딩하고, 같은 데스크탑의 헤드 서버는 localhost로 접속한다.

### 2. 4D Humans · 포트 8791

[공식 설치 안내](https://github.com/shubham-goel/4D-Humans)에 따라 Python 3.10 환경에 CUDA용 PyTorch와 `pip install -e '.[all]'`로 4D Humans를 설치한다. 드라이버에 맞는 PyTorch 설치 명령은 [공식 선택기](https://pytorch.org/get-started/locally/)를 사용한다. SMPL neutral 파일은 공식 안내의 등록·다운로드 절차를 직접 완료해야 한다.

4D Humans 체크아웃 루트에서 해당 환경을 활성화한 뒤 모델을 미리 준비한다:

```bash
python -c 'from hmr2.models import download_models; from hmr2.configs import CACHE_DIR_4DHUMANS; download_models(CACHE_DIR_4DHUMANS)'
```

SMPL의 `basicModel_neutral_lbs_10_207_0_v1.0.0.pkl`을 4D Humans의 `data/`에 배치한다. 모델의 상대 경로가 이 루트를 기준으로 해석되므로 **4D Humans 체크아웃에서** 서버를 실행한다. 아래 `/path/to/robot-army-tiger-fe`는 이 저장소의 실제 경로로 바꾼다.

```bash
PERCEPTION_DEVICE=cuda:0 PYOPENGL_PLATFORM=egl \
  python /path/to/robot-army-tiger-fe/perception/server.py --mode full-body --host 0.0.0.0
```

기본 HMR2 checkpoint 외의 파일은 `HMR2_CHECKPOINT`로 지정한다. CUDA가 없으면 시작에 실패하며 CPU로 몰래 전환하지 않는다. 한 프레임에서 점수가 높은 최대 4명을 batch 1로 처리한다. RegNetY 검출기 가중치는 첫 초기화 때 다운로드될 수 있다. 두 CUDA 모델의 VRAM이 부족하면 각 모델을 다른 GPU로 지정하거나 모델 크기를 조정한다.

### 3. 헤드 분석 · 포트 8792

별도 Python 3.10 환경에서:

```bash
python -m pip install -r /path/to/robot-army-tiger-fe/perception/requirements-head.txt
```

[MediaPipe 공식 모델 안내](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker#models)에서 Hand Landmarker `.task` 모델을 다운로드한 뒤:

```bash
HAND_LANDMARKER_MODEL=/absolute/path/hand_landmarker.task \
PERCEPTION_SEGMENTATION_URL=http://127.0.0.1:8790/infer \
  python /path/to/robot-army-tiger-fe/perception/server.py --mode head --host 0.0.0.0
```

손은 최대 두 개의 21개 관절을 표시한다. 여러 카메라 프레임이 번갈아 도착해도 추적 상태가 섞이지 않도록 IMAGE 모드를 사용한다. Quest 관절을 헤드 영상 위에 임의 투영하지 않는다. 세그멘테이션 연결 실패 시 손만 있는 결과를 정상 합성 결과처럼 반환하지 않는다.

## Mac에서 연결

저장소 루트의 `.env.local`에 분석 서버 주소를 지정한다. 아래 `desktop.local`을 실제 데스크탑의 LAN 주소 또는 Tailscale IP·호스트명으로 바꾼다:

```env
SEGMENTATION_TARGET=http://desktop.local:8790
PERCEPTION_BODY_TARGET=http://desktop.local:8791
PERCEPTION_HEAD_TARGET=http://desktop.local:8792
```

`npm run dev:real`로 실행한다. `SEGMENTATION_TARGET`은 로봇 관제 화면의 프록시 주소이며, 헤드 분석 서버가 사용하는 `PERCEPTION_SEGMENTATION_URL`과 별개다. 헤드와 세그멘테이션 서버가 같은 PC에 있으면 후자는 `http://127.0.0.1:8790/infer`를 유지한다. 관제 화면에서도 원격 세그멘테이션에 접속한다면 8790도 Mac에서 접근할 수 있도록 바인딩한다.

주소 변경 후 Vite를 재시작한다. 값이 없거나 비어 있으면 각 포트의 localhost를 사용한다. 실행 환경에 같은 변수가 있으면 `.env.local`보다 우선한다. 이 변수들은 `VITE_` 접두사가 없어 브라우저 코드에 환경변수로 노출되지 않는다. 브라우저는 HTTPS 사이트의 `/api/perception/*`만 호출하고 Vite가 데스크탑으로 전달하므로 브라우저의 혼합 콘텐츠/CORS 문제를 피한다. 배포 시에도 같은 경로를 리버스 프록시해야 한다. Python 서비스는 인증 없는 개발용 서버이므로 8791·8792 접근은 Mac이 있는 신뢰 네트워크로 제한한다.

수집 콘솔의 연결된 카메라마다 **원본 → 분석** 카드가 추가된다. 헤드 역할은 세그멘테이션+핸드, 전신 역할은 4D Humans로 자동 선택한다. 각 분석 카드에서 독립적으로 정지/시작할 수 있고 원본 연결은 유지된다. 외부 WHEP 카메라도 분석 카드를 제공한다.

## API와 흐름

- `GET /health`: 모델 초기화가 끝난 서비스의 `ready`, `mode`. 헤드의 RF-DETR 상위 서버 연결까지 확인하는 상태는 아니다.
- `POST /infer`: `Content-Type: image/jpeg`, 최대 2 MiB·1280×1280 픽셀 면적. 응답은 `image/png`와 `X-Perception-Mode`, `X-Detection-Count`, `X-Inference-Ms`.
- `head` PNG는 원본+마스크+손 합성, `full-body` PNG는 배경과 3D 메시. 검출 0도 정상 결과다.
- 브라우저는 회전 방향을 픽셀에 반영하고 긴 변 최대 768px·최대 5 FPS로 요청한다. 카메라별 요청은 한 개만 유지하며 서버는 동시 추론 하나 외에는 429로 돌려보낸다.
- 요청 제한은 25초, 실패 시 최대 5초 간격 재시도. 새 결과가 3초 동안 없으면 지난 이미지를 지우고 대기로 표시한다. 카드의 분석 왕복 시간은 캡처·네트워크·추론·PNG 디코딩을 포함하며 촬영 지연이나 실측 FPS가 아니다.
- 프레임/결과는 디스크에 저장하지 않는다. 고정 worker에서 모델 생성과 추론을 실행해 EGL thread 소유권을 유지한다.

## 검증

```bash
python -m unittest discover -s perception -p 'test_*.py'
npm run test:unit -- src/entities/collection-camera src/pages/mlops/flywheel/ui/BrowserCameraPanel.test.tsx
```

Python HTTP 테스트는 Pillow와 가짜 모델만 사용한다. 실제 데스크탑에서는 각 `/health` 확인 후 JPEG를 전송해 PNG를 열고, 사람이 없는 프레임·손 두 개·세로 회전·두 카메라 동시 수신·서버 중단 및 복구를 확인한다. 전신 CUDA 렌더링과 손/마스크 정합성, p50/p95 지연 및 VRAM 사용량은 GPU에서 별도로 측정해야 한다.

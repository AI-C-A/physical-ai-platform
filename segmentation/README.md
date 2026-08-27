# RF-DETR-Seg service

카메라 프레임을 RF-DETR-Seg로 처리하고 PNG mask와 label metadata를 반환하는 Python HTTP service다. frontend 개발 서버는 `/api/segmentation`을 기본 `http://127.0.0.1:8790`으로 전달한다.

## Python 환경

저장소 루트에 가상환경을 만든다.

PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

macOS 또는 Linux:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
```

사용할 GPU와 CUDA version에 맞는 PyTorch를 설치한 다음 service dependency를 설치한다.

PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install -r segmentation/requirements.txt
```

macOS 또는 Linux:

```bash
./.venv/bin/python -m pip install -r segmentation/requirements.txt
```

프로젝트 `.venv`가 아닌 환경을 사용할 때는 `SEGMENTATION_PYTHON`에 Python 실행 파일을 지정한다.

## 실행

```bash
npm run segmentation:dev
```

기본 설정:

| 항목 | 값 |
| --- | --- |
| host | `127.0.0.1` |
| port | `8790` |
| model | `nano` |
| confidence | `0.5` |
| 최대 batch | `6` |

필요하면 다음 환경변수로 변경한다.

- `SEGMENTATION_HOST`
- `SEGMENTATION_PORT`
- `SEGMENTATION_MODEL`
- `SEGMENTATION_DEVICE`
- `SEGMENTATION_THRESHOLD`
- `SEGMENTATION_BATCH_WAIT_MS`
- `SEGMENTATION_MAX_BATCH_SIZE`

## 검증

```bash
npm run test:segmentation
```

unit test는 codec, batch 처리와 HTTP 응답을 Fake model로 검증하므로 GPU model을 불러오지 않는다. 실제 service 실행은 RF-DETR-Seg와 PyTorch가 설치된 환경이 필요하다.

## HTTP API

- `GET /health`: service 상태
- `POST /infer`: JPEG 한 장 추론
- `POST /infer-batch`: 여러 JPEG를 하나의 binary batch로 추론

브라우저는 카메라별로 요청 하나만 유지하고 완료 시점의 최신 프레임만 보낸다. 처리 속도가 입력 FPS보다 느려져도 이전 요청을 누적하지 않는다.

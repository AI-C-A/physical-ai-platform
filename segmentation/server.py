from __future__ import annotations

import os
import queue
import json
import struct
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import cv2
import numpy as np


MODEL_NAMES = ("nano", "small", "medium", "large", "xlarge", "2xlarge")

PALETTE_BGR = (
    (56, 189, 248),
    (52, 211, 153),
    (251, 146, 60),
    (244, 114, 182),
    (167, 139, 250),
    (250, 204, 21),
)

BATCH_CONTENT_TYPE = "application/vnd.army-tiger.segmentation-batch"
BATCH_MAGIC = b"SGB1"
BATCH_RESPONSE_MAGIC = b"SGR2"
BATCH_COUNT = struct.Struct("!H")
BATCH_ITEM_LENGTH = struct.Struct("!I")


def detection_class_name(detections: Any, index: int) -> str:
    class_id = int(detections.class_id[index]) if detections.class_id is not None else index
    class_name = f"class {class_id}"
    class_names = detections.data.get("class_name") if isinstance(detections.data, dict) else None

    if class_names is not None and index < len(class_names):
        candidate = str(class_names[index]).strip()
        if candidate:
            class_name = candidate

    return class_name


def detection_metadata(
    image_shape: tuple[int, ...],
    detections: Any,
) -> list[dict[str, Any]]:
    boxes = detections.xyxy
    if boxes is None:
        return []

    height, width = image_shape[:2]
    labels: list[dict[str, Any]] = []
    for index, box in enumerate(boxes):
        class_id = (
            int(detections.class_id[index])
            if detections.class_id is not None
            else index
        )
        blue, green, red = PALETTE_BGR[class_id % len(PALETTE_BGR)]
        confidence = (
            float(detections.confidence[index])
            if detections.confidence is not None
            else None
        )
        labels.append(
            {
                "className": detection_class_name(detections, index),
                "color": f"#{red:02x}{green:02x}{blue:02x}",
                "confidence": confidence,
                "left": float(np.clip(float(box[0]) / width, 0, 1)),
                "right": float(np.clip(float(box[2]) / width, 0, 1)),
                "top": float(np.clip(float(box[1]) / height, 0, 1)),
            }
        )
    return labels


@dataclass
class InferenceJob:
    image_rgb: np.ndarray
    completed: threading.Event = field(default_factory=threading.Event)
    detection_count: int = 0
    elapsed_ms: float = 0.0
    error: Exception | None = None
    labels: list[dict[str, Any]] = field(default_factory=list)
    overlay_png: bytes | None = None


@dataclass(frozen=True)
class ExplicitInferenceBatch:
    jobs: list[InferenceJob]


def decode_batch_payload(payload: bytes, maximum_batch_size: int) -> list[bytes]:
    header_size = len(BATCH_MAGIC) + BATCH_COUNT.size
    if len(payload) < header_size or payload[: len(BATCH_MAGIC)] != BATCH_MAGIC:
        raise ValueError("배치 헤더가 올바르지 않습니다.")

    (frame_count,) = BATCH_COUNT.unpack_from(payload, len(BATCH_MAGIC))
    if frame_count <= 0 or frame_count > maximum_batch_size:
        raise ValueError("배치 프레임 수가 올바르지 않습니다.")

    frames: list[bytes] = []
    offset = header_size
    for _ in range(frame_count):
        if offset + BATCH_ITEM_LENGTH.size > len(payload):
            raise ValueError("배치 프레임 길이가 누락되었습니다.")
        (frame_length,) = BATCH_ITEM_LENGTH.unpack_from(payload, offset)
        offset += BATCH_ITEM_LENGTH.size
        frame_end = offset + frame_length
        if frame_length <= 0 or frame_end > len(payload):
            raise ValueError("배치 프레임 데이터가 올바르지 않습니다.")
        frames.append(payload[offset:frame_end])
        offset = frame_end

    if offset != len(payload):
        raise ValueError("배치 끝에 알 수 없는 데이터가 있습니다.")
    return frames


def encode_batch_payload(items: list[bytes]) -> bytes:
    payload = bytearray(BATCH_MAGIC)
    payload.extend(BATCH_COUNT.pack(len(items)))
    for item in items:
        payload.extend(BATCH_ITEM_LENGTH.pack(len(item)))
        payload.extend(item)
    return bytes(payload)


def encode_batch_response(jobs: list[InferenceJob]) -> bytes:
    payload = bytearray(BATCH_RESPONSE_MAGIC)
    payload.extend(BATCH_COUNT.pack(len(jobs)))
    for job in jobs:
        if job.overlay_png is None:
            raise ValueError("완료되지 않은 세그멘테이션 결과입니다.")
        metadata = json.dumps(
            job.labels,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        payload.extend(BATCH_ITEM_LENGTH.pack(len(job.overlay_png)))
        payload.extend(job.overlay_png)
        payload.extend(BATCH_ITEM_LENGTH.pack(len(metadata)))
        payload.extend(metadata)
    return bytes(payload)


def render_overlay(image_shape: tuple[int, ...], detections: Any) -> bytes:
    height, width = image_shape[:2]
    overlay = np.zeros((height, width, 4), dtype=np.uint8)
    masks = detections.mask
    if masks is not None:
        class_ids = detections.class_id
        for index, mask in enumerate(masks):
            class_id = int(class_ids[index]) if class_ids is not None else index
            color = PALETTE_BGR[class_id % len(PALETTE_BGR)]
            selected = mask.astype(bool)
            overlay[selected, :3] = color
            overlay[selected, 3] = 105

    encoded, buffer = cv2.imencode(".png", overlay)
    if not encoded:
        raise RuntimeError("세그멘테이션 오버레이를 PNG로 변환하지 못했습니다.")
    return buffer.tobytes()


class BatchInferenceWorker:
    def __init__(
        self,
        model: Any,
        *,
        batch_wait_ms: float,
        maximum_batch_size: int,
        threshold: float,
    ) -> None:
        self._batch_wait_seconds = batch_wait_ms / 1000.0
        self._jobs: queue.Queue[InferenceJob | ExplicitInferenceBatch | None] = queue.Queue(
            maxsize=20
        )
        self._maximum_batch_size = maximum_batch_size
        self._model = model
        self._postprocess_pool = ThreadPoolExecutor(
            max_workers=maximum_batch_size,
            thread_name_prefix="segmentation-overlay",
        )
        self._threshold = threshold
        self._thread = threading.Thread(
            target=self._run,
            name="rfdetr-batch-inference",
            daemon=True,
        )

    def start(self) -> None:
        self._thread.start()

    def close(self) -> None:
        try:
            self._jobs.put(None, timeout=2)
        except queue.Full:
            pass
        self._thread.join(timeout=17)
        self._postprocess_pool.shutdown(wait=True, cancel_futures=False)

    @property
    def maximum_batch_size(self) -> int:
        return self._maximum_batch_size

    def submit(self, job: InferenceJob) -> bool:
        try:
            self._jobs.put_nowait(job)
            return True
        except queue.Full:
            return False

    def submit_batch(self, jobs: list[InferenceJob]) -> bool:
        if not jobs or len(jobs) > self._maximum_batch_size:
            return False
        try:
            self._jobs.put_nowait(ExplicitInferenceBatch(jobs))
            return True
        except queue.Full:
            return False

    def _run(self) -> None:
        deferred_batch: ExplicitInferenceBatch | None = None
        while True:
            first = deferred_batch if deferred_batch is not None else self._jobs.get()
            deferred_batch = None
            if first is None:
                return

            should_stop = False
            if isinstance(first, ExplicitInferenceBatch):
                batch = first.jobs
            else:
                batch = [first]
                deadline = time.perf_counter() + self._batch_wait_seconds
                while len(batch) < self._maximum_batch_size:
                    remaining = deadline - time.perf_counter()
                    if remaining <= 0:
                        break
                    try:
                        next_job = self._jobs.get(timeout=remaining)
                    except queue.Empty:
                        break
                    if next_job is None:
                        should_stop = True
                        break
                    if isinstance(next_job, ExplicitInferenceBatch):
                        deferred_batch = next_job
                        break
                    batch.append(next_job)

            started = time.perf_counter()
            try:
                results = list(
                    self._model.predict(
                        [job.image_rgb for job in batch],
                        threshold=self._threshold,
                        include_source_image=False,
                    )
                )
                elapsed_ms = (time.perf_counter() - started) * 1000.0
                render_futures = [
                    self._postprocess_pool.submit(
                        render_overlay,
                        job.image_rgb.shape,
                        detections,
                    )
                    for job, detections in zip(batch, results, strict=True)
                ]
                for job, detections, render_future in zip(
                    batch,
                    results,
                    render_futures,
                    strict=True,
                ):
                    job.overlay_png = render_future.result()
                    job.detection_count = len(detections)
                    job.elapsed_ms = elapsed_ms
                    job.labels = detection_metadata(job.image_rgb.shape, detections)
            except Exception as error:  # HTTP 응답으로 내보내기 전에 안전한 상태 코드로 변환한다.
                for job in batch:
                    job.error = error
            finally:
                for job in batch:
                    job.completed.set()
            if should_stop:
                return


class SegmentationRequestHandler(BaseHTTPRequestHandler):
    worker: BatchInferenceWorker
    protocol_version = "HTTP/1.1"
    maximum_body_bytes = 12 * 1024 * 1024

    def do_GET(self) -> None:
        if self.path != "/health":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self._send_bytes(HTTPStatus.OK, b'{"status":"ok"}', "application/json")

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_common_headers()
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path not in {"/infer", "/infer-batch"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = self._parse_content_length()
        if content_length is None:
            return
        payload = self.rfile.read(content_length)
        if self.path == "/infer-batch":
            self._handle_batch(payload)
            return

        self._handle_single(payload)

    def _handle_single(self, payload: bytes) -> None:
        image = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            self.send_error(HTTPStatus.BAD_REQUEST, "유효한 이미지가 아닙니다.")
            return

        job = InferenceJob(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        if not self.worker.submit(job):
            self.send_error(HTTPStatus.TOO_MANY_REQUESTS, "추론 대기열이 가득 찼습니다.")
            return
        if not job.completed.wait(timeout=15):
            self.send_error(HTTPStatus.GATEWAY_TIMEOUT, "추론 시간이 초과되었습니다.")
            return
        if job.error is not None or job.overlay_png is None:
            self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, "추론에 실패했습니다.")
            return

        self.send_response(HTTPStatus.OK)
        self._send_common_headers()
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(job.overlay_png)))
        self.send_header("X-Detection-Count", str(job.detection_count))
        self.send_header("X-Inference-Ms", f"{job.elapsed_ms:.1f}")
        self.end_headers()
        self._write_body(job.overlay_png)

    def _handle_batch(self, payload: bytes) -> None:
        try:
            encoded_frames = decode_batch_payload(payload, self.worker.maximum_batch_size)
        except ValueError as error:
            self.send_error(HTTPStatus.BAD_REQUEST, str(error))
            return

        jobs: list[InferenceJob] = []
        for encoded_frame in encoded_frames:
            image = cv2.imdecode(
                np.frombuffer(encoded_frame, dtype=np.uint8),
                cv2.IMREAD_COLOR,
            )
            if image is None:
                self.send_error(HTTPStatus.BAD_REQUEST, "유효하지 않은 배치 이미지입니다.")
                return
            jobs.append(InferenceJob(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)))

        if not self.worker.submit_batch(jobs):
            self.send_error(HTTPStatus.TOO_MANY_REQUESTS, "추론 대기열이 가득 찼습니다.")
            return

        deadline = time.monotonic() + 15
        for job in jobs:
            if not job.completed.wait(timeout=max(0, deadline - time.monotonic())):
                self.send_error(HTTPStatus.GATEWAY_TIMEOUT, "추론 시간이 초과되었습니다.")
                return
        if any(job.error is not None or job.overlay_png is None for job in jobs):
            self.send_error(HTTPStatus.SERVICE_UNAVAILABLE, "추론에 실패했습니다.")
            return

        response_body = encode_batch_response(jobs)
        self.send_response(HTTPStatus.OK)
        self._send_common_headers()
        self.send_header("Content-Type", BATCH_CONTENT_TYPE)
        self.send_header("Content-Length", str(len(response_body)))
        self.send_header("X-Batch-Size", str(len(jobs)))
        self.send_header("X-Inference-Ms", f"{jobs[0].elapsed_ms:.1f}")
        self.end_headers()
        self._write_body(response_body)

    def log_message(self, message_format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {message_format % args}")

    def _parse_content_length(self) -> int | None:
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.close_connection = True
            self.send_error(HTTPStatus.BAD_REQUEST, "Content-Length가 올바르지 않습니다.")
            return None
        if content_length <= 0 or content_length > self.maximum_body_bytes:
            self.close_connection = True
            self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return None
        return content_length

    def _send_bytes(self, status: HTTPStatus, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self._send_common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self._write_body(body)

    def _send_common_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

    def _write_body(self, body: bytes) -> None:
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            # 화면 이탈로 브라우저가 최신 프레임 요청을 취소하는 것은 정상 동작이다.
            return


def load_model() -> tuple[Any, str]:
    model_name = os.environ.get("SEGMENTATION_MODEL", "nano").strip().lower()
    if model_name not in MODEL_NAMES:
        choices = ", ".join(MODEL_NAMES)
        raise ValueError(f"SEGMENTATION_MODEL은 다음 중 하나여야 합니다: {choices}")

    import torch
    from rfdetr import (
        RFDETRSeg2XLarge,
        RFDETRSegLarge,
        RFDETRSegMedium,
        RFDETRSegNano,
        RFDETRSegSmall,
        RFDETRSegXLarge,
    )

    model_classes = {
        "nano": RFDETRSegNano,
        "small": RFDETRSegSmall,
        "medium": RFDETRSegMedium,
        "large": RFDETRSegLarge,
        "xlarge": RFDETRSegXLarge,
        "2xlarge": RFDETRSeg2XLarge,
    }
    device = os.environ.get("SEGMENTATION_DEVICE", "").strip()
    if not device:
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
    model = model_classes[model_name](device=device)
    if device.startswith("cuda"):
        model.inference(compile=False, inplace=True, dtype="float16")
    return model, device


def main() -> None:
    host = os.environ.get("SEGMENTATION_HOST", "127.0.0.1")
    port = int(os.environ.get("SEGMENTATION_PORT", "8790"))
    threshold = float(os.environ.get("SEGMENTATION_THRESHOLD", "0.5"))
    batch_wait_ms = float(os.environ.get("SEGMENTATION_BATCH_WAIT_MS", "8"))
    maximum_batch_size = int(os.environ.get("SEGMENTATION_MAX_BATCH_SIZE", "6"))

    print("RF-DETR-Seg 모델을 불러오는 중입니다...")
    model, device = load_model()
    worker = BatchInferenceWorker(
        model,
        batch_wait_ms=batch_wait_ms,
        maximum_batch_size=maximum_batch_size,
        threshold=threshold,
    )
    worker.start()
    SegmentationRequestHandler.worker = worker
    server = ThreadingHTTPServer((host, port), SegmentationRequestHandler)
    server.daemon_threads = True
    print(
        f"세그멘테이션 서버 시작: http://{host}:{port} "
        f"({device}, batch<={maximum_batch_size})"
    )
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        worker.close()


if __name__ == "__main__":
    main()

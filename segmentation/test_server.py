from __future__ import annotations

import http.client
import threading
import time
import unittest
from unittest.mock import patch

import numpy as np

import server


class FakeDetections:
    mask = None
    class_id = None
    confidence = None
    data: dict[str, object] = {}
    xyxy = np.empty((0, 4))

    def __len__(self) -> int:
        return 0


class FakeModel:
    def __init__(self) -> None:
        self.batch_sizes: list[int] = []

    def predict(self, images, **_options):
        self.batch_sizes.append(len(images))
        return [FakeDetections() for _ in images]


class SegmentationServerTest(unittest.TestCase):
    def test_batch_payload_round_trip(self) -> None:
        items = [b"first", b"second"]
        encoded = server.encode_batch_payload(items)
        self.assertEqual(server.decode_batch_payload(encoded, 6), items)

    def test_overlay_has_no_text_and_returns_browser_label_metadata(self) -> None:
        detections = FakeDetections()
        detections.mask = np.zeros((1, 96, 128), dtype=bool)
        detections.mask[0, 50:80, 30:90] = True
        detections.class_id = np.array([1])
        detections.confidence = np.array([0.93])
        detections.data = {"class_name": np.array(["person"])}
        detections.xyxy = np.array([[30.0, 50.0, 90.0, 80.0]])

        encoded = server.render_overlay((96, 128, 3), detections)
        overlay = server.cv2.imdecode(
            np.frombuffer(encoded, dtype=np.uint8),
            server.cv2.IMREAD_UNCHANGED,
        )

        self.assertTrue(np.all(overlay[50:80, 30:90, 3] == 105))
        self.assertTrue(np.all(overlay[:50, :, 3] == 0))
        labels = server.detection_metadata((96, 128, 3), detections)
        self.assertEqual(labels[0]["className"], "person")
        self.assertEqual(labels[0]["color"], "#99d334")
        self.assertAlmostEqual(labels[0]["confidence"], 0.93)
        self.assertAlmostEqual(labels[0]["left"], 30 / 128)
        self.assertAlmostEqual(labels[0]["right"], 90 / 128)
        self.assertAlmostEqual(labels[0]["top"], 50 / 96)

    def test_explicit_batch_does_not_wait_for_maximum_size(self) -> None:
        model = FakeModel()
        worker = server.BatchInferenceWorker(
            model,
            batch_wait_ms=1_000,
            maximum_batch_size=6,
            threshold=0.5,
        )
        jobs = [server.InferenceJob(np.zeros((8, 8, 3), dtype=np.uint8)) for _ in range(2)]

        with patch.object(server, "render_overlay", return_value=b"png"):
            worker.start()
            self.assertTrue(worker.submit_batch(jobs))
            self.assertTrue(all(job.completed.wait(timeout=0.5) for job in jobs))
            worker.close()

        self.assertEqual(model.batch_sizes, [2])
        self.assertTrue(all(job.overlay_png == b"png" for job in jobs))

    def test_batch_overlays_are_rendered_in_parallel(self) -> None:
        model = FakeModel()
        worker = server.BatchInferenceWorker(
            model,
            batch_wait_ms=0,
            maximum_batch_size=6,
            threshold=0.5,
        )
        jobs = [server.InferenceJob(np.zeros((8, 8, 3), dtype=np.uint8)) for _ in range(6)]

        def slow_render(_image_shape, _detections) -> bytes:
            time.sleep(0.05)
            return b"png"

        with patch.object(server, "render_overlay", side_effect=slow_render):
            worker.start()
            started = time.perf_counter()
            self.assertTrue(worker.submit_batch(jobs))
            self.assertTrue(all(job.completed.wait(timeout=1) for job in jobs))
            elapsed = time.perf_counter() - started
            worker.close()

        self.assertLess(elapsed, 0.2)

    def test_health_endpoint_uses_http_1_1_keep_alive(self) -> None:
        http_server = server.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            server.SegmentationRequestHandler,
        )
        serving_thread = threading.Thread(target=http_server.serve_forever, daemon=True)
        serving_thread.start()
        connection = http.client.HTTPConnection(*http_server.server_address, timeout=2)
        try:
            connection.request("GET", "/health")
            first = connection.getresponse()
            self.assertEqual(first.version, 11)
            self.assertEqual(first.read(), b'{"status":"ok"}')

            connection.request("GET", "/health")
            second = connection.getresponse()
            self.assertEqual(second.version, 11)
            self.assertEqual(second.read(), b'{"status":"ok"}')
        finally:
            connection.close()
            http_server.shutdown()
            http_server.server_close()
            serving_thread.join(timeout=2)

    def test_batch_endpoint_runs_one_explicit_model_batch(self) -> None:
        model = FakeModel()
        worker = server.BatchInferenceWorker(
            model,
            batch_wait_ms=1_000,
            maximum_batch_size=6,
            threshold=0.5,
        )
        worker.start()
        server.SegmentationRequestHandler.worker = worker
        http_server = server.ThreadingHTTPServer(
            ("127.0.0.1", 0),
            server.SegmentationRequestHandler,
        )
        serving_thread = threading.Thread(target=http_server.serve_forever, daemon=True)
        serving_thread.start()
        connection = http.client.HTTPConnection(*http_server.server_address, timeout=2)
        try:
            success, encoded_frame = server.cv2.imencode(
                ".jpg",
                np.zeros((16, 16, 3), dtype=np.uint8),
            )
            self.assertTrue(success)
            request_body = server.encode_batch_payload(
                [encoded_frame.tobytes(), encoded_frame.tobytes()]
            )
            connection.request(
                "POST",
                "/infer-batch",
                body=request_body,
                headers={"Content-Type": server.BATCH_CONTENT_TYPE},
            )
            response = connection.getresponse()
            response_body = response.read()

            self.assertEqual(response.status, 200)
            self.assertEqual(response.getheader("X-Batch-Size"), "2")
            self.assertEqual(response_body[:4], server.BATCH_RESPONSE_MAGIC)
            self.assertEqual(server.BATCH_COUNT.unpack_from(response_body, 4)[0], 2)
            self.assertEqual(model.batch_sizes, [2])
        finally:
            connection.close()
            http_server.shutdown()
            http_server.server_close()
            serving_thread.join(timeout=2)
            worker.close()


if __name__ == "__main__":
    unittest.main()

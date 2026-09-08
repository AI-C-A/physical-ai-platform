import http.client
import io
import threading
import unittest
from PIL import Image
from server import PerceptionServer


class FakeBackend:
    def __init__(self):
        self.created_thread = threading.get_ident()
        self.fail = False

    def infer(self, frame, jpeg):
        assert threading.get_ident() == self.created_thread
        if self.fail:
            raise RuntimeError('GPU error')
        return frame, 0

    def close(self):
        assert threading.get_ident() == self.created_thread


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.server = PerceptionServer(('127.0.0.1', 0), FakeBackend, 'full-body')
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        output = io.BytesIO()
        Image.new('RGB', (8, 12)).save(output, format='JPEG')
        self.jpeg = output.getvalue()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection(*self.server.server_address, timeout=2)
        conn.request(method, path, body=body, headers=headers or {})
        response = conn.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        conn.close()
        return result

    def test_zero_detections_returns_real_png_and_mode(self):
        status, headers, png = self.request('POST', '/infer', self.jpeg, {'Content-Type': 'image/jpeg'})
        self.assertEqual(status, 200)
        self.assertEqual(headers['X-Detection-Count'], '0')
        self.assertEqual(headers['X-Perception-Mode'], 'full-body')
        self.assertEqual(Image.open(io.BytesIO(png)).size, (8, 12))
        self.assertEqual(self.request('GET', '/health')[0], 200)

    def test_validation_and_backpressure(self):
        self.assertEqual(self.request('POST', '/infer', b'bad')[0], 415)
        self.assertEqual(self.request('POST', '/infer', b'bad', {'Content-Type': 'image/jpeg'})[0], 422)
        self.assertEqual(self.request('POST', '/infer', headers={'Content-Type': 'image/jpeg', 'Content-Length': '3000000'})[0], 413)
        self.server.slot.acquire()
        try:
            self.assertEqual(self.request('POST', '/infer', self.jpeg, {'Content-Type': 'image/jpeg'})[0], 429)
        finally:
            self.server.slot.release()

    def test_failure_releases_capacity_for_retry(self):
        self.server.backend.fail = True
        self.assertEqual(self.request('POST', '/infer', self.jpeg, {'Content-Type': 'image/jpeg'})[0], 503)
        self.server.backend.fail = False
        self.assertEqual(self.request('POST', '/infer', self.jpeg, {'Content-Type': 'image/jpeg'})[0], 200)


if __name__ == '__main__':
    unittest.main()

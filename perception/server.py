"""최신 JPEG 한 장을 처리하는 제한된 동시성의 분석 서버."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import logging
import os
import threading
import time

MAX_BYTES = 2 * 1024 * 1024
MAX_PIXELS = 1280 * 1280


def decode_frame(data):
    from PIL import Image
    with Image.open(io.BytesIO(data)) as image:
        if image.format != 'JPEG' or image.width * image.height > MAX_PIXELS:
            raise ValueError('JPEG 크기 또는 형식이 올바르지 않습니다.')
        image.load()
        return image.convert('RGB')


class PerceptionServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, factory, mode):
        self.mode = mode
        self.slot = threading.BoundedSemaphore(1)
        self.worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix='perception')
        try:
            self.backend = self.worker.submit(factory).result()
            super().__init__(address, Handler)
        except Exception:
            self.worker.shutdown(wait=True)
            raise

    def process(self, data):
        frame = decode_frame(data)
        started = time.monotonic()
        output, count = self.backend.infer(frame, data)
        encoded = io.BytesIO()
        output.save(encoded, format='PNG')
        return encoded.getvalue(), count, (time.monotonic() - started) * 1000

    def server_close(self):
        super().server_close()
        self.worker.submit(self.backend.close).result()
        self.worker.shutdown(wait=True)


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def reply(self, status, body, content_type='application/json', headers=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        for key, value in (headers or {}).items():
            self.send_header(key, str(value))
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def do_GET(self):
        if self.path != '/health':
            self.reply(404, b'{}')
            return
        self.reply(200, json.dumps({'ready': True, 'mode': self.server.mode}).encode())

    def do_POST(self):
        if self.path != '/infer':
            self.reply(404, b'{}')
            return
        if self.headers.get('Content-Type', '').split(';')[0] != 'image/jpeg':
            self.reply(415, b'{"error":"JPEG required"}')
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BYTES:
            self.reply(413, b'{"error":"Invalid frame size"}')
            return
        # 처리 중인 프레임 뒤로 오래된 프레임을 적재하지 않는다.
        if not self.server.slot.acquire(blocking=False):
            self.reply(429, b'{"error":"Busy"}', headers={'Retry-After': '1'})
            return
        try:
            data = self.rfile.read(length)
            if len(data) != length:
                raise ValueError('불완전한 프레임')
            png, count, elapsed = self.server.worker.submit(self.server.process, data).result()
            self.reply(200, png, 'image/png', {'X-Detection-Count': count, 'X-Inference-Ms': round(elapsed), 'X-Perception-Mode': self.server.mode})
        except (ValueError, OSError) as error:
            logging.warning('Frame processing failed: %s', error)
            self.reply(422, b'{"error":"Frame or upstream service unavailable"}')
        except Exception:
            logging.exception('Inference failed')
            self.reply(503, b'{"error":"Inference unavailable"}')
        finally:
            self.server.slot.release()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=('head', 'full-body'), required=True)
    parser.add_argument('--host', default=os.environ.get('PERCEPTION_HOST', '127.0.0.1'))
    parser.add_argument('--port', type=int)
    args = parser.parse_args()
    from backends import BodyBackend, HeadBackend
    factory = HeadBackend if args.mode == 'head' else BodyBackend
    server = PerceptionServer((args.host, args.port or (8792 if args.mode == 'head' else 8791)), factory, args.mode)
    print(f'{args.mode} ready on {server.server_address}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()

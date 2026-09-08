import io
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from PIL import Image
from backends import HeadBackend


class OverlayResponse(io.BytesIO):
    headers = SimpleNamespace(get_content_type=lambda: 'image/png')


class HeadTests(unittest.TestCase):
    def setUp(self):
        self.backend = HeadBackend.__new__(HeadBackend)
        self.backend.segmentation_url = 'http://localhost:8790/infer'
        self.backend.mp = SimpleNamespace(ImageFormat=SimpleNamespace(SRGB='rgb'), Image=lambda **kwargs: kwargs['data'])
        self.detected = None
        def detect(image):
            self.detected = image
            return SimpleNamespace(hand_landmarks=[])
        self.backend.landmarker = SimpleNamespace(detect=detect)
        self.frame = Image.new('RGB', (20, 30), (100, 100, 100))

    def overlay(self, size=(20, 30)):
        out = io.BytesIO()
        Image.new('RGBA', size, (200, 0, 0, 128)).save(out, format='PNG')
        return OverlayResponse(out.getvalue())

    def test_same_frame_is_segmented_and_used_for_hands(self):
        with patch('backends.urlopen', return_value=self.overlay()) as request:
            result, count = self.backend.infer(self.frame, b'original jpeg')
        self.assertEqual(request.call_args.args[0].data, b'original jpeg')
        self.assertEqual(tuple(self.detected[0, 0]), (100, 100, 100))
        self.assertEqual(count, 0)
        self.assertEqual(result.getpixel((0, 0)), (150, 50, 50))

    def test_misaligned_mask_is_rejected(self):
        with patch('backends.urlopen', return_value=self.overlay((10, 10))):
            with self.assertRaises(RuntimeError):
                self.backend.infer(self.frame, b'jpeg')
        self.assertIsNone(self.detected)

    def test_hand_joints_are_drawn_over_segmentation(self):
        self.backend.landmarker.detect = lambda _image: SimpleNamespace(hand_landmarks=[
            [SimpleNamespace(x=0.5, y=0.5) for _ in range(21)]
        ])
        with patch('backends.urlopen', return_value=self.overlay()):
            result, count = self.backend.infer(self.frame, b'jpeg')
        self.assertEqual(count, 1)
        self.assertEqual(result.getpixel((10, 14)), (255, 245, 180))

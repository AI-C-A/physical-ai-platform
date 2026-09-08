"""CUDA 전신 메시와 동일 프레임의 세그멘테이션·손 합성기."""
import io
import os
from urllib.request import Request, urlopen


class HeadBackend:
    def __init__(self):
        import mediapipe as mp
        self.mp = mp
        self.landmarker = mp.tasks.vision.HandLandmarker.create_from_options(
            mp.tasks.vision.HandLandmarkerOptions(
                base_options=mp.tasks.BaseOptions(model_asset_path=os.environ['HAND_LANDMARKER_MODEL']),
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
                num_hands=2,
            )
        )
        self.segmentation_url = os.environ.get('PERCEPTION_SEGMENTATION_URL', 'http://127.0.0.1:8790/infer')

    def infer(self, frame, jpeg):
        import numpy as np
        from PIL import Image, ImageDraw
        # 두 모델 모두 같은 JPEG를 사용한다. 다른 카메라 간 추적 상태를 공유하지 않는다.
        request = Request(self.segmentation_url, data=jpeg, headers={'Content-Type': 'image/jpeg'}, method='POST')
        with urlopen(request, timeout=20) as response:
            if response.headers.get_content_type() != 'image/png':
                raise RuntimeError('세그멘테이션 서버가 PNG를 반환하지 않았습니다.')
            overlay = Image.open(io.BytesIO(response.read(8 * 1024 * 1024))).convert('RGBA')
        if overlay.size != frame.size:
            raise RuntimeError('세그멘테이션 마스크와 입력 프레임의 크기가 다릅니다.')
        result = self.landmarker.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.asarray(frame)))
        output = Image.alpha_composite(frame.convert('RGBA'), overlay)
        draw = ImageDraw.Draw(output)
        for hand in result.hand_landmarks:
            points = [(round(p.x * (frame.width - 1)), round(p.y * (frame.height - 1))) for p in hand]
            for chain in ((0, 1, 2, 3, 4), (0, 5, 6, 7, 8), (5, 9, 10, 11, 12), (9, 13, 14, 15, 16), (13, 17, 18, 19, 20), (0, 17)):
                draw.line([points[i] for i in chain], fill=(60, 240, 200, 255), width=3)
            for x, y in points:
                draw.ellipse((x-3, y-3, x+3, y+3), fill=(255, 245, 180, 255))
        return output.convert('RGB'), len(result.hand_landmarks)

    def close(self):
        self.landmarker.close()


class BodyBackend:
    def __init__(self):
        # EGL과 모델은 HTTP handler가 아닌 고정 worker thread에서 생성·사용한다.
        os.environ.setdefault('PYOPENGL_PLATFORM', 'egl')
        import torch
        if not torch.cuda.is_available():
            raise RuntimeError('4D Humans 서버에는 CUDA GPU가 필요합니다.')
        from hmr2.models import load_hmr2, DEFAULT_CHECKPOINT
        from hmr2.utils.renderer import Renderer
        from hmr2.utils.utils_detectron2 import DefaultPredictor_Lazy
        from detectron2 import model_zoo
        self.device = os.environ.get('PERCEPTION_DEVICE', 'cuda:0')
        if not self.device.startswith('cuda'):
            raise RuntimeError('PERCEPTION_DEVICE는 CUDA 장치여야 합니다.')
        torch.cuda.set_device(self.device)
        self.model, self.config = load_hmr2(os.environ.get('HMR2_CHECKPOINT', DEFAULT_CHECKPOINT))
        self.model = self.model.to(self.device).eval()
        detector_config = model_zoo.get_config('new_baselines/mask_rcnn_regnety_4gf_dds_FPN_400ep_LSJ.py', trained=True)
        detector_config.train.device = self.device
        detector_config.model.roi_heads.box_predictor.test_score_thresh = 0.5
        detector_config.model.roi_heads.box_predictor.test_nms_thresh = 0.4
        self.detector = DefaultPredictor_Lazy(detector_config)
        self.renderer = Renderer(self.config, faces=self.model.smpl.faces)

    def infer(self, frame, _jpeg):
        import numpy as np
        import torch
        from PIL import Image
        from hmr2.datasets.vitdet_dataset import ViTDetDataset
        from hmr2.utils import recursive_to
        from hmr2.utils.renderer import cam_crop_to_full
        bgr = np.asarray(frame)[:, :, ::-1].copy()
        with torch.inference_mode():
            instances = self.detector(bgr)['instances']
            valid = (instances.pred_classes == 0) & (instances.scores > 0.5)
            # 혼잡 장면의 VRAM 사용을 제한하고 확신도가 높은 사람부터 처리한다.
            boxes = instances.pred_boxes.tensor[valid]
            order = instances.scores[valid].argsort(descending=True)[:4]
            boxes = boxes[order].cpu().numpy()
            if len(boxes) == 0:
                return Image.new('RGB', frame.size, (24, 29, 38)), 0
            dataset = ViTDetDataset(self.config, bgr, boxes)
            vertices, translations = [], []
            focal = self.config.EXTRA.FOCAL_LENGTH / self.config.MODEL.IMAGE_SIZE * max(frame.size)
            for batch in torch.utils.data.DataLoader(dataset, batch_size=1, shuffle=False, num_workers=0):
                batch = recursive_to(batch, self.device)
                prediction = self.model(batch)
                camera = cam_crop_to_full(prediction['pred_cam'], batch['box_center'].float(), batch['box_size'].float(), batch['img_size'].float(), focal)
                vertices.extend(prediction['pred_vertices'].detach().cpu().numpy())
                translations.extend(camera.detach().cpu().numpy())
            rgba = self.renderer.render_rgba_multiple(vertices, cam_t=translations,
                render_res=np.array(frame.size), focal_length=focal,
                mesh_base_color=(0.45, 0.78, 0.95), scene_bg_color=(0.094, 0.114, 0.149))
            background = np.array([24, 29, 38], dtype=np.float32) / 255
            rgb = rgba[:, :, :3] * rgba[:, :, 3:] + background * (1 - rgba[:, :, 3:])
            return Image.fromarray(np.uint8(np.clip(rgb * 255, 0, 255))), len(boxes)

    def close(self):
        pass

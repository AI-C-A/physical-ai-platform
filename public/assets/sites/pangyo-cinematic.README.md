# 판교 관제 지도

`pangyo-cinematic.glb`는 제공된 `Pangyo_cinematic.blend`의 웹용 파생본이다. 원본 Blender 파일은 변경하지 않는다.

- 기존 `pangyo-v1.glb`의 객체 이름을 기준으로 배치·좌표·경계를 유지하고 연출용 카메라·조명·추가 소품은 제외한다.
- 누락된 이미지 `1 371.png`, `foliage_backdrop.jpg`는 제외한다.
- 벽·기둥·높은 표지판의 교차 형상을 합집합으로 정리해 겹친 면의 줄무늬를 제거한다. 평면 분할을 단순화하되 윤곽을 유지한다.
- 플라스터 마감과 건축물 AO를 2048px로 베이크한다.
- 바닥은 제공된 `20260914_140614.heic`를 참고해 생성한 밝은 석재 텍스처다. 실측 스캔이 아니며 타일 60cm, 줄눈 약 2mm를 가정한다. 반복 UV와 비반복 AO UV를 분리한다.
- 유리는 알파 0.18, 거칠기 0.16의 PBR 알파 블렌딩으로 변환한다.
- 텍스처는 GLB에 포함하며 AO·거칠기는 glTF 내보내기에서 패킹한다.
- 건축물 모서리에는 원본 단위 0.6의 베벨을 적용한다. 원본은 대략 센티미터 단위이며 지도 호환을 위해 유지한다.
- 20,000개 이상의 폴리곤을 가진 고밀도 가구는 20%로 축소한다. 건축물은 평면 단순화를 사용한다.
- Cycles 조명·하늘·간접광은 재현하지 않는다. 웹 뷰어의 환경광을 사용하고 가구 재질은 glTF에서 지원하는 특성을 유지한다.

저장소 루트에서 Blender 5.2로 재생성한다.

```sh
blender --background --disable-autoexec /path/to/Pangyo_cinematic.blend \
  --python scripts/bake-pangyo-map.py -- \
  --baseline public/assets/sites/pangyo-v1.glb \
  --output public/assets/sites/pangyo-cinematic.glb \
  --work .run/pangyo-cinematic
```

작업 폴더에는 베이크 PNG, 편집용 `Pangyo_web.blend`, 베이크 보고서를 저장한다. 기존 GLB는 비교용으로 유지한다.

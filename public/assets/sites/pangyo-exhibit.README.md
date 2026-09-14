# 판교 전시 배치

`pangyo-exhibit.glb`는 `pangyo-cinematic.glb`에 기존 로봇 자산 네 개와 모니터·탁자·캐비닛 형상을 배치한 지도다. 제공된 로비 사진 두 장을 참고했으며 원본 자산은 유지한다.

정적 참고 배치이며 실시간 위치나 실측 결과가 아니다. 가구 크기와 위치는 추정값이다. 로봇의 미터 단위를 지도의 센티미터 단위로 변환해 실제 크기 비율을 유지한다. RBQ-10은 기존 기본 자세를 사용하며 사진 속 접힌 자세는 재현하지 않는다. 사륜 로봇도 기존 형상을 사용하며 사진의 적재물은 추가하지 않는다. 궤도형 자산의 저장소 파일명은 `wheeled-robot.glb`다.

저장소 루트에서 재생성한다.

```sh
blender --background --factory-startup --python scripts/compose-pangyo-exhibit.py
```

스크립트의 배치값은 Blender Z-up 좌표다. 텍스처가 포함된 GLB를 내보내고 편집용 Blender 파일·배치 보고서·미리보기를 `.run/pangyo-layout/`에 저장한다.

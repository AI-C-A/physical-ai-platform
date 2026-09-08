# Quest 손 모델

`left.glb`와 `right.glb`는 `@webxr-input-profiles/assets` 1.0.20의
`generic-hand` 모델이며 Three.js XRHandMeshModel에서 사용하는 에셋이다.

- 출처: https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/
- 저장소: https://github.com/immersive-web/webxr-input-profiles
- 라이선스: MIT. 원문은 LICENSE.md에 포함한다.

원본 메시, 법선, 스킨 가중치와 같은 부모를 갖는 WebXR 관절 25개를 보존한다.
뷰어는 무광 재질을 적용하고 수신한 관절 위치와 회전으로 모델을 갱신한다.
실행 중 외부 서버에서 에셋을 요청하지 않는다.

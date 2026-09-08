# 수집 카메라 실시간 미리보기

## 외부 WebRTC 주소로 연결

수집 콘솔의 **수집 → 시연 카메라**에서 헤드캠과 전신 카메라를 각각 연결한다. 두 영상은 독립적인 WebRTC 연결을 사용한다. 실제 영상 재생이 시작되어야 `영상 수신 중`으로 표시한다. 다른 상세 탭을 열어도 연결은 유지되고, 콘솔을 떠나거나 연결 해제를 누르면 종료한다.

두 연결 방식 모두 현재 범위는 **실시간 미리보기**다. 외부 주소는 현재 화면에서만 유지하며, 카메라 영상은 Quest Episode에 녹화·저장하거나 관절 좌표와 동기화하지 않는다. 전신 영상 연결은 전신 관절 추적을 의미하지 않는다. 실제 하드웨어로 지연을 측정하기 전에는 지연 수치를 보장하지 않는다.

## 라즈베리파이 송출

권장 구성: Raspberry Pi 카메라 → Pi의 MediaMTX → 같은 LAN의 PC 브라우저.

MediaMTX 설치 후 `mediamtx.yml`의 `paths`에 아래를 설정한다. 카메라 1대에 Pi 1대를 사용하는 경우 각 Pi에는 자기 카메라 경로만 설정하고 `rpiCameraCamID: 0`을 사용한다. 두 카메라를 한 Pi에 연결했다면 실제 카메라 번호를 확인한다.

```yaml
paths:
  head:
    source: rpiCamera
    rpiCameraCamID: 0
    rpiCameraWidth: 1280
    rpiCameraHeight: 720
    rpiCameraFPS: 30
  body:
    source: rpiCamera
    rpiCameraCamID: 1
    rpiCameraWidth: 1280
    rpiCameraHeight: 720
    rpiCameraFPS: 30
```

이는 초기 측정을 위한 해상도/FPS이며 성능 보장이 아니다. USB 카메라는 `rpiCamera` 대신 해당 장치에 맞는 FFmpeg/GStreamer 송출 구성이 필요하다.

## 브라우저 연결

1. MediaMTX 기본 구성에서는 `http://<Pi IP>:8889/head`를 열어 영상 송출을 먼저 확인한다.
2. 수집 콘솔의 헤드캠 주소에 `http://<Pi IP>:8889/head/whep`, 전신 카메라 주소에 `http://<Pi IP>:8889/body/whep`를 입력한다.
3. 각각 **카메라 연결**을 누른다. PC가 HTTPS 사이트를 사용하면 카메라 WHEP 주소도 신뢰하는 인증서가 있는 HTTPS로 제공해야 한다.
4. 연결 오류 시 주소, 서버 접근 권한, CORS와 미디어 포트의 네트워크 접근을 확인하고 **다시 연결**한다.

현재 수신기는 같은 LAN에서 접근 가능한 WHEP 서버용이다. 브라우저의 전체 ICE 후보를 모아 POST하며, TURN 인증이나 외부망 NAT 통과 설정은 제공하지 않는다. MediaMTX의 `webrtcAdditionalHosts`에는 PC에서 접근 가능한 Pi 주소를 설정하고 미디어 UDP 포트(기본 8189)를 허용한다. HTTPS 프록시만 연결해도 미디어 포트가 차단되어 있으면 영상이 나오지 않는다.

다른 origin의 서버는 콘솔 origin에 대한 CORS를 허용하고 `Location` 응답 헤더를 노출해야 한다. WHEP 서버는 SDP POST에 `201`과 세션 `Location`을 반환하고, 연결 해제 시 해당 URL의 DELETE를 지원해야 한다. 세션 URL은 WHEP 주소와 같은 origin이어야 한다. 프록시는 POST/DELETE 및 Location 헤더를 유지해야 한다. 계정 정보를 URL에 넣는 연결은 지원하지 않는다.

## 지연과 동기화 검증

- 카메라에 밀리초 타이머나 LED를 보여주고 원본과 PC 화면을 함께 촬영해 촬영부터 화면 표시까지 지연의 p50/p95를 측정한다. 네트워크 RTT를 전체 영상 지연으로 사용하지 않는다.
- 헤드캠·전신 카메라를 동시에 켠 상태에서 유선/무선, 해상도/FPS별로 비교한다. 연결 해제, 재연결, 상세 탭 전환과 콘솔 종료도 확인한다.
- 학습 데이터 저장으로 확장할 때는 각 장치의 촬영 타임스탬프, 공통 시간 기준과 시계 오차, Episode 시작·정지 ACK, 원본 전송 완료를 함께 기록해야 한다. 브라우저 도착 시간만으로 Quest와 프레임을 맞추지 않는다.

공식 참고:

- [MediaMTX Raspberry Pi 카메라](https://mediamtx.org/docs/publish/raspberry-pi-cameras)
- [MediaMTX WebRTC/WHEP](https://mediamtx.org/docs/read/webrtc)
- [MediaMTX WebRTC 연결과 코덱](https://mediamtx.org/docs/features/webrtc-specific-features)

export interface CollectionCameraConnection {
  readonly close: () => void;
}

export function cameraEndpoint(value: string, pageProtocol = location.protocol): URL {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('카메라의 전체 WebRTC 주소를 입력하세요.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new Error('계정 정보가 포함되지 않은 HTTP 또는 HTTPS 주소를 입력하세요.');
  }
  if (pageProtocol === 'https:' && url.protocol !== 'https:') {
    throw new Error('보안 페이지에서는 카메라도 HTTPS 주소로 연결하세요.');
  }
  if (!url.pathname.replace(/\/$/u, '').endsWith('/whep')) {
    throw new Error('카메라의 /whep으로 끝나는 WebRTC 주소를 입력하세요.');
  }
  return url;
}

/** LAN WHEP 수신기. ICE 후보를 모두 모아 전송하며 외부 STUN 서버를 사용하지 않는다. */
export function connectCollectionCamera(endpoint: URL, callbacks: {
  readonly onStream: (stream: MediaStream) => void;
  readonly onError: (message: string) => void;
}): CollectionCameraConnection {
  const peer = new RTCPeerConnection();
  const stream = new MediaStream();
  let closed = false;
  let resource: URL | null = null;
  let cancelGathering: (() => void) | undefined;
  const removeResource = () => {
    if (resource === null) return;
    const url = resource;
    resource = null;
    void fetch(url, { method: 'DELETE', credentials: 'omit', signal: AbortSignal.timeout(5_000), keepalive: true }).catch(() => undefined);
  };
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(deadline);
    cancelGathering?.();
    peer.ontrack = null;
    peer.onconnectionstatechange = null;
    stream.getTracks().forEach((track) => track.stop());
    peer.close();
    removeResource();
  };
  const fail = (message: string) => {
    if (closed) return;
    close();
    callbacks.onError(message);
  };
  const deadline = setTimeout(() => fail('영상 연결 시간이 초과되었습니다. 카메라 주소와 네트워크를 확인하세요.'), 20_000);
  peer.ontrack = (event) => {
    if (closed || event.track.kind !== 'video') return;
    stream.addTrack(event.track);
    if (peer.connectionState === 'connected') clearTimeout(deadline);
    event.track.onended = () => fail('카메라 영상이 종료되었습니다. 다시 연결하세요.');
    callbacks.onStream(stream);
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === 'connected' && stream.getVideoTracks().length > 0) clearTimeout(deadline);
    if (['failed', 'disconnected'].includes(peer.connectionState)) fail('카메라 연결이 끊겼습니다. 네트워크를 확인하고 다시 연결하세요.');
  };
  const start = async () => {
    peer.addTransceiver('video', { direction: 'recvonly' });
    await peer.setLocalDescription(await peer.createOffer());
    if (closed) return;
    if (peer.iceGatheringState !== 'complete') {
      await new Promise<void>((resolve) => {
        const finish = () => {
          peer.removeEventListener('icegatheringstatechange', changed);
          resolve();
        };
        const changed = () => { if (peer.iceGatheringState === 'complete') finish(); };
        cancelGathering = finish;
        peer.addEventListener('icegatheringstatechange', changed);
        changed();
      });
    }
    if (closed) return;
    const response = await fetch(endpoint, {
      method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/sdp', Accept: 'application/sdp' },
      body: peer.localDescription?.sdp ?? '', signal: AbortSignal.timeout(10_000),
    });
    const location = response.headers.get('Location');
    if (response.status === 201 && location) {
      const candidate = new URL(location, endpoint);
      if (candidate.origin !== endpoint.origin || candidate.username || candidate.password) {
        throw new Error('카메라 서버가 올바르지 않은 세션 주소를 반환했습니다.');
      }
      resource = candidate;
    }
    // POST 도중 연결을 끊었어도 서버에 뒤늦게 생성된 세션을 삭제해야 한다.
    if (closed) { removeResource(); return; }
    if (response.status !== 201 || resource === null) {
      throw new Error('카메라에 연결하지 못했습니다. WHEP 주소, 접근 권한과 CORS 설정을 확인하세요.');
    }
    const sdp = await response.text();
    if (!closed) await peer.setRemoteDescription({ type: 'answer', sdp });
  };
  void start().catch((error: unknown) => fail(error instanceof Error && error.message.startsWith('카메라')
    ? error.message : '영상을 받지 못했습니다. 카메라 서버, HTTPS 인증서와 네트워크를 확인하세요.'));
  return { close };
}

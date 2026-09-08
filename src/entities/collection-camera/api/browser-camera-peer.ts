import type { CameraSignal } from '../model/camera';
import { cameraRequest } from './camera-request';

export type CameraPeerState = 'waiting' | 'connecting' | 'connected' | 'error';
interface Options {
  readonly id: string;
  readonly token: string;
  readonly role: 'viewer' | 'sender';
  readonly stream?: MediaStream;
  readonly onStream?: (stream: MediaStream | null) => void;
  readonly onRotation?: (rotation: number) => void;
  readonly onPaired?: (paired: boolean) => void;
  readonly onState: (state: CameraPeerState, message?: string) => void;
}

function gathered(peer: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', check);
      signal.removeEventListener('abort', aborted);
      if (error) reject(error); else resolve();
    };
    const check = () => { if (peer.iceGatheringState === 'complete') finish(); };
    const aborted = () => finish(new Error('연결이 취소되었습니다.'));
    const timer = setTimeout(() => finish(new Error('네트워크 연결 정보를 모으지 못했습니다. 다시 연결하세요.')), 12_000);
    peer.addEventListener('icegatheringstatechange', check);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted(); else check();
  });
}

/** 카메라마다 연결 하나를 유지한다. HTTP는 SDP와 연결 상태만 교환하고 영상은 WebRTC로 전달한다. */
export function startCameraPeer(options: Options): { close: () => void; setRotation: (rotation: number) => void } {
  const controller = new AbortController();
  let rotation = 0;
  let orientationChannel: RTCDataChannel | null = null;
  const sendRotation = () => { if (orientationChannel?.readyState === 'open') orientationChannel.send(JSON.stringify({ rotation })); };
  let peer: RTCPeerConnection | null = null;
  let remoteStream: MediaStream | null = null;
  let revision = -1;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let peerWasOnline = false;
  const path = `/${options.id}`;
  const request = <T>(suffix = '', method = 'GET', body?: unknown) => cameraRequest<T>(`${path}${suffix}`, options.token, method, body, controller.signal);
  const clearPeer = () => {
    clearTimeout(deadline);
    if (orientationChannel) { orientationChannel.onmessage = null; orientationChannel.onopen = null; orientationChannel.close(); orientationChannel = null; }
    if (peer) { peer.ontrack = null; peer.ondatachannel = null; peer.onconnectionstatechange = null; peer.close(); peer = null; }
    remoteStream?.getTracks().forEach((track) => track.stop());
    remoteStream = null;
    options.onStream?.(null);
  };
  const notifyLeave = () => {
    void fetch(`/api/quest/cameras${path}/leave`, { method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.token}` },
      body: JSON.stringify({ revision }), signal: AbortSignal.timeout(3_000) }).catch(() => undefined);
  };
  const close = () => {
    if (controller.signal.aborted) return;
    controller.abort(); clearTimeout(timer); clearPeer(); notifyLeave();
  };
  const fail = (error: unknown) => {
    if (controller.signal.aborted) return;
    close();
    options.onState('error', error instanceof Error ? error.message : '카메라 연결에 실패했습니다. 다시 연결하세요.');
  };
  const create = (iceServers: RTCIceServer[]) => {
    clearPeer();
    const connection = new RTCPeerConnection({ iceServers });
    peer = connection;
    const bindOrientation = (channel: RTCDataChannel) => {
      if (peer !== connection || controller.signal.aborted) { channel.close(); return; }
      orientationChannel = channel;
      if (options.role === 'sender') { channel.onopen = sendRotation; sendRotation(); }
      else channel.onmessage = (event) => {
        try {
          const value = JSON.parse(String(event.data)) as { rotation?: unknown };
          if (typeof value.rotation === 'number' && [0, 90, 180, 270].includes(value.rotation)) options.onRotation?.(value.rotation);
        } catch { /* 잘못된 방향 메시지는 영상 연결에 영향을 주지 않는다. */ }
      };
    };
    if (options.role === 'viewer') bindOrientation(connection.createDataChannel('camera-orientation'));
    else connection.ondatachannel = (event) => { if (event.channel.label === 'camera-orientation') bindOrientation(event.channel); };

    options.onState('connecting');
    connection.ontrack = (event) => {
      if (peer !== connection || controller.signal.aborted || event.track.kind !== 'video') return;
      remoteStream = new MediaStream([event.track]);
      options.onStream?.(remoteStream);
    };
    connection.onconnectionstatechange = () => {
      if (peer !== connection || controller.signal.aborted) return;
      if (connection.connectionState === 'connected') { clearTimeout(deadline); options.onState('connected'); }
      else if (['failed', 'disconnected'].includes(connection.connectionState)) fail(new Error('영상 연결이 끊겼습니다. 같은 네트워크인지 확인하고 다시 연결하세요.'));
    };
    return connection;
  };
  const awaitConnection = () => {
    clearTimeout(deadline);
    if (peer?.connectionState !== 'connected') deadline = setTimeout(() => fail(new Error('영상 연결 시간이 초과되었습니다. 네트워크와 TURN 설정을 확인하세요.')), 25_000);
  };
  const poll = async () => {
    const snapshot = await request<CameraSignal>();
    if (controller.signal.aborted) return;
    options.onPaired?.(snapshot.paired);
    if (options.role === 'viewer') {
      if (snapshot.peerOnline) peerWasOnline = true;
      if (peerWasOnline && !snapshot.peerOnline) throw new Error('카메라 브라우저의 연결이 끊겼습니다. 다시 연결하세요.');
      if (peer === null || snapshot.revision !== revision) {
        const connection = create(snapshot.iceServers);
        connection.addTransceiver('video', { direction: 'recvonly' });
        await connection.setLocalDescription(await connection.createOffer());
        await gathered(connection, controller.signal);
        if (controller.signal.aborted) return;
        const result = await request<{ revision: number }>('/offer', 'POST', { sdp: connection.localDescription?.sdp });
        revision = result.revision;
        options.onState(snapshot.paired ? 'connecting' : 'waiting');
      } else if (snapshot.answer !== null && peer.remoteDescription === null) {
        await peer.setRemoteDescription(snapshot.answer);
        awaitConnection();
      }
    } else if (snapshot.offer !== null && snapshot.revision !== revision) {
      const connection = create(snapshot.iceServers);
      revision = snapshot.revision;
      for (const track of options.stream?.getVideoTracks() ?? []) connection.addTrack(track, options.stream!);
      await connection.setRemoteDescription(snapshot.offer);
      await connection.setLocalDescription(await connection.createAnswer());
      await gathered(connection, controller.signal);
      if (controller.signal.aborted) return;
      await request('/answer', 'POST', { revision, sdp: connection.localDescription?.sdp });
      awaitConnection();
    } else if (options.role === 'sender' && (snapshot.offer === null || !snapshot.peerOnline)) {
      clearPeer(); revision = -1; options.onState('waiting');
    }
  };
  const loop = () => {
    void poll().then(() => {
      if (!controller.signal.aborted) timer = setTimeout(loop, 700);
    }).catch(fail);
  };
  options.onState('waiting');
  loop();
  return { close, setRotation: (value) => { if ([0, 90, 180, 270].includes(value)) { rotation = value; sendRotation(); } } };
}

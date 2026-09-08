import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cameraEndpoint, connectCollectionCamera } from './collection-camera-connection';

class Peer extends EventTarget {
  static instances: Peer[] = [];
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription = { sdp: 'offer-with-candidates' };
  ontrack: ((event: { track: { kind: string; stop: () => void } }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  addTransceiver = vi.fn();
  createOffer = vi.fn(() => Promise.resolve(this.localDescription));
  setLocalDescription = vi.fn(() => Promise.resolve());
  setRemoteDescription = vi.fn(() => Promise.resolve());
  close = vi.fn();
  constructor() { super(); Peer.instances.push(this); }
}

describe('collection camera WHEP', () => {
  beforeEach(() => {
    Peer.instances = [];
    vi.stubGlobal('RTCPeerConnection', Peer);
    vi.stubGlobal('MediaStream', class {
      tracks: unknown[] = [];
      addTrack(track: unknown) { this.tracks.push(track); }
      getTracks() { return this.tracks; }
      getVideoTracks() { return this.tracks; }
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('blocks mixed content, embedded credentials and non-WHEP endpoints', () => {
    expect(() => cameraEndpoint('http://pi/head/whep', 'https:')).toThrow('HTTPS');
    const credentialUrl = new URL('https://pi/head/whep');
    credentialUrl.username = 'test-user';
    expect(() => cameraEndpoint(credentialUrl.href)).toThrow('계정');
    expect(() => cameraEndpoint('rtsp://pi/head')).toThrow();
    expect(() => cameraEndpoint('https://pi/head')).toThrow('/whep');
    expect(cameraEndpoint(' http://pi:8889/head/whep ', 'http:').pathname).toBe('/head/whep');
  });

  it('connects two independent video-only peers and cleans up their tracks and server sessions', async () => {
    const fetchMock = vi.fn((url: URL, init: RequestInit) => Promise.resolve(init.method === 'DELETE'
      ? new Response(null, { status: 204 })
      : new Response('answer', { status: 201, headers: { Location: `${url.pathname}/session` } })));
    vi.stubGlobal('fetch', fetchMock);
    const callbacks = { onStream: vi.fn(), onError: vi.fn() };
    const head = connectCollectionCamera(new URL('https://pi/head/whep'), callbacks);
    const body = connectCollectionCamera(new URL('https://pi/body/whep'), callbacks);
    await vi.waitFor(() => expect(Peer.instances[1]?.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer' }));
    const track = { kind: 'video', stop: vi.fn() };
    Peer.instances[0]?.ontrack?.({ track });
    expect(callbacks.onStream).toHaveBeenCalledTimes(1);
    expect(Peer.instances[0]?.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
    head.close(); head.close();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(Peer.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(Peer.instances[1]?.close).not.toHaveBeenCalled();
    body.close();
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === 'DELETE')).toHaveLength(2);
  });

  it('cleans up a session created after the user has disconnected', async () => {
    let finish: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn((_url: URL, init: RequestInit) => init.method === 'POST'
      ? new Promise<Response>((resolve) => { finish = resolve; }) : Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal('fetch', fetchMock);
    const callbacks = { onStream: vi.fn(), onError: vi.fn() };
    const connection = connectCollectionCamera(new URL('https://pi/head/whep'), callbacks);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    connection.close();
    finish(new Response('answer', { status: 201, headers: { Location: '/session/1' } }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(Peer.instances[0]?.setRemoteDescription).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('reports negotiation errors and releases the peer', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))));
    const onError = vi.fn();
    connectCollectionCamera(new URL('https://pi/head/whep'), { onStream: vi.fn(), onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(Peer.instances[0]?.close).toHaveBeenCalledOnce();
  });

  it('times out ICE gathering without issuing a stale request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    connectCollectionCamera(new URL('https://pi/head/whep'), { onStream: vi.fn(), onError });
    Peer.instances[0]!.iceGatheringState = 'gathering';
    await vi.advanceTimersByTimeAsync(20_001);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('초과'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Peer.instances[0]?.close).toHaveBeenCalledOnce();
  });
});

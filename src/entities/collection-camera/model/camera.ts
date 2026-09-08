export type CameraRole = 'head' | 'full-body';
export const cameraRoleLabel = (role: CameraRole): string => role === 'head' ? 'Head · 헤드캠' : 'Full body · 전신';
export interface CameraBinding {
  readonly id: string;
  readonly collectionId: string;
  readonly label: string;
  readonly role: CameraRole;
  readonly viewerToken: string;
  readonly pairingCode: string | null;
  readonly pairingExpiresAtMs: number;
  readonly paired: boolean;
}
export interface CameraSender {
  readonly id: string;
  readonly label: string;
  readonly role: CameraRole;
  readonly senderToken: string;
}
export interface CameraSignal {
  readonly id: string;
  readonly revision: number;
  readonly paired: boolean;
  readonly peerOnline: boolean;
  readonly offer: RTCSessionDescriptionInit | null;
  readonly answer: RTCSessionDescriptionInit | null;
  readonly iceServers: RTCIceServer[];
}

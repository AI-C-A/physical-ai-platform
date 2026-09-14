export interface SiteMapCenter {
  readonly latitude: number;
  readonly longitude: number;
}

interface SiteDescriptorBase {
  readonly id: string;
  readonly displayName: string;
}

export interface OutdoorSiteDescriptor extends SiteDescriptorBase {
  readonly environment: 'outdoor';
  readonly mapCenter: SiteMapCenter;
}

export interface IndoorSiteDescriptor extends SiteDescriptorBase {
  readonly environment: 'indoor';
  readonly mapAlt: string;
  readonly mapUrl: string;
  readonly initialCameraTarget?: readonly [number, number, number];
  /** 실측·실시간 위치가 아닌 지도 자산 좌표계의 전시 배치다. */
  readonly robotPlacements?: readonly {
    readonly modelId: string;
    readonly position: readonly [number, number, number];
  }[];
}

export type SiteDescriptor = OutdoorSiteDescriptor | IndoorSiteDescriptor;

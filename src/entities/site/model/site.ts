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
}

export type SiteDescriptor = OutdoorSiteDescriptor | IndoorSiteDescriptor;

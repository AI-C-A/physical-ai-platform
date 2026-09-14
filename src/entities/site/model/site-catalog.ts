import type { SiteDescriptor } from './site';

export const monitoringSites = [
  {
    id: 'pangyo-outdoor-zone',
    displayName: '판교',
    environment: 'outdoor',
    mapCenter: {
      latitude: 37.39472,
      longitude: 127.11153,
    },
  },
  {
    id: 'pangyo-army-ax-hub',
    displayName: '판교 육군 AX 거점',
    environment: 'indoor',
    mapAlt: '판교 육군 AX 거점 실내 3D 지도',
    mapUrl: `${import.meta.env.BASE_URL}assets/sites/pangyo-exhibit.glb`,
    initialCameraTarget: [-500, 50, 250],
    robotPlacements: [
      { modelId: 'rbq10', position: [-280, 80, 515] },
      { modelId: 'openarm', position: [-450, 155, 120] },
      { modelId: 'four-wheel-rover', position: [-330, 38, 0] },
      { modelId: 'wheeled-robot', position: [-400, 79, -140] },
    ],
  },
] as const satisfies readonly SiteDescriptor[];

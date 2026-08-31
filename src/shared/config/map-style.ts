export type MapStyleId = 'primary' | 'secondary';

export interface MapStyleOption {
  readonly id: MapStyleId;
  readonly label: string;
  readonly styleUrl: string;
}

export const defaultMapStyleId = 'primary' satisfies MapStyleId;

/** 기본 스타일은 항상 유지하고, 선택적 스타일은 배포 URL이 있을 때만 노출한다. */
export function getAvailableMapStyles(): readonly [
  MapStyleOption,
  ...MapStyleOption[],
] {
  const primaryStyleUrl = import.meta.env.VITE_MAPBOX_STYLE_URL?.trim() ?? '';
  const secondaryStyleUrl = import.meta.env.VITE_MAPBOX_SECONDARY_STYLE_URL?.trim() ?? '';
  const styles: [MapStyleOption, ...MapStyleOption[]] = [
    {
      id: defaultMapStyleId,
      label: '기본 스타일',
      styleUrl: primaryStyleUrl,
    },
  ];

  if (secondaryStyleUrl !== '') {
    styles.push({
      id: 'secondary',
      label: '네온',
      styleUrl: secondaryStyleUrl,
    });
  }

  return styles;
}

import { Color } from 'three';

/** 미디어 좌표계의 색은 전역 light/dark 전환과 독립적인 CSS 의미 토큰이다. */
export function readCollectionVisualPalette(host: HTMLElement) {
  const style = getComputedStyle(host);
  const read = (role: string) => new Color(style.getPropertyValue(`--visual-pose-${role}`).trim());
  return {
    left: read('left'),
    right: read('right'),
    shell: read('shell'),
    joint: read('joint'),
    gridMajor: read('grid-major'),
    gridMinor: read('grid-minor'),
    light: read('light'),
    groundLight: read('ground-light'),
  };
}

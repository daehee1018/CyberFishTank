import { useId } from 'react';
import type { FishRgb } from '../types/preferences';

// Tint the sprite's luminance while keeping its shading and transparent outline.
// null retains the original image, including any previously saved hue setting.
export function useFishColorFilter(color: FishRgb | null, hue: number) {
  const id = `fish-rgb-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const values = color ? [color.r, color.g, color.b].map(channel => {
    const factor = channel / 255;
    return `${0.2126 * factor} ${0.7152 * factor} ${0.0722 * factor} 0 0`;
  }).concat('0 0 0 1 0').join(' ') : '';
  return {
    colorFilter: color ? `url(#${id})` : `hue-rotate(${hue}deg)`,
    colorFilterDefinition: color ? (
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <defs><filter id={id} colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values={values} /></filter></defs>
      </svg>
    ) : null,
  };
}

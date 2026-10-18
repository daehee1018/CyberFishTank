import type { AquariumDecoration } from '../context/AppContext';

export type DecorationLayer = 'back' | 'middle' | 'front';
export const LAYER_LABELS: Record<DecorationLayer, string> = { back: '뒤쪽', middle: '중간', front: '앞쪽' };
export const decorationLayer = (item: AquariumDecoration): DecorationLayer => item.layer ?? 'back';

export function changeDecorationLayer(items: AquariumDecoration[], id: string, layer: DecorationLayer) {
  const item = items.find(value => value.id === id);
  if (!item || decorationLayer(item) === layer) return items;
  // The last item is foremost within its layer. Preserve all other relative order.
  return [...items.filter(value => value.id !== id), { ...item, layer }];
}

export function moveDecoration(items: AquariumDecoration[], id: string, direction: -1 | 1) {
  const index = items.findIndex(value => value.id === id);
  if (index < 0) return items;
  const layer = decorationLayer(items[index]);
  let neighbor = index + direction;
  while (neighbor >= 0 && neighbor < items.length && decorationLayer(items[neighbor]) !== layer) neighbor += direction;
  if (neighbor < 0 || neighbor >= items.length) return items;
  const result = [...items];
  [result[index], result[neighbor]] = [result[neighbor], result[index]];
  return result;
}

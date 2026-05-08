import type { MarbleColor } from '@mercury/shared';

const GUEST_SLOT: Record<MarbleColor, number> = {
  red: 1,
  green: 2,
  blue: 3,
  orange: 4,
};

export function generateGuestName(color: MarbleColor): string {
  return `Guest #${GUEST_SLOT[color]}`;
}

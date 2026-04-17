import * as React from 'react';

/**
 * When `current` is true, {@link usePOSRealtime} skips polling and broadcast-driven refreshes
 * so POS table column drag/resize stays smooth (no full data refetch re-renders mid-gesture).
 */
export const PosColumnResizeSuspendContext = React.createContext<React.MutableRefObject<boolean> | null>(
  null
);

export function usePosColumnResizeSuspendRef(): React.MutableRefObject<boolean> | null {
  return React.useContext(PosColumnResizeSuspendContext);
}

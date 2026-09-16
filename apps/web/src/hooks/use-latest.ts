'use client';

import { useEffect, useRef } from 'react';

/** A ref that always holds the latest value - lets an effect call the newest
 * callback without re-running every time the callback's identity changes. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

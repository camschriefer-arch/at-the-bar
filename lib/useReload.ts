import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Runs `load` whenever a screen becomes visible: on navigation focus, and
 * again whenever the app itself returns from the background.
 *
 * Coming back from the background is not a navigation, so a screen left open
 * overnight keeps rendering yesterday's data — a friend still standing in a
 * bar they left, or an unanswered venue prompt that never appears — until the
 * user pulls to refresh or navigates away and back.
 *
 * `on` reloads again whenever its value changes, for arrivals that are not
 * navigations either: a tapped notification routed to the screen already in
 * front of the user.
 */
export function useReload(load: () => void | Promise<void>, on?: string | null): void {
  const latest = useRef(load);
  latest.current = load;

  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void latest.current();

      return () => {
        focused.current = false;
      };
    }, [on])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && focused.current) void latest.current();
    });

    return () => subscription.remove();
  }, []);
}

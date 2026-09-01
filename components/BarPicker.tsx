import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from './Field';
import { searchBarsByName } from '../lib/barCache';
import { formatBarSubtitle, rankBarSuggestions, type BarSuggestion } from '../lib/barSearch';
import { distanceMeters, type LatLng } from '../lib/geo';
import { colors, spacing } from '../lib/theme';
import type { Bar } from '../lib/types';

const SEARCH_DEBOUNCE_MS = 250;
const SUGGESTION_LIMIT = 6;

type BarPickerProps = {
  nearby: readonly Bar[];
  origin: LatLng | null;
  bar: Bar | null;
  name: string;
  onChange: (next: { bar: Bar | null; name: string }) => void;
};

export function BarPicker({ nearby, origin, bar, name, onChange }: BarPickerProps) {
  const [remote, setRemote] = useState<{ query: string; bars: Bar[] }>({ query: '', bars: [] });
  const [searching, setSearching] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const query = name.trim();

  useEffect(() => {
    if (bar || query.length < 2) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      // A failed search still leaves the nearby matches and free text usable.
      searchBarsByName(query)
        .then((bars) => {
          if (!cancelled) setRemote({ query, bars });
        })
        .catch(() => {
          if (!cancelled) setRemote({ query, bars: [] });
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bar, query]);

  const nearbySuggestions = useMemo<BarSuggestion[]>(
    () =>
      nearby.map((option) => ({
        bar: option,
        distanceMeters: origin ? distanceMeters(origin, option) : null,
      })),
    [nearby, origin]
  );

  const remoteMatches = remote.query === query ? remote.bars : [];
  const suggestions = bar
    ? []
    : rankBarSuggestions(query, nearbySuggestions, remoteMatches, SUGGESTION_LIMIT);
  const showSuggestions = !dismissed && suggestions.length > 0;

  return (
    <View style={styles.wrapper}>
      <Field
        label="Bar"
        value={bar?.name ?? name}
        onChangeText={(next) => {
          setDismissed(false);
          onChange({ bar: null, name: next });
        }}
        onFocus={() => setDismissed(false)}
        placeholder="Start typing a bar name"
        autoCorrect={false}
      />

      {bar ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a different bar"
          onPress={() => onChange({ bar: null, name: '' })}>
          <Text style={styles.change}>Change bar</Text>
        </Pressable>
      ) : null}

      {showSuggestions ? (
        <View style={styles.list}>
          {suggestions.map((suggestion) => {
            const subtitle = formatBarSubtitle(suggestion);
            return (
              <Pressable
                key={suggestion.bar.id}
                accessibilityRole="button"
                style={styles.row}
                onPress={() => {
                  setDismissed(true);
                  onChange({ bar: suggestion.bar, name: suggestion.bar.name });
                }}>
                <Text style={styles.name}>{suggestion.bar.name}</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </Pressable>
            );
          })}
          {searching ? <ActivityIndicator color={colors.muted} style={styles.spinner} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  name: {
    color: colors.text,
    fontSize: 16,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  change: {
    color: colors.accent,
    fontSize: 14,
  },
  spinner: {
    paddingVertical: spacing.sm,
  },
});

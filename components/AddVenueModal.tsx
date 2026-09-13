import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Field } from './Field';
import { addVenue } from '../lib/barCache';
import { getCurrentPoint } from '../lib/locationService';
import { colors, spacing } from '../lib/theme';
import type { Bar, VenueCategory } from '../lib/types';

const CATEGORIES: { value: VenueCategory; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'pub', label: 'Pub' },
  { value: 'restaurant', label: 'Restaurant' },
];

type AddVenueModalProps = {
  visible: boolean;
  onClose: () => void;
  onAdded: (bar: Bar) => void;
};

/**
 * Adds the venue the user is standing in. The catalog misses places — a venue
 * with no category in Overture is skipped by the importer — and the position
 * used is the one already being read for check-in, so nothing new is collected.
 */
export function AddVenueModal({ visible, onClose, onAdded }: AddVenueModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<VenueCategory>('bar');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName('');
    setCategory('bar');
    setError(null);
    onClose();
  };

  const save = async () => {
    if (name.trim().length < 2) {
      setError('Give the place its name.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const point = await getCurrentPoint();
      onAdded(await addVenue(name.trim(), point, category));
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add that venue');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Add this place</Text>
        <Text style={styles.muted}>
          We will put it on the map where you are standing, so you and anyone else can check in
          here from now on.
        </Text>

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Buttermilk & Bourbon"
          autoCorrect={false}
        />

        <View style={styles.choices}>
          {CATEGORIES.map((choice) => (
            <Pressable
              key={choice.value}
              accessibilityRole="button"
              accessibilityState={{ selected: category === choice.value }}
              style={[styles.choice, category === choice.value && styles.chosen]}
              onPress={() => setCategory(choice.value)}>
              <Text style={category === choice.value ? styles.chosenLabel : styles.choiceLabel}>
                {choice.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Add and check in" onPress={() => void save()} loading={busy} />
        <Button title="Cancel" variant="secondary" disabled={busy} onPress={close} />
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingTop: spacing.xl + spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  choices: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  choice: {
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chosen: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  choiceLabel: {
    color: colors.text,
  },
  chosenLabel: {
    color: colors.background,
    fontWeight: '700',
  },
  muted: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
  },
});

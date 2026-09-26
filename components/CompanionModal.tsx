import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { friendsAtBar, setVisitCompanions } from '../lib/companions';
import { colors, spacing } from '../lib/theme';
import type { PublicProfile } from '../lib/types';

type CompanionModalProps = {
  /** The visit being described; null keeps the modal closed. */
  visitId: string | null;
  barId: string | null;
  barName: string | null;
  /** Who is already named on the visit, so reopening it starts from there. */
  chosen?: readonly string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

/**
 * "Are you with any of these people?" — the friends already checked in at the
 * same venue, ticked off. Naming someone asks them first, so nothing shows on
 * anyone else's feed until they say yes.
 */
export function CompanionModal({
  visitId,
  barId,
  barName,
  chosen,
  onClose,
  onSaved,
}: CompanionModalProps) {
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!barId) return;
    let stale = false;

    setLoading(true);
    setPicked(chosen ? [...chosen] : []);

    friendsAtBar(barId)
      .then((here) => {
        if (stale) return;
        setPeople(here);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (stale) return;
        setError(cause instanceof Error ? cause.message : 'Could not see who else is here');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });

    return () => {
      stale = true;
    };
    // `chosen` is the starting state, read once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barId, visitId]);

  const toggle = (friendId: string) => {
    setPicked((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
  };

  const save = async () => {
    if (!visitId) return;
    setBusy(true);
    setError(null);
    try {
      await setVisitCompanions(visitId, picked);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save who you are with');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visitId !== null} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Are you with any of these people?</Text>
        <Text style={styles.muted}>
          {barName
            ? `Friends checked in at ${barName} right now.`
            : 'Friends checked in here right now.'}{' '}
          They are asked before their name shows on your check-in.
        </Text>

        {loading ? (
          <Text style={styles.muted}>Looking…</Text>
        ) : people.length === 0 ? (
          <Text style={styles.muted}>Nobody else from your friends is checked in here.</Text>
        ) : (
          <View style={styles.list}>
            {people.map((person) => {
              const ticked = picked.includes(person.id);
              return (
                <Pressable
                  key={person.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ticked }}
                  style={[styles.row, ticked && styles.rowChosen]}
                  onPress={() => toggle(person.id)}>
                  <Text style={styles.name}>{person.display_name}</Text>
                  <Text style={ticked ? styles.tick : styles.muted}>
                    {ticked ? '✓' : 'With them'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {people.length > 0 ? (
          <Button title="Save" onPress={() => void save()} loading={busy} />
        ) : null}
        <Button
          title={people.length > 0 ? 'Not with anyone' : 'Close'}
          variant="secondary"
          disabled={busy}
          onPress={onClose}
        />
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
  list: {
    gap: spacing.sm,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  rowChosen: {
    borderColor: colors.accent,
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  tick: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  muted: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
  },
});

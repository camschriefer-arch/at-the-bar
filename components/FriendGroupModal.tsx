import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { Field } from './Field';
import {
  createFriendGroup,
  deleteFriendGroup,
  renameFriendGroup,
  setGroupMembership,
} from '../lib/friendGroups';
import { colors, spacing } from '../lib/theme';
import type { FriendFeedRow, FriendGroup } from '../lib/types';

type FriendGroupModalProps = {
  group: FriendGroup | null;
  friends: FriendFeedRow[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

/**
 * Names a group and ticks the friends in it. Groups are private, so nothing
 * here is visible to the people being sorted.
 */
export function FriendGroupModal({
  group,
  friends,
  onClose,
  onSaved,
}: FriendGroupModalProps) {
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState<string[]>(group?.member_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (friendId: string) => {
    setMembers((current) =>
      current.includes(friendId)
        ? current.filter((id) => id !== friendId)
        : [...current, friendId]
    );
  };

  const save = async () => {
    const clean = name.trim();
    if (clean.length === 0) {
      setError('Give the group a name.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (group) {
        if (clean !== group.name) await renameFriendGroup(group.group_id, clean);
        const added = members.filter((id) => !group.member_ids.includes(id));
        const removed = group.member_ids.filter((id) => !members.includes(id));
        for (const id of added) await setGroupMembership(group.group_id, id, true);
        for (const id of removed) await setGroupMembership(group.group_id, id, false);
      } else {
        const groupId = await createFriendGroup(clean);
        for (const id of members) await setGroupMembership(groupId, id, true);
      }
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that group');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!group) return;
    setBusy(true);
    try {
      await deleteFriendGroup(group.group_id);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete that group');
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = () => {
    if (!group) return;
    Alert.alert(
      `Delete ${group.name}?`,
      'The people in it stay your friends, they just stop being grouped.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void remove() },
      ]
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{group ? 'Edit group' : 'New group'}</Text>
        <Text style={styles.muted}>
          Only you see your groups. Nobody is told which one they are in.
        </Text>

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="College"
          autoCorrect={false}
        />

        {group ? (
          <View style={styles.list}>
            <Text style={styles.sectionTitle}>Who is in it</Text>
            {friends.length === 0 ? (
              <Text style={styles.muted}>Add a friend first and they will show up here.</Text>
            ) : null}
            {friends.map((friend) => {
              const chosen = members.includes(friend.friend_id);
              return (
                <Pressable
                  key={friend.friend_id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: chosen }}
                  style={[styles.row, chosen && styles.rowChosen]}
                  onPress={() => toggle(friend.friend_id)}>
                  <Text style={styles.name}>{friend.display_name}</Text>
                  <Text style={chosen ? styles.tick : styles.muted}>{chosen ? '✓' : 'Add'}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.muted}>You can add people to it once it exists.</Text>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Save" onPress={() => void save()} loading={busy} />
        <Button title="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
        {group ? (
          <Button title="Delete group" variant="secondary" disabled={busy} onPress={confirmRemove} />
        ) : null}
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
  sectionTitle: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
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

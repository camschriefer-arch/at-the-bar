import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { DrinkGallery } from '../../components/DrinkGallery';
import { UploadDrinkModal } from '../../components/UploadDrinkModal';
import { fetchMyProfile, fetchMyStatus } from '../../lib/api';
import { useAuth } from '../../lib/AuthProvider';
import {
  getPermissionLevel,
  getCurrentPoint,
  requestLocationPermissions,
  startBackgroundUpdates,
  stopBackgroundUpdates,
  type PermissionLevel,
} from '../../lib/locationService';
import {
  deleteDrinkPost,
  fetchDrinkPosts,
  pickPhoto,
  setAvatar,
  signedAvatarUrl,
  signedDrinkUrls,
} from '../../lib/photos';
import { clearStatus, syncStatusForLocation } from '../../lib/statusSync';
import { colors, spacing } from '../../lib/theme';
import type { Bar, DrinkPost, Profile } from '../../lib/types';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const userId = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [bar, setBar] = useState<Bar | null>(null);
  const [permission, setPermission] = useState<PermissionLevel>('denied');
  const [posts, setPosts] = useState<DrinkPost[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [me, status, level, drinks] = await Promise.all([
        fetchMyProfile(userId),
        fetchMyStatus(userId),
        getPermissionLevel(),
        fetchDrinkPosts(userId),
      ]);
      setProfile(me);
      setBar(status.bar);
      setPermission(level);
      setPosts(drinks);
      const [avatar, urls] = await Promise.all([
        signedAvatarUrl(me.avatar_url),
        signedDrinkUrls(drinks),
      ]);
      setAvatarUrl(avatar);
      setPhotoUrls(urls);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your profile');
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const enableSharing = async () => {
    setBusy(true);
    setError(null);
    try {
      const level = await requestLocationPermissions();
      setPermission(level);

      if (level === 'denied') {
        setError('Location permission is required to set your status.');
        return;
      }

      if (level === 'background') await startBackgroundUpdates();

      const point = await getCurrentPoint();
      const result = await syncStatusForLocation(point);
      setBar(result.bar);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not enable sharing');
    } finally {
      setBusy(false);
    }
  };

  const goOffline = async () => {
    setBusy(true);
    setError(null);
    try {
      await stopBackgroundUpdates();
      await clearStatus();
      setBar(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not go offline');
    } finally {
      setBusy(false);
    }
  };

  const changeAvatar = async () => {
    if (!userId) return;
    setError(null);
    try {
      const photo = await pickPhoto([1, 1]);
      if (!photo) return;
      const path = await setAvatar(userId, photo);
      setAvatarUrl(await signedAvatarUrl(path));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update your photo');
    }
  };

  const removePost = async (post: DrinkPost) => {
    setError(null);
    try {
      await deleteDrinkPost(post);
      setPosts((current) => current.filter((row) => row.id !== post.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete that photo');
    }
  };

  const addPost = (post: DrinkPost) => {
    setPosts((current) => [post, ...current]);
    void signedDrinkUrls([post]).then((urls) =>
      setPhotoUrls((current) => ({ ...current, ...urls }))
    );
  };

  const refreshStatus = async () => {
    setBusy(true);
    setError(null);
    try {
      const point = await getCurrentPoint();
      const result = await syncStatusForLocation(point);
      setBar(result.bar);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check your location');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change your profile photo"
          onPress={() => void changeAvatar()}>
          <Avatar uri={avatarUrl} name={profile?.display_name ?? ''} />
          <Text style={styles.avatarHint}>Edit</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.name}>{profile?.display_name ?? '…'}</Text>
          <Text style={styles.muted}>{profile?.email}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Your status</Text>
        {bar ? (
          <>
            <Text style={styles.status}>At the bar</Text>
            <Text style={styles.barName}>{bar.name}</Text>
            <Text style={styles.muted}>{[bar.city, bar.state].filter(Boolean).join(', ')}</Text>
          </>
        ) : (
          <Text style={styles.muted}>Not at a bar. Friends see nothing.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Location sharing</Text>
        <Text style={styles.muted}>
          {permission === 'background'
            ? 'On, including in the background.'
            : permission === 'foreground'
              ? 'On while the app is open. Allow "Always" to update in the background.'
              : 'Off. Friends cannot see when you are out.'}
        </Text>
        <Text style={styles.fineprint}>
          Your coordinates stay on your phone. Only the bar you are at is stored, and only friends
          you accepted can see it.
        </Text>
        <View style={styles.actions}>
          <Button
            title={permission === 'denied' ? 'Enable sharing' : 'Check in now'}
            onPress={permission === 'denied' ? enableSharing : refreshStatus}
            loading={busy}
          />
          <Button title="Go offline" variant="secondary" onPress={goOffline} disabled={busy} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Your drinks</Text>
        <DrinkGallery
          posts={posts}
          urls={photoUrls}
          emptyLabel="No drinks yet. Post the best beer you have had."
          onDelete={(post) => void removePost(post)}
        />
        <Button title="Upload your drinks" onPress={() => setUploading(true)} />
      </View>

      {userId ? (
        <UploadDrinkModal
          visible={uploading}
          userId={userId}
          onClose={() => setUploading(false)}
          onSaved={addPost}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerText: {
    flexShrink: 1,
    gap: spacing.xs,
  },
  avatarHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  status: {
    color: colors.text,
    fontSize: 16,
  },
  barName: {
    color: colors.accent,
    fontSize: 20,
    fontWeight: '600',
  },
  muted: {
    color: colors.muted,
  },
  fineprint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  error: {
    color: colors.danger,
  },
});

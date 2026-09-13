import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { flushPendingNotifications } from './notifications';
import { supabase } from './supabase';
import type { DrinkPost, DrinkPostDraft } from './types';

const AVATAR_BUCKET = 'avatars';
const DRINK_BUCKET = 'drinks';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type Bucket = typeof AVATAR_BUCKET | typeof DRINK_BUCKET;

export type PickedPhoto = { uri: string; mimeType: string };

/**
 * Opens the system photo library. Returns null when the user backs out or
 * denies access, which the screens treat as "nothing happened".
 */
export async function pickPhoto(aspect: [number, number]): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.7,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/**
 * Opens the camera. Returns null when the user backs out or denies access,
 * which the screens treat as "nothing happened".
 */
export async function capturePhoto(aspect: [number, number]): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.7,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' };
}

/** Asks whether the photo should come from the camera or the library. */
export function choosePhoto(aspect: [number, number]): Promise<PickedPhoto | null> {
  return new Promise((resolve) => {
    Alert.alert(
      'Add a photo',
      undefined,
      [
        { text: 'Take photo', onPress: () => resolve(capturePhoto(aspect)) },
        { text: 'Choose from library', onPress: () => resolve(pickPhoto(aspect)) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ],
      { onDismiss: () => resolve(null) }
    );
  });
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Uploads to `<user id>/<name>`, the layout the storage policies use to decide
 * who may read an object. Returns the object path, which is what we store.
 */
async function upload(bucket: Bucket, userId: string, photo: PickedPhoto): Promise<string> {
  const path = `${userId}/${Date.now()}.${extensionFor(photo.mimeType)}`;
  const bytes = await new File(photo.uri).bytes();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: photo.mimeType, upsert: false });

  if (error) throw error;
  return path;
}

/** Private buckets, so every rendered image needs a short-lived signed URL. */
export async function signedUrl(bucket: Bucket, path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error) throw error;
  return data.signedUrl;
}

export async function signedAvatarUrl(path: string | null): Promise<string | null> {
  return path ? signedUrl(AVATAR_BUCKET, path) : null;
}

export async function signedDrinkUrls(posts: DrinkPost[]): Promise<Record<string, string>> {
  if (posts.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(DRINK_BUCKET)
    .createSignedUrls(
      posts.map((post) => post.image_path),
      SIGNED_URL_TTL_SECONDS
    );

  if (error) throw error;

  const urls: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) urls[entry.path] = entry.signedUrl;
  }
  return urls;
}

export async function setAvatar(userId: string, photo: PickedPhoto): Promise<string> {
  const previous = await currentAvatarPath(userId);
  const path = await upload(AVATAR_BUCKET, userId, photo);

  const { error } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', userId);
  if (error) throw error;

  if (previous) await supabase.storage.from(AVATAR_BUCKET).remove([previous]);
  return path;
}

async function currentAvatarPath(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return (data as { avatar_url: string | null }).avatar_url;
}

export async function fetchDrinkPosts(userId: string): Promise<DrinkPost[]> {
  const { data, error } = await supabase.rpc('drink_posts_for', { p_user_id: userId });
  if (error) throw error;
  return (data ?? []) as DrinkPost[];
}

export async function createDrinkPost(
  userId: string,
  photo: PickedPhoto,
  draft: DrinkPostDraft
): Promise<DrinkPost> {
  const imagePath = await upload(DRINK_BUCKET, userId, photo);

  const { data, error } = await supabase
    .from('drink_posts')
    .insert({
      user_id: userId,
      bar_id: draft.barId,
      bar_name: draft.barName,
      beer_name: draft.beerName,
      description: draft.description || null,
      rating: draft.rating,
      image_path: imagePath,
    })
    .select()
    .single();

  if (error) {
    // Nothing references the object once the row is gone, so don't leave it behind.
    await supabase.storage.from(DRINK_BUCKET).remove([imagePath]);
    throw error;
  }

  // The trigger has queued a push for every friend who has not muted you; this
  // only saves them waiting for the next cron sweep.
  await flushPendingNotifications();

  return data as DrinkPost;
}

export async function deleteDrinkPost(post: DrinkPost): Promise<void> {
  const { error } = await supabase.from('drink_posts').delete().eq('id', post.id);
  if (error) throw error;
  await supabase.storage.from(DRINK_BUCKET).remove([post.image_path]);
}

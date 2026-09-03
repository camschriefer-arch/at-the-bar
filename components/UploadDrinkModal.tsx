import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarPicker } from './BarPicker';
import { Button } from './Button';
import { Field } from './Field';
import { Stars } from './Stars';
import { barsNear } from '../lib/barCache';
import type { LatLng } from '../lib/geo';
import { getCurrentPoint } from '../lib/locationService';
import { createDrinkPost, pickPhoto, type PickedPhoto } from '../lib/photos';
import { colors, spacing } from '../lib/theme';
import type { Bar, DrinkPost } from '../lib/types';

const NEARBY_LIMIT = 40;

type UploadDrinkModalProps = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSaved: (post: DrinkPost) => void;
};

export function UploadDrinkModal({ visible, userId, onClose, onSaved }: UploadDrinkModalProps) {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [nearby, setNearby] = useState<Bar[]>([]);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [bar, setBar] = useState<Bar | null>(null);
  const [barName, setBarName] = useState('');
  const [beerName, setBeerName] = useState('');
  const [description, setDescription] = useState('');
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhoto(null);
    setBar(null);
    setBarName('');
    setBeerName('');
    setDescription('');
    setRating(0);
    setError(null);
  }, []);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    // Best effort: without location permission the picker falls back to
    // catalog-wide name search.
    getCurrentPoint()
      .then(async (point) => ({ point, bars: await barsNear(point) }))
      .then(({ point, bars }) => {
        if (cancelled) return;
        setOrigin(point);
        setNearby(bars.slice(0, NEARBY_LIMIT));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const choosePhoto = async () => {
    setError(null);
    const picked = await pickPhoto([3, 4]);
    if (picked) setPhoto(picked);
    else if (!photo) setError('Photo access is needed to add a drink.');
  };

  const chosenBarName = bar?.name ?? barName.trim();

  const save = async () => {
    if (!photo) {
      setError('Pick a photo first.');
      return;
    }
    if (!chosenBarName || !beerName.trim() || rating === 0) {
      setError('Bar, drink and a rating are required.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const post = await createDrinkPost(userId, photo, {
        barId: bar?.id ?? null,
        barName: chosenBarName,
        beerName: beerName.trim(),
        description: description.trim(),
        rating,
      });
      onSaved(post);
      reset();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your drink');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Upload your drink</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a photo"
          style={styles.photoSlot}
          onPress={() => void choosePhoto()}>
          {photo ? (
            <Image source={photo.uri} style={styles.photo} contentFit="cover" />
          ) : (
            <Text style={styles.muted}>Tap to choose a photo</Text>
          )}
        </Pressable>

        <BarPicker
          nearby={nearby}
          origin={origin}
          bar={bar}
          name={barName}
          onChange={(next) => {
            setBar(next.bar);
            setBarName(next.name);
          }}
        />

        <Field
          label="Drink"
          value={beerName}
          onChangeText={setBeerName}
          placeholder="Pilsner, IPA, house lager…"
        />

        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Short note about it"
          style={styles.note}
          multiline
        />

        <View style={styles.ratingRow}>
          <Text style={styles.label}>Rating</Text>
          <Stars rating={rating} onChange={setRating} size={28} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Post it" onPress={() => void save()} loading={busy} />
        <Button
          title="Cancel"
          variant="secondary"
          disabled={busy}
          onPress={() => {
            reset();
            onClose();
          }}
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
  photoSlot: {
    alignItems: 'center',
    aspectRatio: 3 / 4,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photo: {
    height: '100%',
    width: '100%',
  },
  note: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ratingRow: {
    gap: spacing.sm,
  },
  muted: {
    color: colors.muted,
  },
  error: {
    color: colors.danger,
  },
});

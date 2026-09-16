import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "./Button";
import { REPORT_REASONS, reportPost } from "../lib/moderation";
import { colors, spacing } from "../lib/theme";

type ReportModalProps = {
  /** The post being reported, or null when nothing is. */
  postId: string | null;
  onClose: () => void;
  onReported: () => void;
};

/**
 * Its own sheet rather than an alert: Android alerts hold three buttons, so a
 * fourth reason and Cancel silently vanish there.
 */
export function ReportModal({ postId, onClose, onReported }: ReportModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const send = async (reason: string) => {
    if (!postId) return;

    setBusy(true);
    setError(null);
    try {
      await reportPost(postId, reason);
      onReported();
      close();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not report that post",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={postId !== null}
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.screen}>
        <Text style={styles.title}>Report this post</Text>
        <Text style={styles.muted}>Tell us what is wrong with it.</Text>

        {REPORT_REASONS.map((reason) => (
          <Pressable
            key={reason}
            accessibilityRole="button"
            disabled={busy}
            style={styles.reason}
            onPress={() => void send(reason)}
          >
            <Text style={styles.reasonLabel}>{reason}</Text>
          </Pressable>
        ))}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Cancel"
          variant="secondary"
          disabled={busy}
          onPress={close}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.md,
    padding: spacing.md,
    paddingTop: spacing.xl + spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "800",
  },
  muted: {
    color: colors.muted,
  },
  reason: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    padding: spacing.md,
  },
  reasonLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    color: colors.danger,
  },
});

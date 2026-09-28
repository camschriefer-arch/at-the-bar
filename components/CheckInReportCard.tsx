import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import type { CheckInReport } from '../lib/diagnosis';
import {
  describeTracking,
  describeVenue,
  formatDistance,
  summarise,
} from '../lib/diagnosisText';
import { colors, spacing } from '../lib/theme';

type CheckInReportCardProps = {
  report: CheckInReport;
  onAskAgain: () => void;
  busy?: boolean;
};

/**
 * Why no "are you here?" arrived. Everything that holds a prompt back — the
 * dwell, the two quiet periods, a background task the OS has stopped — is
 * otherwise invisible, so a user sitting in a bar that never asked has nothing
 * to go on.
 */
export function CheckInReportCard({ report, onAskAgain, busy }: CheckInReportCardProps) {
  const silenced = report.venues.some(
    (venue) => venue.verdict === 'asked-already' || venue.verdict === 'turned-down'
  );

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Why you were not asked</Text>
      <Text style={styles.summary}>{summarise(report)}</Text>
      <Text style={styles.fineprint}>{describeTracking(report)}</Text>

      {report.venues.map((venue) => (
        <View key={venue.barId} style={styles.venue}>
          <Text style={styles.name} numberOfLines={1}>
            {venue.barName} · {formatDistance(venue.meters)}
          </Text>
          <Text style={styles.muted}>{describeVenue(venue)}</Text>
        </View>
      ))}

      {silenced ? (
        <Button title="Ask me again" variant="secondary" onPress={onAskAgain} disabled={busy} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  summary: {
    color: colors.text,
  },
  fineprint: {
    color: colors.muted,
    fontSize: 12,
  },
  venue: {
    gap: 2,
  },
  name: {
    color: colors.text,
    fontWeight: '600',
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
  },
});

import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { useAuth } from '../../lib/AuthProvider';
import { colors, spacing } from '../../lib/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>At The Bar</Text>
        <Text style={styles.subtitle}>See which friends are out right now.</Text>

        <Field
          label="Email"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          value={email}
        />
        <Field
          label="Password"
          autoCapitalize="none"
          secureTextEntry
          onChangeText={setPassword}
          value={password}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Sign in" onPress={submit} loading={loading} />

        <Link href="/(auth)/sign-up" style={styles.link}>
          Need an account? Sign up
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  form: {
    gap: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  error: {
    color: colors.danger,
  },
  link: {
    color: colors.accent,
    textAlign: 'center',
  },
});

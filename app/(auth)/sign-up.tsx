import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { useAuth } from '../../lib/AuthProvider';
import { colors, spacing } from '../../lib/theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await signUp(email.trim(), password, displayName.trim());
      setNotice('Check your email to confirm your account, then sign in.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign up');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Create account</Text>

        <Field label="Name" onChangeText={setDisplayName} value={displayName} />
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
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Button title="Sign up" onPress={submit} loading={loading} />

        <Link href="/(auth)/sign-in" style={styles.link}>
          Already have an account? Sign in
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
    fontSize: 30,
    fontWeight: '800',
  },
  error: {
    color: colors.danger,
  },
  notice: {
    color: colors.accent,
  },
  link: {
    color: colors.accent,
    textAlign: 'center',
  },
});

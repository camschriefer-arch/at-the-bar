import { Tabs } from 'expo-router';

import { colors } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}>
      <Tabs.Screen name="index" options={{ title: 'Friends' }} />
      <Tabs.Screen name="invite" options={{ title: 'Invite' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}

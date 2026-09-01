import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import { colors } from '../../lib/theme';

type TabIconProps = { color: ColorValue; focused: boolean; size: number };

// Filled while the tab is open, outlined otherwise.
function FriendsIcon({ color, focused, size }: TabIconProps) {
  return <Ionicons name={focused ? 'people' : 'people-outline'} color={color} size={size} />;
}

function InviteIcon({ color, focused, size }: TabIconProps) {
  return <Ionicons name={focused ? 'mail' : 'mail-outline'} color={color} size={size} />;
}

function ProfileIcon({ color, focused, size }: TabIconProps) {
  return <Ionicons name={focused ? 'person' : 'person-outline'} color={color} size={size} />;
}

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
      <Tabs.Screen name="index" options={{ title: 'Friends', tabBarIcon: FriendsIcon }} />
      <Tabs.Screen name="invite" options={{ title: 'Invite', tabBarIcon: InviteIcon }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: ProfileIcon }} />
    </Tabs>
  );
}

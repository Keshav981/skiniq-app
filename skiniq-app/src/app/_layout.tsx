import { Slot } from 'expo-router';
import { AppProvider } from '../context/AppContext';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Slot />
      </AppProvider>
    </SafeAreaProvider>
  );
}

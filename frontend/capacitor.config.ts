import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.android.mercury',
  appName: 'Mercury',
  webDir: 'www',
  plugins: {
    GoogleSignIn: {
      clientId: '211257291077-4uhmhpvlo13ub7f03imeu2du5l3g8ndl.apps.googleusercontent.com',
      serverClientId: '211257291077-4uhmhpvlo13ub7f03imeu2du5l3g8ndl.apps.googleusercontent.com',
    },
  },
};

export default config;

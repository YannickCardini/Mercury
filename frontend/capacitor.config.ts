import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.mercury.game',
  appName: 'Mercury',
  webDir: 'www',
  plugins: {
    GoogleSignIn: {
      clientId: '211257291077-7na038050ibq2gk8m2f2oip3q39099vp.apps.googleusercontent.com',
      serverClientId: '211257291077-7na038050ibq2gk8m2f2oip3q39099vp.apps.googleusercontent.com',
    },
    SplashScreen: {
      // Gardé visible tant que AppComponent n'a pas confirmé le premier
      // rendu (voir app.component.ts) : évite de découvrir le fond spatial
      // nu avant que l'UI de la route ne soit prête.
      launchAutoHide: false,
    },
  },
};

export default config;

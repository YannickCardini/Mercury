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
    SystemBars: {
      // Android 15+ impose l'edge-to-edge (targetSdk 36) : la WebView dessine
      // sous les barres système, seul le style de leur contenu reste pilotable.
      // 'DARK' = contenu clair sur fond sombre — l'app est sombre sur toutes
      // les routes, alors que le défaut ('DEFAULT') dérive du mode nuit du
      // téléphone et donnerait des icônes sombres illisibles sur le fond spatial.
      // Déclaré ici plutôt qu'en TS : appliqué dès le démarrage natif, et
      // réappliqué automatiquement à la rotation / au changement de mode nuit.
      style: 'DARK',
    },
  },
};

export default config;

package online.mercury.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // La WebView applique par défaut le réglage « Taille de police » d'Android
        // au texte, mais pas aux boîtes dimensionnées en px (pastilles du plateau,
        // boutons, panneau du 7) : avec une grande police, le texte en déborde.
        // Texte fixé à 100 % (choix du propriétaire, 2026-10-16) ; le réglage
        // « Taille d'affichage » agrandit toujours toute l'interface d'un bloc.
        // L'activité est recréée quand la police système change (fontScale
        // n'est pas dans configChanges) : ce réglage est donc réappliqué.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}

# Guide de publication de Mercury sur le Google Play Store

Ce guide est personnalisé pour votre projet Ionic/Capacitor situé dans `frontend/`.
Identifiant de l'application : **`app.android.mercury`** — Nom : **Mercury**.

L'application sera publiée **gratuitement**, sans achats intégrés.

---

## Étape 1 — Créer le compte Google Play Console

C'est obligatoire et payant **une seule fois** (25 USD à vie).

1. Allez sur https://play.google.com/console/signup
2. Connectez-vous avec un compte Google (idéalement un compte dédié à votre activité).
3. Choisissez **"Moi-même"** (compte personnel) ou **"Une organisation"**.
   - Compte personnel : plus rapide, nécessite que vous testiez l'app pendant 14 jours avec au moins 12 testeurs avant la publication publique (politique Google depuis nov. 2023).
   - Organisation : nécessite un numéro D-U-N-S (peut prendre plusieurs jours à obtenir gratuitement). Pas d'obligation de test fermé.
4. Payez les 25 USD avec une carte bancaire.
5. Validez votre identité (passeport ou pièce d'identité + selfie).
6. La validation peut prendre **48h à plusieurs jours**.

**À noter** : si vous êtes en compte personnel, anticipez le **closed testing de 14 jours minimum avec 12 testeurs** avant de pouvoir publier en production. Vous pouvez démarrer ce test en parallèle de la préparation des assets.

---

## Étape 2 — Préparer la configuration de l'app

### 2.1 Vérifier le versionCode et versionName

Dans `frontend/android/app/build.gradle`, vous avez actuellement :
```gradle
versionCode 1
versionName "1.0"
```
C'est OK pour une première publication. Pour chaque future mise à jour : **incrémentez `versionCode`** (1 → 2 → 3…) et faites évoluer `versionName` (1.0 → 1.0.1 → 1.1…).

### 2.2 Activer la minification (recommandé pour la production)

Toujours dans `frontend/android/app/build.gradle`, dans le bloc `buildTypes.release`, remplacez :
```gradle
minifyEnabled false
```
par :
```gradle
minifyEnabled true
shrinkResources true
```
Cela réduit la taille de l'.aab et obfusque le code.

### 2.3 Vérifier le SDK cible

Google Play exige actuellement (2026) **targetSdkVersion 34 minimum** (Android 14).
Vérifiez `frontend/android/variables.gradle` :
```gradle
targetSdkVersion = 34   // ou 35
compileSdkVersion = 34  // ou 35
```

### 2.4 Synchroniser Capacitor après tout changement web

```bash
cd frontend
npm run build          # build Angular dans /www
npx cap sync android   # copie /www dans le projet Android
```

---

## Étape 3 — Générer un keystore (clé de signature)

⚠️ **Le keystore est CRITIQUE** : si vous le perdez, vous ne pourrez **plus jamais** mettre à jour votre app sur le Play Store. Sauvegardez-le dans plusieurs endroits (cloud chiffré + disque externe).

### 3.1 Commande pour générer le keystore

Depuis le dossier `frontend/android/app/` :

```bash
keytool -genkey -v \
  -keystore mercury-release.keystore \
  -alias mercury \
  -keyalg RSA -keysize 2048 -validity 10000
```

Notez **précieusement** :
- Le mot de passe du keystore
- Le mot de passe de l'alias (`mercury`)
- Le chemin du fichier `mercury-release.keystore`

### 3.2 Configurer la signature dans Gradle

Créez un fichier `frontend/android/keystore.properties` (à **ajouter au .gitignore**) :

```properties
storeFile=app/mercury-release.keystore
storePassword=VOTRE_MOT_DE_PASSE_KEYSTORE
keyAlias=mercury
keyPassword=VOTRE_MOT_DE_PASSE_ALIAS
```

Puis modifiez `frontend/android/app/build.gradle` pour lire ces propriétés et signer la version `release`. Ajoutez **avant** le bloc `android {` :

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Puis dans `android { ... }` ajoutez le bloc `signingConfigs` et référencez-le dans `buildTypes.release` :

```gradle
signingConfigs {
    release {
        if (keystorePropertiesFile.exists()) {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        shrinkResources true
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
    }
}
```

### 3.3 Ajouter au .gitignore

Dans `frontend/android/.gitignore` :
```
keystore.properties
*.keystore
*.jks
```

---

## Étape 4 — Compiler le .aab (Android App Bundle)

Google Play exige le format **.aab** (et non plus .apk).

### 4.1 Depuis le terminal

```bash
cd frontend
npm run build
npx cap sync android
cd android
./gradlew bundleRelease
```

Le fichier généré sera ici :
```
frontend/android/app/build/outputs/bundle/release/app-release.aab
```

### 4.2 Depuis Android Studio (alternative GUI)

1. Ouvrez `frontend/android/` dans Android Studio.
2. Menu **Build** → **Generate Signed Bundle / APK…**
3. Choisissez **Android App Bundle**.
4. Sélectionnez votre keystore et entrez les mots de passe.
5. Choisissez la variante `release`.

---

## Étape 5 — Préparer les assets marketing (obligatoires)

| Asset | Format | Dimensions | Notes |
|---|---|---|---|
| Icône haute résolution | PNG 32 bits (avec alpha) | **512 × 512** | Visuel principal du Play Store |
| Image de fonctionnalité (Feature graphic) | JPG ou PNG 24 bits (sans alpha) | **1024 × 500** | Bannière en haut de la fiche |
| Captures d'écran téléphone | JPG/PNG | min. 320 px, max. 3840 px (ratio 16:9 ou 9:16) | **Minimum 2, jusqu'à 8** |
| Captures d'écran tablette 7" | JPG/PNG | Idem | Optionnel mais recommandé |
| Captures d'écran tablette 10" | JPG/PNG | Idem | Optionnel mais recommandé |

**Astuce** : vous avez déjà `frontend/resources/icon.png` et `splash.png`. Vérifiez que `icon.png` est bien en 1024×1024 ou plus, puis redimensionnez-le à 512×512 pour le Play Store.

Pour les screenshots, prenez-les directement depuis votre app lancée sur un émulateur Android Studio (Pixel 6 par ex.) avec la touche capture, ou via `adb exec-out screencap -p > screen.png`.

---

## Étape 6 — Rédiger les textes de la fiche Play Store

| Champ | Longueur max | Notes |
|---|---|---|
| Nom de l'app | 30 caractères | "Mercury" (ou variante plus descriptive si déjà pris) |
| Description courte | 80 caractères | Phrase d'accroche affichée en haut |
| Description longue | 4000 caractères | Présentation complète |
| Catégorie | — | À choisir (Productivité, Jeux, Outils, etc.) |
| Email contact | — | Obligatoire et public |
| Site web | — | Optionnel mais recommandé |

⚠️ **Vérifiez la disponibilité du nom "Mercury"** : c'est un nom commun, il est probable qu'il faille le décliner (ex. "Mercury - [fonctionnalité]").

---

## Étape 7 — Politique de confidentialité (OBLIGATOIRE)

Google Play exige une URL publique vers votre politique de confidentialité **avant toute publication**, surtout que votre app utilise **Google Sign-In** (donc collecte des données personnelles : email, nom, photo de profil).

Options pour l'héberger :
- Page sur votre propre site web.
- Service gratuit : https://app-privacy-policy-generator.firebaseapp.com/
- Page GitHub Pages (gratuit).

Le contenu doit couvrir :
- Quelles données sont collectées (email, nom Google, etc.).
- Pourquoi (authentification).
- Si elles sont partagées avec des tiers.
- Comment l'utilisateur peut demander leur suppression.
- Contact pour exercer ses droits RGPD.

---

## Étape 8 — Remplir la fiche Play Store et uploader l'.aab

Dans la **Google Play Console** :

1. **Créer l'application** : "Toutes les applications" → "Créer une application".
   - Langue par défaut : Français (France) ou Anglais.
   - Type : Application.
   - **Gratuite** ✅ (irréversible : une app gratuite ne peut plus devenir payante).
2. **Configuration du tableau de bord** : compléter toutes les sections (en cocher au fur et à mesure).
3. **Fiche du Play Store** : injecter textes + assets de l'étape 5/6.
4. **Classification du contenu** : remplir le questionnaire (PEGI/IARC).
5. **Public cible et contenu** : sélectionner les tranches d'âge.
6. **Confidentialité des données** : déclarer Google Sign-In, données collectées et l'URL de politique.
7. **Versions de l'application** → **Production** (ou **Test fermé** d'abord) → **Créer une version** → uploader le `app-release.aab`.

---

## Étape 9 — Soumettre pour examen

1. Cliquer sur "Examiner la version" puis "Démarrer le déploiement en production".
2. Le délai d'examen Google est généralement de **quelques heures à 7 jours**.
3. Vous recevrez un email en cas de refus avec les raisons (souvent : politique de confidentialité manquante, permissions non justifiées, etc.).

---

## Checklist rapide avant soumission

- [ ] Compte Google Play Console créé et validé (25 USD payés)
- [ ] `keystore` généré et **sauvegardé en plusieurs endroits**
- [ ] `versionCode`, `versionName`, `targetSdkVersion` à jour
- [ ] `.aab` généré et signé en mode `release`
- [ ] Icône 512×512 + Feature graphic 1024×500
- [ ] Au moins 2 screenshots téléphone
- [ ] Description courte (80) + longue (4000) rédigées
- [ ] URL publique de politique de confidentialité
- [ ] Classification du contenu remplie
- [ ] Email de contact configuré

---

## Prochaines étapes que je peux faire pour vous

Dites-moi sur quoi vous voulez avancer en premier, je peux :
1. **Modifier directement** vos fichiers `build.gradle` pour ajouter la configuration de signature.
2. **Rédiger** la description courte + longue + politique de confidentialité (en français + anglais).
3. **Générer** un script `release.sh` qui automatise build + sync + bundle.
4. **Préparer** l'icône 512×512 à partir de votre `resources/icon.png` actuel.

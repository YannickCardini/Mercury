# keenzen

Application pour jouer à Keenzen avec ma famille.

## 🚀 Lancer l'application en local

### Prérequis

- Node.js (version LTS recommandée)
- npm (installé avec Node.js)

### Étapes

1. **Installer les dépendances** :
   ```bash
   cd app
   npm install
   ```

2. **Lancer le serveur de développement** :
   ```bash
   npm start
   ```
   L'application sera accessible à l'adresse `http://localhost:8100`

3. **Alternative avec Ionic CLI** :
   ```bash
   cd app
   ionic serve
   ```

---

## 📱 Créer et tester la version Android

### Prérequis

- JDK (Java Development Kit) 17 ou supérieur
- Android SDK (installé et configuré)
- Variables d'environnement `ANDROID_HOME` définies

### Étapes

1. **Synchroniser Capacitor** :
   ```bash
   cd app
   npx cap sync
   ```

2. **Ouvrir dans Android Studio** :
   ```bash
   npx cap open android
   ```

3. **Construire un APK de debug** :
   - Dans Android Studio : `Build > Build Bundle(s) / APK(s) > Build APK(s)`
   - L'APK sera généré dans `app/android/app/build/outputs/apk/debug/`

4. **Tester l'APK** :
   - Transférez l'APK sur votre téléphone Android
   - Activez "Sources inconnues" dans les paramètres de sécurité
   - Installez et lancez l'APK

### Commande en ligne (optionnel)

Pour construire directement via Gradle :
```bash
cd app/android
./gradlew assembleDebug
```

---

## ☁️ Déployer en production

### Déploiement Docker (Azure Container Registry + AKS)

Le projet utilise GitHub Actions pour le déploiement automatique.

1. **Configuration requise** :
   - Un Azure Container Registry (ici : `basicregistrecontainer`)
   - Un cluster AKS (ici : `KeezenCluster`)
   - Un resource group Azure (ici : `RG-Web`)

2. **Variables secrets à configurer** (dans les paramètres GitHub) :
   - `AZURE_CREDENTIALS` : Credentials de service Azure

3. **Déclencher le déploiement** :
   - Allez dans l'onglet "Actions" du repository GitHub
   - Sélectionnez le workflow "Build and Deploy"
   - Cliquez sur "Run workflow"

4. **Déploiement manuel** :
   ```bash
   # Build de l'image Docker
   docker build -t keezen:latest .

   # Connexion au registry
   docker login basicregistrecontainer.azurecr.io

   # Pousser l'image
   docker push basicregistrecontainer.azurecr.io/keezen:latest

   # Configurer kubectl
   az aks get-credentials --resource-group RG-Web --name KeezenCluster

   # Déployer
   kubectl set image deployment/keezen-deployment keezen-game=basicregistrecontainer.azurecr.io/keezen:latest
   ```

---

## 📋 Règles du jeu

Les règles du jeu Keenzen sont disponibles dans le fichier [rules.pdf](./rules.pdf).

---

## 🛠️ Structure du projet

```
keenzen/
├── app/                    # Application Ionic/Angular
│   ├── src/               # Code source
│   ├── android/           # Projet Android (Capacitor)
│   └── www/              # Build de production
├── k8s/                   # Fichiers Kubernetes
├── .github/workflows/    # CI/CD GitHub Actions
├── Dockerfile            # Configuration Docker
└── rules.pdf            # Règles du jeu
```

---

## 🔧 Technologies utilisées

- **Frontend** : Angular + Ionic
- **Mobile** : Capacitor
- **Containerisation** : Docker
- **Orchestration** : Kubernetes (AKS)
- **CI/CD** : GitHub Actions
- **Cloud** : Azure


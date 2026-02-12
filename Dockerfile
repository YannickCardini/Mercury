# Étape 1 : Build de l'application Angular
FROM node:lts-alpine as build
WORKDIR /app

# 1. Copier le package.json depuis le dossier 'app'
COPY app/package*.json ./
RUN npm install

# 2. Copier tout le reste du contenu depuis le dossier 'app'
COPY app/ .

# 3. Build l'application
RUN npm run build --prod

# Étape 2 : Serveur Nginx pour servir l'application
FROM nginx:alpine
# Copie les fichiers compilés depuis l'étape de build vers Nginx
# ATTENTION: Ionic/Angular utilise souvent 'dist/' au lieu de 'www/'
COPY --from=build /app/www /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
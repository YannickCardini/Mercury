# Étape 1 : Build de l'application Angular
FROM node:lts-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build --prod

# Étape 2 : Serveur Nginx pour servir l'application
FROM nginx:alpine
# Copie les fichiers compilés depuis l'étape de build vers Nginx
COPY --from=build /app/www /usr/share/nginx/html
# (Si ton projet Ionic utilise 'dist' au lieu de 'www', remplace /app/www par /app/dist/keezen-app)
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
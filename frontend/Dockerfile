# ==============================================================================
# DocMind Frontend Multi-Stage Production Dockerfile
# Vite React Build -> Nginx Alpine Web Server
# ==============================================================================

FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and build production assets
COPY . .
RUN npm run build

# ------------------------------------------------------------------------------
# Production Nginx Runtime Stage
# ------------------------------------------------------------------------------
FROM nginx:alpine AS production

# Copy static build output from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx proxy configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

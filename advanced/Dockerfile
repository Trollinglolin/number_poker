# syntax=docker/dockerfile:1

# ---- build: install everything, build the web app and the server bundle ----
FROM node:22-alpine AS build
WORKDIR /app

# manifests first so the dependency layer is cached until they change
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build
# keep only what the server needs at runtime (express, socket.io, zod)
RUN npm prune --omit=dev

# ---- run: a small image with the bundle, the built web app and production deps ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/web/dist web/dist

# platforms inject PORT; 3001 is the default
ENV PORT=3001
EXPOSE 3001

USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/server.mjs"]

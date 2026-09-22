FROM node:24-alpine AS dependencies
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/package.json ./
COPY --chown=node:node backend/app ./app
COPY --chown=node:node db /db
USER node
EXPOSE 8000
CMD ["node", "app/server.js"]

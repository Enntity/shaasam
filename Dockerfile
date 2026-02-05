# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
ARG MONGODB_URI=mongodb://127.0.0.1:27017/shaasam
ARG MONGO_URI=mongodb://127.0.0.1:27017/shaasam
ARG AUTH_SECRET=build-secret
ARG SHAASAM_API_KEY=build-api-key
ARG SHAASAM_ADMIN_KEY=build-admin-key
ARG REQUIRE_REVIEW=false
ENV MONGODB_URI=$MONGODB_URI
ENV MONGO_URI=$MONGO_URI
ENV AUTH_SECRET=$AUTH_SECRET
ENV SHAASAM_API_KEY=$SHAASAM_API_KEY
ENV SHAASAM_ADMIN_KEY=$SHAASAM_ADMIN_KEY
ENV REQUIRE_REVIEW=$REQUIRE_REVIEW
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "start"]

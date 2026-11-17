# Stage 1: Install dependencies
FROM node:24-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build the standalone application
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy build-time variables for SSG validation
ENV NEXT_PUBLIC_API_URL=http://localhost:8000 \
    NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 3: Minimal production runner
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and standalone bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]

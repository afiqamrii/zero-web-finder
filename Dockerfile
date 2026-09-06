FROM mcr.microsoft.com/playwright:v1.49.1-jammy AS base

# Install Node.js on top of the Playwright image (it comes with Node, but we ensure the right version/env)


# 1. Install dependencies
FROM base AS deps
WORKDIR /app
# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# 2. Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install OpenSSL for Prisma in runner
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy Prisma schema and generated client
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy all required files
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Note: Playwright requires root for some dependencies when running chromium, but mcr.microsoft.com/playwright handles it.
# We will run as nextjs user for safety, but if scraping fails on Render, switch to root.
USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]

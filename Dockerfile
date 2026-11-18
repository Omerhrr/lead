# AutoGTM production image (Next.js standalone output on Bun).
# Build:  docker build -t autogtm .
# Run:    docker run -p 3000:3000 --env-file .env -v autogtm-db:/app/db autogtm

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed at runtime, but Prisma validates it during generate
ENV DATABASE_URL=file:./db/build.db
RUN bunx prisma generate && bun run build

FROM oven/bun:1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output + static assets + public files (see package.json "build")
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma client + CLI + schema for runtime queries and first-run db push
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma

# Persist the SQLite database outside the image
VOLUME ["/app/db"]
EXPOSE 3000

# Push the schema (creates the SQLite file on first run) then start the server.
CMD ["sh", "-c", "bunx prisma db push --skip-generate && bun server.js"]

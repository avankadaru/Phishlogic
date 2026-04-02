# PhishLogic Production Dockerfile
# Multi-stage build for optimized image size and security

# ============================================================================
# Stage 1: Dependencies
# ============================================================================
FROM node:22-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --production --ignore-scripts

# ============================================================================
# Stage 2: Build
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --ignore-scripts

# Copy source code
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# ============================================================================
# Stage 3: Production
# ============================================================================
FROM node:22-alpine AS production

# Install dumb-init and curl for proper signal handling and health checks
RUN apk add --no-cache dumb-init curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy SQL migration files (not compiled by TypeScript)
COPY --from=builder --chown=nodejs:nodejs /app/src/infrastructure/database/migrations ./dist/infrastructure/database/migrations

# Copy config JSON files (not compiled by TypeScript)
COPY --from=builder --chown=nodejs:nodejs /app/src/config/*.json ./dist/config/

# Copy package.json for metadata
COPY --chown=nodejs:nodejs package.json ./

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8080

# Set environment variables
ENV NODE_ENV=production \
    PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]

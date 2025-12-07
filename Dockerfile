# 1. Use a Debian-based Node image (Alpine breaks Mediasoup often)
FROM node:22.16.0-alpine AS alpine
RUN apk update
RUN apk
RUN apk add --no-cache libc6-compat

FROM alpine AS base
RUN npm install pnpm turbo --global
RUN pnpm config set store-dir ~/.pnpm-store

FROM base AS pruner

WORKDIR /app
COPY . .
RUN turbo prune --scope=@micro-frontends/meet --docker
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 3. Copy package files
COPY package*.json ./

# 4. Install dependencies (This triggers the Mediasoup C++ compilation)
RUN npm install

# 5. Copy the rest of the source code
COPY . .

# 6. Build the Next.js Client
# NOTE: Next.js needs environment variables at BUILD time. 
# We will pass them via ARG in the next step, or assume .env is present.
RUN npm run build

# We don't specify CMD here. We do that in docker-compose.
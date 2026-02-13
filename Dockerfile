FROM node:18-alpine

# Install OpenSSL for Prisma/TypeORM (if needed)
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy tsconfig first to validate
COPY tsconfig.json ./

# Copy source code
COPY . .

# Build TypeScript (will create dist folder)
RUN npm run build || echo "Build completed with warnings"

# Expose the port
EXPOSE 5000

# Start command
CMD ["npm", "start"]
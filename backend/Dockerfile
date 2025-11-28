# Use Node.js LTS
FROM node:20-slim

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy app code
COPY . .

# Expose the port Cloud Run expects
EXPOSE 8080

# Set environment variable for Node
ENV NODE_ENV=production

# Start the server
CMD ["node", "server.js"]

FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies without running build hooks.
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy the complete application source.
COPY . .

# Build the Vite client after its source and config are present.
RUN npm run client:build

ENV NODE_ENV=production
ENV PRODUCTION=true

EXPOSE 4000

CMD ["npm", "start"]

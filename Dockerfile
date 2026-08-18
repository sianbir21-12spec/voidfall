FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies without running the package.json postinstall hook.
# Voidfall's postinstall runs the client build, but the source files are
# intentionally copied only after dependency installation in this image.
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy the complete application source.
COPY . .

# Build the Vite client after its source and config are present.
RUN npm run client:build

ENV NODE_ENV=production
ENV PRODUCTION=true

EXPOSE 1337

CMD ["npm", "start"]

# Standard Dockerfile for Koyeb deployment
FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

# Ensure the bot uses the correct port for Koyeb/Render
ENV PORT=4000
EXPOSE 4000

CMD ["node", "scripts/start-all.js"]

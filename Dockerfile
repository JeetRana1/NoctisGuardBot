# Full Node image to support sharp/fonts
FROM node:20
WORKDIR /app

# Install font dependencies for sharp
RUN apt-get update && apt-get install -y fontconfig && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

# Match Koyeb's default health check port
ENV PORT=8000
EXPOSE 8000

CMD ["node", "scripts/start-all.js"]

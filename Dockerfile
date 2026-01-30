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

# Match the port picking up in your logs
ENV PORT=3000
EXPOSE 3000

CMD ["node", "scripts/start-all.js"]

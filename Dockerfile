# Use Node.js as base image
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the rest of the application
COPY . .

# Remove unnecessary windows binaries from the container to save space
RUN rm -rf backend/*.exe

# Expose the port the app runs on
EXPOSE 3001

# Command to run the application
CMD ["npm", "start"]

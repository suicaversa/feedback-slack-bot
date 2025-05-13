# Use an official Node.js runtime as a parent image (match version in package.json engines)
FROM node:18-slim

# Install ffmpeg
# Update package list and install ffmpeg, then clean up apt cache
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available) from the root directory
# This installs dependencies needed by services/, utils/, etc.
COPY package*.json ./

# Install dependencies from the root package.json
# Using --production flag to avoid installing devDependencies
RUN npm install --production --ignore-scripts

# Copy the rest of the application code from the root directory
# This includes job/, services/, utils/, config/, prompts/, etc.
COPY . .

# Command to run the job application
CMD ["node", "job/index.js"]

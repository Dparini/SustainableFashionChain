# Build from the repository root:
# docker build -f fabric/application/Dockerfile -t sfc-api .
FROM node:22
WORKDIR /app/bridging
COPY bridging/package*.json ./
RUN npm ci --omit=dev
WORKDIR /app/fabric/application
COPY fabric/application/package*.json ./
RUN npm ci --omit=dev
COPY bridging /app/bridging
COPY fabric/application /app/fabric/application
ENV API_PORT=3001
EXPOSE 3001
CMD ["npm", "start"]

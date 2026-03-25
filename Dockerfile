FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY src ./src
EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV DB_PATH=/app/data/database.sqlite
RUN mkdir -p /app/data
CMD ["npm", "start"]

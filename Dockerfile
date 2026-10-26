FROM oven/bun:1-alpine
WORKDIR /app
COPY server.js ./server.js
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "server.js"]

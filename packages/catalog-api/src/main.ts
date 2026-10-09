import { buildServer } from "./server.js";

const server = buildServer();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";

server.listen({ port, host }, (err, address) => {
  if (err) {
    console.error("Failed to start Catalog API:", err);
    process.exit(1);
  }
  console.log(`Catalog API listening at ${address}`);
});

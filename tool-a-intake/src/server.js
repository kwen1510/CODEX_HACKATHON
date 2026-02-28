import path from "node:path";
import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env"), override: false });

const { app, config } = await createApp();

app.listen(config.port, () => {
  console.log(`Tool A intake listening on http://localhost:${config.port}`);
});

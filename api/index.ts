import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";          // Change from .ts to .js
import { createContext } from "../server/_core/context"; // Add .js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

export default app;

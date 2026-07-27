import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../src/server/routers/_app"; // adjust path to your main router
import { createContext } from "../src/server/_core/context";
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
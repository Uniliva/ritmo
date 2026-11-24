import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const hasCustomDomain = existsSync(new URL("./CNAME", import.meta.url));
const base =
  !hasCustomDomain &&
  process.env.GITHUB_ACTIONS === "true" &&
  repository &&
  !repository.endsWith(".github.io")
    ? `/${repository}/`
    : "/";

export default defineConfig({
  base,
  plugins: [react()],
});

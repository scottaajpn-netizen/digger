import type { NextConfig } from "next";
const config: NextConfig = {
  // The desktop sandbox cannot spawn child processes. Normal local/Vercel builds use defaults.
  experimental: process.env.DIGGER_SANDBOX === "1" ? { workerThreads: true, cpus: 2, useTypeScriptCli: false } : {},
};
export default config;

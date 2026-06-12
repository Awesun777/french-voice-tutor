export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  openAiApiKey: process.env.OPENAI_API_KEY ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY ?? "",
  /** Set to your public domain on Railway/self-hosted (e.g. https://your-app.up.railway.app) */
  appUrl: process.env.APP_URL ?? "",
};

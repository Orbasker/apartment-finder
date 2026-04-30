import { gateway } from "@ai-sdk/gateway";

export function isGatewayConfigured(): boolean {
  return Boolean(process.env["AI_GATEWAY_API_KEY"]);
}

export function model(id: string): ReturnType<typeof gateway> {
  if (!isGatewayConfigured()) {
    throw new Error("AI_GATEWAY_API_KEY not set. Enable Vercel AI Gateway and set the key.");
  }
  return gateway(id);
}

export function textEmbeddingModel(id: string): ReturnType<typeof gateway.textEmbeddingModel> {
  if (!isGatewayConfigured()) {
    throw new Error("AI_GATEWAY_API_KEY not set. Enable Vercel AI Gateway and set the key.");
  }
  return gateway.textEmbeddingModel(id);
}

import { gateway } from "@ai-sdk/gateway";
import { env } from "@/lib/env";

export function isGatewayConfigured(): boolean {
  return Boolean(env().AI_GATEWAY_API_KEY);
}

export function model(id: string) {
  if (!isGatewayConfigured()) {
    throw new Error("AI_GATEWAY_API_KEY not set. Enable Vercel AI Gateway and set the key.");
  }
  return gateway(id);
}

export function textEmbeddingModel(id: string) {
  if (!isGatewayConfigured()) {
    throw new Error("AI_GATEWAY_API_KEY not set. Enable Vercel AI Gateway and set the key.");
  }
  return gateway.textEmbeddingModel(id);
}

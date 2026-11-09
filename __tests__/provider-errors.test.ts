import { cleanEnvValue, explainProviderFailure, ProviderError } from "@/lib/ai/reasoner";

describe("cleanEnvValue", () => {
  it("removes spaces, quotes and a Bearer prefix from a pasted key", () => {
    expect(cleanEnvValue("  gsk_abc123  ")).toBe("gsk_abc123");
    expect(cleanEnvValue('"gsk_abc123"')).toBe("gsk_abc123");
    expect(cleanEnvValue("'gsk_abc123'")).toBe("gsk_abc123");
    expect(cleanEnvValue("Bearer gsk_abc123")).toBe("gsk_abc123");
    expect(cleanEnvValue('  "Bearer gsk_abc123" ')).toBe("gsk_abc123");
    expect(cleanEnvValue("gsk_abc123\r")).toBe("gsk_abc123");
  });
  it("handles a missing value", () => {
    expect(cleanEnvValue(undefined)).toBe("");
  });
  it("leaves a normal value alone", () => {
    expect(cleanEnvValue("openai/gpt-oss-120b")).toBe("openai/gpt-oss-120b");
  });
});

describe("explainProviderFailure", () => {
  const bad = '{"error":{"message":"Invalid API Key","type":"invalid_request_error","code":"invalid_api_key"}}';

  it("explains a rejected key in plain words and never echoes the provider body", () => {
    const e = explainProviderFailure(401, bad, "openai/gpt-oss-120b");
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.status).toBe(401);
    expect(e.message).toMatch(/rejected the API key/);
    expect(e.message).toMatch(/OPENAI_COMPATIBLE_API_KEY/);
    expect(e.message).not.toMatch(/invalid_request_error/);
  });
  it("explains a retired model", () => {
    const e = explainProviderFailure(404, '{"error":{"code":"model_not_found"}}', "llama-3.3-70b-versatile");
    expect(e.message).toMatch(/llama-3\.3-70b-versatile/);
    expect(e.message).toMatch(/OPENAI_COMPATIBLE_MODEL/);
  });
  it("explains rate limits and provider outages", () => {
    expect(explainProviderFailure(429, "", "m").message).toMatch(/limiting requests/);
    expect(explainProviderFailure(503, "", "m").message).toMatch(/on its side/);
  });
});
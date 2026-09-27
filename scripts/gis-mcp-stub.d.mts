/** Types for the synthetic loopback stub; see gis-mcp-stub.mjs for behaviour and paths. */
export const STUB_DEFAULT_KEY: string;
export const STUB_OVERSIZE_BYTES: number;

export type StubRequest = { method: string | undefined; path: string; authorized: boolean; bodyBytes: number };
export type GisStub = {
  baseUrl: string;
  mcpUrl: string;
  port: number;
  key: string;
  requests: StubRequest[];
  close: () => Promise<void>;
};

export function syntheticHazards(lat: number, lon: number): Record<string, unknown>;
export function startGisStub(options?: { port?: number; host?: "127.0.0.1" | "localhost" | "::1"; key?: string }): Promise<GisStub>;

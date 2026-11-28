import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/app.config.js";
import { setTokenVerifier, type TokenVerifier } from "../src/services/firebase.js";

let testServer: ColyseusTestServer<typeof appConfig> | null = null;
let mockCounter = 0;

export const defaultMockVerifier: TokenVerifier = async (token, options) => {
  if (token === "invalid-token") {
    throw new Error("Invalid mock token");
  }

  if (token && token.startsWith("mock-token-")) {
    return {
      uid: token.replace("mock-token-", "uid-"),
      name: typeof options?.name === "string" ? options.name : undefined,
    };
  }

  // Mövcud testlərdə token ötürülmədikdə hər qoşulma üçün unikal mock UID yaradır
  mockCounter++;
  return {
    uid: `mock-uid-${mockCounter}`,
    name: typeof options?.name === "string" ? options.name : undefined,
  };
};

export function resetMockAuth(): void {
  setTokenVerifier(defaultMockVerifier);
}

export async function getTestServer(): Promise<ColyseusTestServer<typeof appConfig>> {
  if (!testServer) {
    setTokenVerifier(defaultMockVerifier);
    testServer = await boot(appConfig);
  }
  return testServer;
}

import { ColyseusTestServer, boot } from "@colyseus/testing";
import appConfig from "../src/app.config.js";

let testServer: ColyseusTestServer<typeof appConfig> | null = null;

export async function getTestServer(): Promise<ColyseusTestServer<typeof appConfig>> {
  if (!testServer) {
    testServer = await boot(appConfig);
  }
  return testServer;
}

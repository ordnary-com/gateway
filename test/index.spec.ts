import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("hostname validation", () => {
  it("rejects a nested subdomain instead of routing to its first label", async () => {
    const response = await SELF.fetch("https://a.b.ordint.dev/");

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("not a valid service address");
  });

  it("rejects a hostname outside the zone", async () => {
    const response = await SELF.fetch("https://billing.example.com/");

    expect(response.status).toBe(404);
  });

  it("rejects the apex", async () => {
    const response = await SELF.fetch("https://ordint.dev/");

    expect(response.status).toBe(404);
  });

  it("rejects a label that cannot be a service name", async () => {
    const response = await SELF.fetch("https://-billing.ordint.dev/");

    expect(response.status).toBe(404);
  });
});

/**
 * Every remaining code path in the gateway goes through the DISPATCHER binding, and
 * dispatch namespaces are not emulated by the local runtime: `env.DISPATCHER`
 * is undefined under vitest-pool-workers, so there is nothing meaningful to
 * assert without a deployed namespace behind it.
 *
 * These tests describe the contract we want and are skipped until we can back
 * them with something real.
 *
 * TODO(stijnwtf): unskip once the DispatchNamespace can be faked. The likely
 * shape is a thin interface over `get()` that tests can substitute, which also
 * removes the direct dependency on the binding in fetch().
 * TODO(stijnwtf): add a smoke test against a staging service in the namespace
 * and run it post-deploy, since the routing itself can only break in prod.
 */
describe.skip("gateway routing", () => {
  it("routes a subdomain to the matching service", async () => {
    const response = await SELF.fetch("https://billing.ordint.dev/health");

    expect(response.status).toBe(200);
  });

  it("returns 404 for a service that is not in the namespace", async () => {
    const response = await SELF.fetch("https://nonexistent.ordint.dev/");

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("does not exist");
  });

  it("forwards method, path and body unmodified", async () => {
    const response = await SELF.fetch("https://echo.ordint.dev/v1/items?page=2", {
      method: "POST",
      body: "payload",
    });

    expect(response.status).toBe(200);
  });
});

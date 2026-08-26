/**
 * Ordnary gateway.
 *
 * The front door for every service exposed on an ordint.dev subdomain. The
 * first label of the request hostname selects a user Worker from the dispatch
 * namespace, and the request is forwarded to it unmodified.
 *
 * This Worker is on the hot path for all tenant traffic, so it deliberately
 * carries no auth, no rewriting and no state. Anything that can live in the
 * downstream service, or in a Cloudflare product such as WAF or Access, belongs
 * there instead of here.
 *
 * `Env` is generated from the bindings in wrangler.jsonc; run `wrangler types`
 * after changing them.
 */

/**
 * Cloudflare reports a missing script in the dispatch namespace as a plain
 * Error carrying this text. There is no error code to switch on, so matching
 * the message is the only signal available today.
 *
 * TODO(stijnwtf): replace with a structured check once the runtime exposes one.
 * Until then an upstream wording change silently turns every 404 into a 500,
 * and we would only notice through the error rate.
 */
const WORKER_NOT_FOUND = "Worker not found";

/**
 * The zone this gateway serves. A request reaches us through the
 * `*.ordint.dev/*` route, but the route pattern also matches deeper names such
 * as `a.b.ordint.dev`, so the shape is checked here rather than assumed.
 */
const ZONE = "ordint.dev";

/** A single DNS label: what a service is allowed to be named. */
const SERVICE_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Returns the service name for a request hostname, or null when the hostname
 * is not exactly one label under the zone.
 *
 * Requiring a single label matters: `a.b.ordint.dev` would otherwise resolve to
 * the `a` service, so a typo in a nested name reaches a real service instead of
 * failing. Hostnames arrive lowercased from the URL parser.
 */
function serviceNameFor(hostname: string): string | null {
  const labels = hostname.split(".");
  const zone = labels.slice(1).join(".");

  if (labels.length !== ZONE.split(".").length + 1 || zone !== ZONE) {
    return null;
  }

  const [service] = labels;
  return SERVICE_LABEL.test(service) ? service : null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const serviceName = serviceNameFor(url.hostname);

    if (serviceName === null) {
      return new Response(`"${url.hostname}" is not a valid service address`, {
        status: 404,
      });
    }

    try {
      // TODO(stijnwtf): pass per-tenant limits to get(), so a single service
      // cannot exhaust the account CPU budget for every other tenant.
      const service = env.DISPATCHER.get(serviceName);
      return await service.fetch(request);
    } catch (e) {
      const error = e as Error;

      if (error.message?.includes(WORKER_NOT_FOUND)) {
        return new Response(`Service "${serviceName}" does not exist on ${ZONE}`, {
          status: 404,
        });
      }

      // Either the dispatch failed or the service threw before responding.
      // The detail stays server-side: this path is reachable by anyone.
      console.error(`dispatch failed for "${serviceName}":`, error);
      return new Response("Internal error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

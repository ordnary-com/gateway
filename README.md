# ordnary-gateway

The entry point for everything Ordnary serves on a per-service subdomain. It runs on
Cloudflare Workers for Platforms and routes each incoming request to the user Worker
that matches the subdomain it arrived on.

`billing.ordint.dev` goes to the Worker named `billing` in the dispatch namespace,
`docs.ordint.dev` goes to `docs`, and so on. Deploying a new service means uploading a
Worker to the namespace under the name you want it reachable at. Nothing here needs to
change, and no routes need to be added to the zone.

## How it works

The gateway reads the first label of the request hostname and uses it as a lookup key:

```
foo.ordint.dev  ->  env.DISPATCHER.get("foo").fetch(request)
```

The original `Request` is forwarded unmodified, so the downstream Worker sees the real
URL, method, headers and body. The response is returned as-is.

The hostname has to be exactly one label under `ordint.dev`, and that label has to be a
valid DNS label. Anything else gets a 404 rather than a lookup, because the route pattern
`*.ordint.dev/*` also matches deeper names: without the check, `a.b.ordint.dev` would
quietly reach the `a` service.

That is the whole implementation. See `src/index.ts`.

## What it deliberately does not do

The gateway is on the hot path for every request, so it stays small on purpose:

- no authentication or authorization, that belongs in the services themselves
- no request rewriting, header injection or body inspection
- no state, no storage bindings, no caching layer
- no per-tenant configuration, the subdomain is the only routing input

If you find yourself wanting to add logic here, it almost certainly belongs in the
downstream Worker or in a Cloudflare product (WAF, Access, Rate Limiting) instead.

## Configuration

Defined in `wrangler.jsonc`:

| Setting | Value |
| --- | --- |
| Dispatch namespace | `ordint-internal` |
| Binding | `DISPATCHER` |
| Route | `*.ordint.dev/*` |

The namespace has to exist before the first deploy:

```sh
npx wrangler dispatch-namespace create ordint-internal
```

## Development

```sh
npm install
npm run dev        # local dev on the miniflare runtime
npm test           # vitest, via @cloudflare/vitest-pool-workers
npm run deploy     # wrangler deploy
```

Run `npx wrangler types` after changing bindings in `wrangler.jsonc` to regenerate
`worker-configuration.d.ts`.

Note that dispatch namespaces have limited local emulation. To exercise real routing you
generally need a deployed gateway and at least one Worker uploaded to the namespace.

## Deploying a service behind the gateway

Upload the Worker into the namespace rather than to the account root:

```sh
npx wrangler deploy --dispatch-namespace ordint-internal
```

The Worker's `name` in its own `wrangler.jsonc` determines the subdomain it answers on.

## Known gaps

Worth knowing before you rely on this in production:

- Missing services are detected by matching the runtime's error message. A
  wording change upstream turns every 404 into a 500, and nothing would alert us.
- No per-tenant limits are passed to `get()`, so one service can consume the
  account CPU budget for all of them.
- Dispatch namespaces are not emulated locally. Hostname handling is covered by
  tests, but the dispatch itself is only exercised in production.

## Responses from the gateway itself

The gateway only produces a response of its own in two cases:

- `404` when no Worker with that name exists in the namespace
- `500` when the dispatch or the downstream fetch throws

Everything else you see came from the service behind it.

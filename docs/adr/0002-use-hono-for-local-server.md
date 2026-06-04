# Use Hono for the local server

The project is adding a local session timeline explorer with several HTTP endpoints, and future search, filter, and session APIs may add more routing surface. We decided to use Hono with `@hono/node-server` and not Express or hand-written Node `http` routing because Hono keeps routing, JSON responses, HTML responses, and direct app testing concise.

## Consequences

The project gains two runtime dependencies. In return, local server routing stays readable, endpoint tests can call the Hono app directly, and future session explorer APIs can be added without building custom routing infrastructure.

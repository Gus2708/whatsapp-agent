# Dynamic n8n and WAHA tunnel discovery

The active Cloudflare Quick Tunnel addresses are stored in `public.tunnel_config` in Supabase. The old `servidores_tuneles` reference in the README is stale. Do not hard-code a `trycloudflare.com` URL in automation: these addresses change.

From the repository root, configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env` (or the process environment), then run:

```sh
node scripts/resolve_tunnel_url.js n8n
node scripts/resolve_tunnel_url.js waha
```

The command prints only a validated base URL. It reads only `servicio,url,tunnel_state,updated_at` using the anon key, requires `running` with a heartbeat no older than 90 seconds, allows only HTTPS `*.trycloudflare.com` root URLs, and probes the host without forwarding the key or following redirects. WAHA's HTTP 401 authentication challenge counts as reachable. An unavailable row, missing read permission, stale heartbeat, or unreachable host causes a non-zero exit instead of returning an unverified URL. The anon role needs `SELECT` permission and a matching RLS policy on `tunnel_config`; keep service-role credentials out of this command.

The dashboard uses the same freshness and URL checks before exposing a tunnel to its n8n/WAHA clients. A successful lookup establishes only that the tunnel endpoint responds; it does not prove the workflow or message handling is healthy.

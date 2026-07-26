# Integration Notes

This app has **no authentication of its own**. It is designed to sit behind
an existing reverse proxy that has already authenticated the user, and it
trusts that proxy completely. This document is for anyone deploying it
outside of a fully trusted private network.

## What this app expects from its environment

### Immich access

`nginx.conf.template` proxies `/api/` to your Immich server and injects a
single `IMMICH_API_KEY` server-side (see `.env` / `IMMICH_API_KEY`). Every
visitor who can reach this app shares that one API key and therefore that
key's Immich permissions - there's no per-user Immich login. Scope the key
to read-only permissions (`album.read`, `asset.read`, `asset.view`) and
treat it as sensitive.

### Per-user identity for the backend (`immich-book-backend`)

The backend stores each saved photobook keyed by `(user_id, album_id)`. It
reads `user_id` from a single incoming HTTP header:

```
x-vk-user: <username>
```

(see `backend/main.py`, every `/photobooks*` and `/globalconfig` handler).
**The backend does not authenticate this header in any way** - it trusts
whatever value arrives. Concretely:

- If the backend (or the nginx in front of it) is reachable by anyone who
  can also just set `x-vk-user` themselves, they can read or overwrite any
  other user's photobooks.
- `nginx.conf.template`'s `/photobooks` and `/globalconfig` locations pass
  incoming headers straight through - it does **not** strip or overwrite a
  client-forged `x-vk-user`.

**This means the actual authentication has to happen upstream of this
entire stack**, in a reverse proxy that:

1. Authenticates the visitor (SSO, OAuth2/OIDC, form login, whatever fits
   your setup).
2. Sets `x-vk-user` to the authenticated identity itself, and strips any
   `x-vk-user` the client tried to send - so a forged header from the
   browser can never reach the backend.

Options that fit this pattern: [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/),
[Authelia](https://www.authelia.com/), Traefik's `forwardAuth` middleware
paired with either of those, or any reverse proxy/IdP combination capable
of injecting a trusted, tamper-proof identity header.

If you don't have (or don't want to stand up) such a layer, only deploy
this app on a network you already fully trust (e.g. behind a VPN, or a
single-user LAN), where anyone who can reach it is already someone who
should have full access.

### Docker network

`docker-compose.yml` joins an `external: true` network (`EXTERNAL_NETWORK`
in `.env`) instead of creating its own - this is what lets it reach your
existing reverse proxy and Immich server on their own Docker network. That
network isn't created by this stack; point `EXTERNAL_NETWORK` at whatever
your reverse proxy/Immich deployment already uses.

## Summary for a from-scratch deployment

1. Stand up (or reuse) a reverse proxy that authenticates users and can
   inject a trusted `x-vk-user` header while stripping any client-supplied
   one.
2. Point that proxy at this stack's nginx container, on the Docker network
   named in `EXTERNAL_NETWORK`.
3. Never expose `immich-book-backend` or this app's nginx directly to an
   untrusted network without that layer in front of it.


## API endpoints map (copy-ready)

Use this exact endpoint sequence.

## External Zoho endpoints

1. Authorization URL (frontend redirect)
  - `GET https://accounts.zoho.in/oauth/v2/auth`
  - Query params:
    - `response_type=code`
    - `client_id=<ZOHO_CLIENT_ID>`
    - `scope=openid,email,profile,phone`
    - `redirect_uri=<YOUR_REDIRECT_URI>`
    - `access_type=offline`

2. Token exchange (backend only)
  - `POST https://accounts.zoho.in/oauth/v2/token`
  - Content type: `application/x-www-form-urlencoded`
  - Body:
    - `grant_type=authorization_code`
    - `client_id=<ZOHO_CLIENT_ID>`
    - `client_secret=<ZOHO_CLIENT_SECRET>`
    - `redirect_uri=<YOUR_REDIRECT_URI>`
    - `code=<oauth_code_from_callback>`

3. User profile enrichment
  - `GET https://accounts.zoho.in/oauth/v2/userinfo`
  - Header: `Authorization: Bearer <access_token>`

4. Optional avatar fallback endpoint
  - `GET https://accounts.zoho.in/oauth/user/photo`
  - Header: `Authorization: Bearer <access_token>`

## Internal backend endpoints (recommended)

1. `GET /api/auth/zoho/url`
  - Purpose: returns computed Zoho auth URL for frontend redirect.
  - Response:
    - `{ "url": "https://accounts.zoho.in/oauth/v2/auth?..." }`

2. `POST /api/auth/zoho/callback`
  - Purpose: exchange code, load profile, fetch avatar, persist user updates, create session.
  - Request body:
    - `{ "code": "<oauth_authorization_code>" }`
  - Successful response shape:
    - `sessionId`
    - `user` (sanitized, includes usable avatar)
    - `zohoProfile` (merged profile)

3. `GET /api/auth/session`
  - Purpose: validate session and return sanitized user + profile.
  - Request header:
    - `x-session-id: <session_id>`

4. `POST /api/auth/logout`
  - Purpose: clear local session and optionally revoke token.

5. Optional image proxy endpoint for direct Zoho URLs
  - `GET /api/avatar/proxy?url=<base64-encoded-zoho-url>`
  - Domain allowlist strongly recommended.

## Callback API contract (minimum)

Inside your callback endpoint, implement this order:

1. Validate request body has `code`.
2. Exchange `code` for tokens.
3. Decode `id_token` payload if present.
4. Call `userinfo` endpoint.
5. Merge identity fields (`email`, `name`, `picture`, `sub`).
6. Match local user (`sub` first, email fallback).
7. Download avatar from `picture` URL (with fallback attempts).
8. Validate avatar bytes and mime type.
9. Compute hash and update avatar fields only when changed.
10. Create session and return sanitized user payload.

## Frontend integration contract

1. Frontend calls `GET /api/auth/zoho/url` and redirects browser.
2. Zoho redirects back with `code`.
3. Frontend sends `code` to `POST /api/auth/zoho/callback`.
4. Frontend stores `sessionId` and sends it in `x-session-id` header.
5. Frontend calls `GET /api/auth/session` on app reload.
6. Frontend renders avatar from `user.avatar` (data URI) or from your avatar endpoint.
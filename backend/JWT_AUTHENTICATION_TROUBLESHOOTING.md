# JWT Authentication Troubleshooting - Session Summary

## Overview
This document outlines all the approaches attempted to set up JWT authentication in the Photospots backend, including the issues encountered with each method.

---

## Attempt 1: JWT Signing Keys Rotation (ECC P-256)

### Approach
- Rotated Supabase JWT signing key from Legacy HS256 to ECC (P-256)
- Expected ES256-signed tokens to be verifiable via JWKS endpoint
- Updated auth middleware to fetch JWKS from `https://project.supabase.co/auth/v1/keys`

### Implementation
- Modified `src/api/middlewares/auth.ts` to use `createRemoteJWKSet()` from jose library
- Added `jwtVerify()` with JWKS endpoint for RS256/ES256 token verification

### Issues Encountered
1. **JWKS Endpoint Returning 404**: The `/auth/v1/keys` endpoint returned `404 Not Found` instead of a JSON Web Key Set
2. **Empty Keys Array**: Some attempts showed `{"keys":[]}` (empty array) instead of actual public keys
3. **GitHub Issue #35870**: Discovered this is a known Supabase limitation - JWKS endpoint feature not yet fully implemented
   - See: https://github.com/supabase/supabase/discussions/35870
   - Feature requires additional backend work by Supabase team
   - Only affects RS256/ES256; HS256 tokens still work via shared secret

### Outcome
❌ **FAILED** - Cannot verify ES256 tokens without access to the public keys from JWKS endpoint

---

## Attempt 2: JWKS Endpoint with API Key Header Injection

### Approach
- Discovered some Supabase projects require `apikey` header to access JWKS endpoint
- Wrapped `globalThis.fetch` to automatically inject `apikey` header for `/auth/v1/keys` requests
- Attempted to make JWKS endpoint accessible

### Implementation
```typescript
const _originalFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  if (url.includes('/auth/v1/keys')) {
    const newInit = { ...init, headers: { ...init?.headers } };
    newInit.headers['apikey'] = config.supabase.anonKey;
    return _originalFetch(input, newInit);
  }
  return _originalFetch(input, init);
};
```

### Issues Encountered
1. **Infinite Loop in Fetch Wrapper**: The global fetch wrapper caused recursive calls when `jwtVerify()` internally used fetch
2. **Still Returned 404/Empty Keys**: Even with apikey header, JWKS endpoint didn't return valid keys
3. **Application Hang**: The fetch wrapper intercepted all fetch calls, causing middleware to hang on every HTTP request

### Outcome
❌ **FAILED** - Even with API key injection, the JWKS endpoint wasn't functional. The fetch wrapper approach also caused infinite recursion.

---

## Attempt 3: Fallback Strategy (HS256 + JWKS Hybrid)

### Approach
- Try JWKS verification for ES256/RS256 tokens first
- Fall back to HS256 shared secret verification if JWKS fails
- Detect token algorithm from JWT header to determine verification method

### Implementation
```typescript
const header = getTokenHeader(token); // Decode header to check 'alg' field

if (header?.alg === 'ES256' || header?.alg === 'RS256') {
  try {
    // Try JWKS verification
    const jwks = await getJWKS();
    const { payload } = await jwtVerify(token, jwks, ...);
    return payload;
  } catch (jwksErr) {
    // Fall back to HS256
  }
}

// HS256 fallback with shared secret
const secret = getSharedSecret();
const { payload } = await jwtVerify(token, secret, ...);
```

### Issues Encountered
1. **Type Mismatch**: Cannot verify ES256 token using Uint8Array (HS256 secret)
   - Error: `"Key for the ES256 algorithm must be one of type KeyObject, CryptoKey, or JSON Web Key"`
2. **JWKS Still Non-Functional**: JWKS endpoint continued to return 404
3. **Asymmetric Algorithms Unsupported**: Without the public key, there's no way to verify asymmetric signatures

### Outcome
❌ **FAILED** - ES256 tokens fundamentally require the public key for verification; HS256 secret cannot verify them.

---

## Attempt 4: Revert to Legacy HS256 (Shared Secret)

### Approach
- Rotated JWT signing key back to Legacy HS256 (Shared Secret)
- Use Supabase anon key as the shared secret for HS256 verification
- Simplify verification to only use `jwtVerify()` with HS256

### Implementation
```typescript
function getSharedSecret(): Uint8Array {
  return new TextEncoder().encode(config.supabase.anonKey);
}

async function verifyToken(token: string): Promise<JWTPayload> {
  const secret = getSharedSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer: `${config.supabase.url}/auth/v1`,
  });
  return payload;
}
```

### Token Generation
- Fresh sign-in produces HS256 tokens: `"alg":"HS256"`
- These tokens are signed with the shared secret (anon key)
- Should be verifiable immediately

### Issues Encountered
1. **Server Hangs on All Requests**: Even `/health` endpoint times out
2. **Global Middleware Blocking**: The `optionalAuth` middleware applied globally causes all requests to hang
3. **Root Cause**: Issue appears to be at module load time or during request processing
4. **Possible Culprits**:
   - jose library import causing blocking operation
   - Some interaction with express middleware chain
   - TypeScript/tsx compilation/runtime issue

### Outcome
🔄 **IN PROGRESS / BLOCKED** - HS256 approach is sound in theory, but the implementation is causing the application to hang on every HTTP request.

---

## Summary Table

| Attempt | Method | Algorithm | Issue | Status |
|---------|--------|-----------|-------|--------|
| 1 | JWT Signing Keys (ECC P-256) | ES256 | JWKS endpoint returns 404/empty | ❌ FAILED |
| 2 | JWKS + API Key Header | ES256 | Infinite fetch loop + no valid keys | ❌ FAILED |
| 3 | Hybrid HS256/ES256 Fallback | ES256/HS256 | Type mismatch; can't verify ES256 with shared secret | ❌ FAILED |
| 4 | Legacy HS256 Shared Secret | HS256 | Server hangs on all HTTP requests | 🔄 BLOCKED |

---

## Root Cause Analysis

### Supabase JWKS Limitation
The primary blocker is that **Supabase JWKS endpoint does not return valid keys** for JWT Signing Keys (ES256/P-256). This is a known limitation documented in GitHub issue #35870. The feature requires additional work from the Supabase team.

### Current Server Hang Issue
The application hangs when attempting to process HTTP requests with the HS256 verification approach. Possible causes:
1. **Module loading issue**: jose library may be blocking during import
2. **Middleware chain**: Global `optionalAuth` middleware may have a synchronous blocking operation
3. **Runtime issue**: TypeScript/tsx transpilation or async/await handling
4. **Configuration issue**: Something in the config loading is blocking

---

## Recommended Next Steps

### Option A: Debug the HS256 Implementation Hang
1. Remove the `optionalAuth` middleware from app.ts temporarily
2. Test if `/health` endpoint responds
3. Gradually add back parts of auth.ts to isolate the blocker
4. Check if it's the module import, middleware initialization, or request handling

### Option B: Implement Development Bypass (Interim Solution)
1. Add a dev-only middleware that bypasses JWT verification: `X-DEV-USER-ID: <user-id>` header
2. Allows local development to proceed while fixing auth
3. Should not be used in production

### Option C: Use Supabase Client Library for Verification
1. Instead of jose library, use `@supabase/supabase-js` to verify tokens
2. Supabase SDK may handle verification internally without hanging
3. Might be more stable than raw jose implementation

### Option D: Wait for Supabase JWKS Fix
1. Monitor GitHub issue #35870 for updates
2. Once Supabase enables JWKS endpoints with actual keys, revert to Attempt 1
3. ES256 verification will then work properly

---

## Key Learnings

1. **Supabase JWT Signing Keys is a new feature** - Not all instances support full JWKS functionality yet
2. **Legacy HS256 is the reliable baseline** - Works consistently but doesn't scale to multiple backends
3. **jose library is async** - Must be imported and called correctly to avoid hanging
4. **JWKS endpoint is optional** - HS256 with shared secrets is a valid alternative for single-backend setups
5. **Middleware ordering matters** - Global middleware affects all routes; test without it first

---

## Files Modified During Troubleshooting

- `src/api/middlewares/auth.ts` - Multiple iterations of token verification logic
- `src/db/migrations/001_init.sql` - Fixed RPC parameter naming (pre-auth troubleshooting)
- `src/services/spotService.ts` - Updated RPC calls with correct parameters (pre-auth troubleshooting)

---

## Current State

**Blocker**: Application hangs on HTTP requests when using HS256 verification approach
**Next Action**: Debug why the middleware/server is hanging and isolate the blocking operation


# Supabase Multi-Platform URL & Deep Link Configuration

This document outlines the exact Redirect URLs, Deep Link Schemes, and OAuth configurations required for Kairo across all 5 client surfaces (Web, Windows Desktop, macOS Desktop, iOS Mobile, Android Mobile) against the Supabase project `kknnuerbxydfdkuspbkg`.

---

## 1. Supabase Dashboard URL Configuration

In the **Supabase Dashboard** under:
`Project Settings` -> `Authentication` -> `URL Configuration` -> `Redirect URLs`

Add the following URI entries:

| Platform | Redirect URI | Purpose |
| :--- | :--- | :--- |
| **Production Web** | `https://app.kairo.ai/**` | Production web sign-in, password reset, OAuth |
| **Production Web (Direct)** | `https://app.kairo.ai/auth/callback` | Direct callback landing |
| **Local Web Dev** | `http://localhost:3000/**` | Local Vite dev server |
| **Local Web Dev (Direct)** | `http://localhost:3000/auth/callback` | Local Vite auth callback |
| **Desktop (Local Tauri Dev)** | `http://localhost:1420/**` | Desktop app during local development |
| **Desktop (Local Tauri Direct)**| `http://localhost:1420/auth/callback` | Desktop auth callback |
| **Desktop (Production Tauri)** | `tauri://localhost/**` | Production macOS & Windows desktop builds |
| **Desktop (Tauri Protocol)** | `tauri://localhost/auth/callback` | Production desktop OAuth callback |
| **Mobile (iOS & Android Wildcard)** | `kairo://**` | Native mobile deep link wildcard |
| **Mobile Auth Callback** | `kairo://auth/callback` | iOS/Android OAuth and magic link callback |
| **Mobile Calendar Callback** | `kairo://calendar/callback` | iOS/Android Google Calendar OAuth callback |

---

## 2. Deep Link Scheme Specifications

### iOS (`apps/mobile/app.json`)
```json
{
  "expo": {
    "scheme": "kairo",
    "ios": {
      "bundleIdentifier": "com.kairo.mobile"
    }
  }
}
```

### Android (`apps/mobile/app.json`)
```json
{
  "expo": {
    "scheme": "kairo",
    "android": {
      "package": "com.kairo.mobile"
    }
  }
}
```

---

## 3. Google Calendar OAuth Sync Callback Handling

The `google-calendar-connect` Edge Function generates the Google OAuth authorization URL with `redirect_uri` pointing to the Edge Function `google-calendar-callback`, which then redirects to the client application:

- **Web**: Redirects to `${origin}/app/settings?calendar=connected`
- **Desktop**: Redirects to `http://localhost:1420/app/settings?calendar=connected` or `tauri://localhost/app/settings?calendar=connected`
- **Mobile**: Deep links back to `kairo://calendar/callback?status=success`

---

## 4. Helper Functions in `@kairo/platform`

Use [`getAuthRedirectUrl(platform)`](file:///d:/Projects/Kairo/packages/platform/src/linking/deepLinks.ts#L12-L26) and [`getCalendarRedirectUrl(platform)`](file:///d:/Projects/Kairo/packages/platform/src/linking/deepLinks.ts#L31-L45) to resolve the exact URL per target platform dynamically:

```typescript
import { getAuthRedirectUrl } from '@kairo/platform';
import { signInWithOAuth } from '@kairo/api';

// Automatically selects kairo://auth/callback on mobile or window.location.origin on web
await signInWithOAuth('google', getAuthRedirectUrl('web'));
```

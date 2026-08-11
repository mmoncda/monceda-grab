# Monceda Grab V1 — Setup Guide

This package contains the Monceda Grab frontend source code.

## Requirements

- Node.js 22 or newer
- npm

## Run on your Mac

1. Extract `MONCEDA_GRAB_SOURCE.zip`.
2. Open Terminal in the extracted `MONCEDA_GRAB` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the development site:

   ```bash
   npm run dev
   ```

## Current live frontend

`https://monceda-grab.shancerecel101.chatgpt.site`

## Render backend

Create a Render **Web Service** from the public Docker image:

`ghcr.io/imputnet/cobalt:11`

Recommended service settings:

- Name: `monceda-grab-api`
- Region: Singapore
- Instance type: Free

Environment variables:

| Key | Value |
| --- | --- |
| `API_URL` | `https://monceda-grab-api-us.onrender.com/` |
| `CORS_WILDCARD` | `0` |
| `CORS_URL` | `https://grab.moncedalabs.com` |
| `DURATION_LIMIT` | `1800` |
| `RATELIMIT_WINDOW` | `60` |
| `RATELIMIT_MAX` | `10` |
| `TUNNEL_RATELIMIT_WINDOW` | `60` |
| `TUNNEL_RATELIMIT_MAX` | `20` |

If Render changes the final service name or URL, update `API_URL` to the exact URL Render assigns, including the trailing slash.

## Usage limitation

Use Monceda Grab only for public media that you own, public-domain media, or media you have permission to download. Private, login-protected, paywalled, or DRM-protected content is outside the supported scope.

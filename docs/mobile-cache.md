# multiOS Mobile Companion Offline Caching & PWA Specs

Technical specs for Safari WebKit client offline resilience and asset caching on iOS devices.

## Cache Invalidation Strategy

- Static assets (stylesheets, icons, responsive web components) use content-hashed URLs (`app.[hash].js`).
- Cache-Control headers specify `no-cache, must-revalidate` for API endpoints, while static bundle chunks leverage immutable caching.
- Native web manifest enables seamless standalone execution without Safari browser chrome when added to the iOS Home Screen.

/* Minimal PWA lifecycle only. Web Push handlers can be added in a later phase. */
self.addEventListener("install", () => {
  // The browser completes installation without forcing a waiting worker active.
});

self.addEventListener("activate", () => {
  // Activation intentionally leaves existing clients and network traffic untouched.
});

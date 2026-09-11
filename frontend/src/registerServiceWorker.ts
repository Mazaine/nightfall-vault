export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        // PWA support must never prevent the application from starting.
      });
    },
    { once: true },
  );
}

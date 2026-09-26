/** Register the offline service worker where supported. Offline install is optional. */
export function registerServiceWorker(): void {
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* Offline install is optional. */ });
  }
}

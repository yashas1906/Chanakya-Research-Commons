/**
 * Remembers whether the visitor has moved between pages inside the app during this tab's life.
 * Back links use it: with in-app history they act like the browser Back button, otherwise
 * (page opened directly or from another site) they go to a sensible fixed page.
 */
let navigatedInApp = false;

export function markInAppNavigation() {
  navigatedInApp = true;
}

export function hasInAppHistory() {
  return navigatedInApp;
}

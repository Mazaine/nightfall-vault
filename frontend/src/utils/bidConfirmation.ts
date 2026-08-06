export const BID_CONFIRMATION_STORAGE_KEY = "nightfall.bidConfirmation.disabled.v1";

export function isBidConfirmationDisabled() {
  return window.localStorage.getItem(BID_CONFIRMATION_STORAGE_KEY) === "true";
}

export function disableBidConfirmation() {
  window.localStorage.setItem(BID_CONFIRMATION_STORAGE_KEY, "true");
}

export function resetBidConfirmation() {
  window.localStorage.removeItem(BID_CONFIRMATION_STORAGE_KEY);
}

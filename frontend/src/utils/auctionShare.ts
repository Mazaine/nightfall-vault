export function publicAuctionUrl(auctionId: number) {
  return new URL(`/auctions/${auctionId}`, window.location.origin).href;
}

export function openFacebookAuctionShare(auctionId: number) {
  const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicAuctionUrl(auctionId))}`;
  window.open(shareUrl, "nightfall-facebook-share", "popup=yes,width=720,height=640,noopener,noreferrer");
}

export async function copyAuctionLink(auctionId: number) {
  const url = publicAuctionUrl(auctionId);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const input = document.createElement("textarea");
  input.value = url;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export async function shareAuction(auctionId: number, title: string) {
  if (navigator.share) {
    await navigator.share({ title: `${title} | Nightfall Vault`, url: publicAuctionUrl(auctionId) });
    return "shared" as const;
  }
  await copyAuctionLink(auctionId);
  return "copied" as const;
}

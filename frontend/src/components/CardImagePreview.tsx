import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hkkCardImageUrl } from "../utils/hkk";

type CardImage = {
  external_card_id: string;
  card_name: string;
  image_url: string | null;
};

type PreviewPosition = { left: number; top: number; width: number };

export function CardImagePreview({ card, className = "" }: { card: CardImage; className?: string }) {
  const imageUrl = hkkCardImageUrl(card.external_card_id, card.image_url);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<PreviewPosition>({ left: 12, top: 12, width: 300 });

  const clearTimers = useCallback(() => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 14;
    const edge = 12;
    const width = Math.min(320, Math.max(220, window.innerWidth - edge * 2));
    const height = width * 1.4;
    const rightSide = rect.right + gap + width <= window.innerWidth - edge;
    const preferredLeft = rightSide ? rect.right + gap : rect.left - gap - width;
    const left = Math.max(edge, Math.min(preferredLeft, window.innerWidth - width - edge));
    const top = Math.max(edge, Math.min(rect.top - 48, window.innerHeight - height - edge));
    setPosition({ left, top, width });
  }, []);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition, visible]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!imageUrl) return <div className={["vault-card-placeholder", className].filter(Boolean).join(" ")} aria-hidden="true">HKK</div>;

  const show = () => {
    clearTimers();
    showTimer.current = setTimeout(() => {
      updatePosition();
      setVisible(true);
    }, 120);
  };
  const hide = () => {
    clearTimers();
    hideTimer.current = setTimeout(() => setVisible(false), 70);
  };

  return <>
    <span ref={anchorRef} className={["card-image-preview", className].filter(Boolean).join(" ")} onPointerEnter={show} onPointerLeave={hide}>
      <img className="card-image-preview-thumbnail" src={imageUrl} alt={card.card_name} loading="lazy" />
    </span>
    {visible && typeof document !== "undefined" ? createPortal(
      <span className="card-image-preview-popover" style={position} role="presentation">
        <img src={imageUrl} alt={`${card.card_name} nagyított képe`} />
      </span>,
      document.body,
    ) : null}
  </>;
}

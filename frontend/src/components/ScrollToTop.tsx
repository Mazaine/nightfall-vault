import { useEffect } from "react";
import { useLocation } from "react-router";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const scroll = () => {
      if (hash) {
        document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start", behavior: "auto" });
        return;
      }
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };
    scroll();
    const frame = window.requestAnimationFrame(scroll);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}

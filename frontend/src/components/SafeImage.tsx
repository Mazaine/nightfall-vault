import { ImgHTMLAttributes, useEffect, useState } from "react";

type SafeImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackClassName?: string;
};

export function SafeImage({ src, alt, fallbackClassName = "image-fallback", ...props }: SafeImageProps) {
  const [failed, setFailed] = useState(!src);

  useEffect(() => setFailed(!src), [src]);

  if (failed || !src) {
    return <span className={fallbackClassName} role="img" aria-label={alt ? `${alt} – kép nem érhető el` : "Kép nem érhető el"}>Kép nem érhető el</span>;
  }
  return <img {...props} src={src} alt={alt} onError={() => setFailed(true)} />;
}

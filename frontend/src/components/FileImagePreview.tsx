import { useEffect, useState } from "react";

export function FileImagePreview({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url ? <img className="file-image-preview" src={url} alt={alt} /> : <span className="file-image-preview is-loading" aria-hidden="true" />;
}

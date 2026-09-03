import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from "react";
import { normalizeBiliImage, normalizeVideoCover } from "@/lib/bili-image";

interface BiliImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  variant?: "default" | "cover";
}

/** 找最近的可滚动祖先。原生 loading=lazy 只看窗口视口，评论区这种内部 overflow 经常永远不加载。 */
function closestScrollRoot(start: HTMLElement | null): Element | null {
  let node: HTMLElement | null = start?.parentElement ?? null;
  while (node && node !== document.documentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (
      /(auto|scroll|overlay)/.test(overflowY) ||
      /(auto|scroll|overlay)/.test(overflowX)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function intersectsRoot(
  el: HTMLElement,
  root: Element | null,
  margin = 320,
): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const rootRect = root
    ? root.getBoundingClientRect()
    : {
        top: 0,
        left: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      };
  return (
    rect.bottom > rootRect.top - margin &&
    rect.top < rootRect.bottom + margin &&
    rect.right > rootRect.left - margin &&
    rect.left < rootRect.right + margin
  );
}

export function BiliImage({
  src,
  alt,
  className,
  variant = "default",
  loading = "lazy",
  onError,
  ...props
}: BiliImageProps) {
  const url =
    variant === "cover" ? normalizeVideoCover(src) : normalizeBiliImage(src);
  const imgRef = useRef<HTMLImageElement>(null);
  const [active, setActive] = useState(loading === "eager");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setRetry(0);
    if (!url || loading === "eager") {
      setActive(Boolean(url) && loading === "eager");
      return;
    }

    setActive(false);
    const node = imgRef.current;
    if (!node) return;

    const root = closestScrollRoot(node);
    let cancelled = false;

    const activate = () => {
      if (!cancelled) setActive(true);
    };

    const tryActivate = () => {
      if (cancelled || intersectsRoot(node, root)) activate();
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          activate();
          io.disconnect();
        }
      },
      { root, rootMargin: "320px 0px", threshold: 0.01 },
    );
    io.observe(node);

    const ro = new ResizeObserver(tryActivate);
    ro.observe(node);
    const parent = node.parentElement;
    if (parent) ro.observe(parent);

    const raf = requestAnimationFrame(tryActivate);

    return () => {
      cancelled = true;
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [url, loading]);

  if (!url) {
    return <div className={className} aria-label={alt} />;
  }

  const shouldLoad = active || loading === "eager";
  const displaySrc =
    retry > 0 ? `${url}${url.includes("?") ? "&" : "?"}retry=${retry}` : url;

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if (!shouldLoad) return;
    if (retry < 1) {
      setRetry(1);
      return;
    }
    onError?.(event);
  };

  return (
    <img
      {...props}
      ref={imgRef}
      src={shouldLoad ? displaySrc : undefined}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      decoding="async"
      onError={shouldLoad ? handleError : undefined}
    />
  );
}

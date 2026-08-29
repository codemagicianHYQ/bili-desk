import { useState, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  isBiliShortUrl,
  isBiliUrl,
  parseBiliAppPath,
} from "@shared/utils/bili-app-link";
import { splitLinkifiedText } from "@shared/utils/external-url";

async function resolveAppPath(href: string): Promise<string | null> {
  const direct = parseBiliAppPath(href);
  if (direct) return direct;
  if (!isBiliShortUrl(href)) return null;
  try {
    const resolved = await window.biliDesk.app.resolveBiliUrl(href);
    return parseBiliAppPath(resolved);
  } catch {
    return null;
  }
}

export function ExternalTextLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const [tip, setTip] = useState("");
  const biliLink = isBiliUrl(href) || isBiliShortUrl(href);

  const showTip = (message: string) => {
    setTip(message);
    window.setTimeout(() => setTip(""), 1800);
  };

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const appPath = await resolveAppPath(href);
    if (appPath) {
      navigate(appPath);
      return;
    }

    if (biliLink) {
      showTip("应用内暂不支持该页面");
      return;
    }

    void window.biliDesk.app.openExternal(href);
  };

  return (
    <span className="relative">
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={cn(
          "break-all underline-offset-2 hover:underline",
          biliLink ? "text-[#00AEEC]" : "text-primary",
          className,
        )}
        onClick={(event) => void handleClick(event)}
      >
        {children}
      </a>
      {tip && (
        <span className="pointer-events-none absolute -top-7 left-0 z-10 whitespace-nowrap rounded-full bg-black/80 px-2 py-1 text-[11px] text-white">
          {tip}
        </span>
      )}
    </span>
  );
}

export function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parts = splitLinkifiedText(text);
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) =>
        part.kind === "url" ? (
          <ExternalTextLink key={`u-${index}`} href={part.href}>
            {part.value}
          </ExternalTextLink>
        ) : (
          <span key={`t-${index}`}>{part.value}</span>
        ),
      )}
    </span>
  );
}

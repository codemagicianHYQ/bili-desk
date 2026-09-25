import { type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { openBiliHref } from "@/lib/open-bili-href";
import { isBiliShortUrl, isBiliUrl } from "@shared/utils/bili-app-link";
import { normalizeBvid, splitLinkifiedText } from "@shared/utils/external-url";

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
  const biliLink = isBiliUrl(href) || isBiliShortUrl(href);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void openBiliHref(href, navigate);
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "break-all underline-offset-2 hover:underline",
        biliLink ? "text-[#00AEEC]" : "text-primary",
        className,
      )}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

export function BvidTextLink({
  bvid,
  className,
}: {
  bvid: string;
  className?: string;
}) {
  const id = normalizeBvid(bvid);
  return (
    <Link
      to={`/video/${id}`}
      className={cn(
        "break-all font-medium text-[#00AEEC] underline-offset-2 hover:underline",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {bvid}
    </Link>
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
        ) : part.kind === "bvid" ? (
          <BvidTextLink key={`bv-${index}`} bvid={part.value} />
        ) : (
          <span key={`t-${index}`}>{part.value}</span>
        ),
      )}
    </span>
  );
}

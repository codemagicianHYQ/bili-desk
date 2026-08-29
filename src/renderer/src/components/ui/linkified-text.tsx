import { type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { splitLinkifiedText } from "@shared/utils/external-url";

function openExternal(event: MouseEvent<HTMLAnchorElement>, href: string) {
  event.preventDefault();
  event.stopPropagation();
  void window.biliDesk.app.openExternal(href);
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
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "break-all text-primary underline-offset-2 hover:underline",
        className,
      )}
      onClick={(event) => openExternal(event, href)}
    >
      {children}
    </a>
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

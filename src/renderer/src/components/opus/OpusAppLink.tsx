import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { OpusFavItem } from "@shared/types";
import { cn } from "@/lib/utils";
import { resolveOpusAppPath } from "@shared/utils/bili-app-link";

export function OpusAppLink({
  item,
  className,
  children,
}: {
  item: Pick<OpusFavItem, "id" | "url">;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const to = resolveOpusAppPath(item);

  return (
    <button
      type="button"
      className={cn("block w-full cursor-pointer text-left", className)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        navigate(to);
      }}
    >
      {children}
    </button>
  );
}

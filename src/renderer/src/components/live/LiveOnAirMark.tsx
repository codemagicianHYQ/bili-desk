import { cn } from "@/lib/utils";

/** 官网头像底部的「直播中」：蓝底胶囊，左侧三根音柱循环缩放 */
export function LiveOnAirMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "absolute bottom-0 left-1/2 z-10 inline-flex w-max -translate-x-1/2 translate-y-[40%] items-center gap-1 whitespace-nowrap rounded-full border border-background bg-[#00aeec] px-1.5 py-0.5 text-[11px] font-medium leading-none text-white",
        className,
      )}
    >
      <span className="bili-live-eq" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      直播中
    </span>
  );
}

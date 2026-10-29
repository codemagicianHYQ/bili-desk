import { useEffect, useRef, useState } from "react";

/** 行内重命名：Enter 提交、Esc 取消、失焦提交；返回 null 表示不改 */
export function InlineRenameInput({
  initial,
  maxLength,
  onDone,
}: {
  initial: string;
  maxLength: number;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedAt = useRef(Date.now());
  const doneRef = useRef(false);

  const finish = (next: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(next);
  };

  useEffect(() => {
    // 双击触发时，紧跟的事件可能抢走焦点，挂载后下一帧再聚焦
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      maxLength={maxLength}
      draggable={false}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onBlur={() => {
        if (Date.now() - mountedAt.current < 250) {
          inputRef.current?.focus();
          return;
        }
        finish(value.trim() || null);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(value.trim() || null);
        if (event.key === "Escape") finish(null);
      }}
      className="min-w-0 flex-1 rounded border border-primary/50 bg-background px-1 py-0.5 text-sm text-foreground outline-none"
    />
  );
}

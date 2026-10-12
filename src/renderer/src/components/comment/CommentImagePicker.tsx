import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

function ImageThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return (
    <span className="relative h-12 w-12 overflow-hidden rounded-md bg-secondary">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
      <button
        type="button"
        className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function CommentImagePicker({
  files,
  onChange,
  max = 3,
  disabled = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 20 * 1024 * 1024) continue;
      if (next.length >= max) break;
      next.push(file);
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={disabled || files.length >= max}
        title="添加图片"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus className="h-4 w-4" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={(event) => addFiles(event.target.files)}
      />
      {files.map((file, index) => (
        <ImageThumb
          key={`${file.name}-${file.size}-${index}`}
          file={file}
          onRemove={() => onChange(files.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  );
}

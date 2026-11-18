import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
function ImageThumb({ file, onRemove }) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);
    return (_jsxs("span", { className: "relative h-12 w-12 overflow-hidden rounded-md bg-secondary", children: [url ? _jsx("img", { src: url, alt: "", className: "h-full w-full object-cover" }) : null, _jsx("button", { type: "button", className: "absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white", onClick: onRemove, children: _jsx(X, { className: "h-3 w-3" }) })] }));
}
export function CommentImagePicker({ files, onChange, max = 3, disabled = false, }) {
    const inputRef = useRef(null);
    const addFiles = (list) => {
        if (!list)
            return;
        const next = [...files];
        for (const file of Array.from(list)) {
            if (!file.type.startsWith("image/"))
                continue;
            if (file.size > 20 * 1024 * 1024)
                continue;
            if (next.length >= max)
                break;
            next.push(file);
        }
        onChange(next);
        if (inputRef.current)
            inputRef.current.value = "";
    };
    return (_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("button", { type: "button", disabled: disabled || files.length >= max, title: "\u6DFB\u52A0\u56FE\u7247", className: "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40", onClick: () => inputRef.current?.click(), children: _jsx(ImagePlus, { className: "h-4 w-4" }) }), _jsx("input", { ref: inputRef, type: "file", accept: "image/jpeg,image/png,image/gif,image/webp", multiple: true, className: "hidden", onChange: (event) => addFiles(event.target.files) }), files.map((file, index) => (_jsx(ImageThumb, { file: file, onRemove: () => onChange(files.filter((_, i) => i !== index)) }, `${file.name}-${file.size}-${index}`)))] }));
}

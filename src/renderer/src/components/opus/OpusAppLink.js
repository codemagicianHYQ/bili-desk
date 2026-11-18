import { jsx as _jsx } from "react/jsx-runtime";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { resolveOpusAppPath } from "@shared/utils/bili-app-link";
export function OpusAppLink({ item, className, children, }) {
    const navigate = useNavigate();
    const to = resolveOpusAppPath(item);
    return (_jsx("button", { type: "button", className: cn("block w-full cursor-pointer text-left", className), onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            navigate(to);
        }, children: children }));
}

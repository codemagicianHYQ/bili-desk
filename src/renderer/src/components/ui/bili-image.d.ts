import { type ImgHTMLAttributes } from "react";
interface BiliImageProps extends ImgHTMLAttributes<HTMLImageElement> {
    src: string;
    variant?: "default" | "cover";
}
export declare function BiliImage({ src, alt, className, variant, loading, onError, ...props }: BiliImageProps): import("react/jsx-runtime").JSX.Element;
export {};

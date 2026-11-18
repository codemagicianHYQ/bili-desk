interface ImageLightboxProps {
    images: string[];
    index: number;
    open: boolean;
    onClose: () => void;
    onIndexChange?: (index: number) => void;
}
export declare function ImageLightbox({ images, index, open, onClose, onIndexChange, }: ImageLightboxProps): import("react/jsx-runtime").JSX.Element | null;
export {};

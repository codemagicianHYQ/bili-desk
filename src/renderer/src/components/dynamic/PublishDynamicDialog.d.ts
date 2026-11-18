export declare function PublishDynamicDialog({ open, onClose, onPublished, editId, initialText, keepImages, }: {
    open: boolean;
    onClose: () => void;
    onPublished?: (id: string) => void;
    editId?: string;
    initialText?: string;
    keepImages?: string[];
}): import("react/jsx-runtime").JSX.Element | null;

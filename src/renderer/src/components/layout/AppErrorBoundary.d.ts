import { Component, type ErrorInfo, type ReactNode } from "react";
interface Props {
    children: ReactNode;
}
interface State {
    error: Error | null;
}
export declare class AppErrorBoundary extends Component<Props, State> {
    state: State;
    static getDerivedStateFromError(error: Error): State;
    componentDidCatch(error: Error, info: ErrorInfo): void;
    render(): string | number | boolean | import("react/jsx-runtime").JSX.Element | Iterable<ReactNode> | null | undefined;
}
export {};

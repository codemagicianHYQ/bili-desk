import { jsx as _jsx } from "react/jsx-runtime";
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
export function FollowButton({ isFollowing, loading = false, disabled = false, onClick, size = 'sm', className }) {
    return (_jsx(Button, { size: size, variant: isFollowing ? 'secondary' : 'default', className: cn(isFollowing &&
            'border border-border bg-muted text-muted-foreground shadow-none hover:bg-muted/80', className), disabled: disabled || loading, onClick: onClick, children: loading ? '处理中...' : isFollowing ? '已关注' : '+ 关注' }));
}

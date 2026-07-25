import { useEffect, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useFollowingStore } from "@/stores/following-store";

/** 已关注 UP 主的 mid 集合，用于推荐流等场景标注「已关注」。 */
export function useFollowedMidSet(): Set<number> {
  const user = useAppStore((state) => state.user);
  const allFollowings = useFollowingStore((state) => state.allFollowings);
  const ensureAllFollowings = useFollowingStore(
    (state) => state.ensureAllFollowings,
  );

  useEffect(() => {
    if (!user?.isLogin) return;
    void ensureAllFollowings().catch(() => {});
  }, [user?.isLogin, ensureAllFollowings]);

  return useMemo(() => {
    if (!allFollowings) return new Set<number>();
    return new Set(allFollowings.map((up) => up.mid));
  }, [allFollowings]);
}

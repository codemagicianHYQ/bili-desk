import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { UpProfile, UpRelation } from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { FollowActionButton } from "@/components/video/FollowActionButton";
import { formatCount } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { upProfileCache, upRelationCache } from "@/lib/session-data-cache";

interface UpOwnerCardProps {
  mid: number;
  name: string;
  face: string;
  trailing?: ReactNode;
}

export function UpOwnerCard({ mid, name, face, trailing }: UpOwnerCardProps) {
  const currentMid = useAppStore((state) => state.user?.mid ?? 0);
  const [profile, setProfile] = useState<UpProfile | null>(null);
  const [relation, setRelation] = useState<UpRelation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    const cachedProfile = upProfileCache.get(String(mid));
    const cachedRelation = upRelationCache.get(String(mid));
    if (cachedProfile) setProfile(cachedProfile);
    if (cachedRelation) setRelation(cachedRelation);
    if (cachedProfile && cachedRelation) return;

    Promise.all([
      cachedProfile
        ? Promise.resolve(cachedProfile)
        : window.biliDesk.bili.getUpProfile(mid),
      cachedRelation
        ? Promise.resolve(cachedRelation)
        : window.biliDesk.bili.getUpRelation(mid),
    ])
      .then(([upProfile, upRelation]) => {
        setProfile(upProfile);
        setRelation(upRelation);
        upProfileCache.set(String(mid), upProfile);
        upRelationCache.set(String(mid), upRelation);
      })
      .catch((e: Error) => setError(e.message));
  }, [mid]);

  const displayName = profile?.name || name;
  const displayFace = profile?.face || face;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-secondary/20 p-4">
        <Link
          to={`/up/${mid}`}
          className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
        >
          <BiliImage
            src={displayFace}
            alt={displayName}
            className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-border"
          />
          <div className="min-w-0 text-left">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate font-medium">{displayName}</p>
              {profile?.level != null && profile.level > 0 && (
                <span
                  className={
                    profile.level >= 6
                      ? "rounded px-1 py-0.5 text-[10px] font-semibold text-white bg-red-500"
                      : profile.level >= 4
                        ? "rounded px-1 py-0.5 text-[10px] font-semibold text-white bg-orange-500"
                        : "rounded px-1 py-0.5 text-[10px] font-semibold text-white bg-slate-400"
                  }
                >
                  Lv{profile.level}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {profile ? `${formatCount(profile.fans)} 粉丝` : "加载中..."}
              {profile ? ` · ${formatCount(profile.videos)} 投稿` : ""}
              {profile?.likes != null && profile.likes > 0
                ? ` · ${formatCount(profile.likes)} 获赞`
                : ""}
            </p>
          </div>
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {currentMid !== mid && (
            <FollowActionButton
              mid={mid}
              uname={displayName}
              face={displayFace}
              isFollowing={relation?.isFollowing ?? false}
              disabled={!relation}
              onFollowingChange={(following) => {
                setRelation((prev) =>
                  prev
                    ? { ...prev, isFollowing: following }
                    : { isFollowing: following, attribute: 0 },
                );
              }}
              onError={setError}
            />
          )}
          {trailing}
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

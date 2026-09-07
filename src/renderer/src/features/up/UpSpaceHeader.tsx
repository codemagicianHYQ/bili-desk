import type {
  UpProfile,
  UpRelation,
  UserRelationListType,
} from "@shared/types";
import { BiliImage } from "@/components/ui/bili-image";
import { FollowActionButton } from "@/components/video/FollowActionButton";
import { cn, formatCount } from "@/lib/utils";

export function UpSpaceHeader({
  profile,
  relation,
  currentMid,
  onOpenRelation,
  onRelationChange,
  onSpecialChange,
  onError,
}: {
  profile: UpProfile;
  relation: UpRelation | null;
  currentMid: number;
  onOpenRelation: (type: UserRelationListType) => void;
  onRelationChange: (following: boolean) => void;
  onSpecialChange: (special: boolean) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="relative">
      <div className="relative h-48 overflow-hidden sm:h-60">
        {profile.topPhoto ? (
          <BiliImage
            src={profile.topPhoto}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-sky-600/80 via-primary/60 to-rose-500/70" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-black/15" />
      </div>

      <div className="relative mx-auto max-w-5xl px-6">
        <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
          <BiliImage
            src={profile.face}
            alt={profile.name}
            className="h-24 w-24 shrink-0 rounded-full border-4 border-background object-cover shadow-lg ring-2 ring-primary/25"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3 pb-1 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-end gap-6 text-sm">
              <button
                type="button"
                className="text-left transition-colors hover:text-primary"
                onClick={() => onOpenRelation("followers")}
              >
                <div className="text-lg font-semibold tabular-nums">
                  {formatCount(profile.fans)}
                </div>
                <div className="text-xs text-muted-foreground">粉丝</div>
              </button>
              <button
                type="button"
                className="text-left transition-colors hover:text-primary"
                onClick={() => onOpenRelation("followings")}
              >
                <div className="text-lg font-semibold tabular-nums">
                  {formatCount(profile.following)}
                </div>
                <div className="text-xs text-muted-foreground">关注</div>
              </button>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatCount(profile.likes ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground">获赞</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {formatCount(profile.archiveViews ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground">播放</div>
              </div>
              {(profile.favourites ?? 0) > 0 && (
                <div>
                  <div className="text-lg font-semibold tabular-nums">
                    {formatCount(profile.favourites ?? 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">收藏夹</div>
                </div>
              )}
            </div>

            {currentMid !== profile.mid && (
              <FollowActionButton
                mid={profile.mid}
                uname={profile.name}
                face={profile.face}
                isFollowing={relation?.isFollowing ?? false}
                isSpecial={Boolean(relation?.special)}
                disabled={!relation}
                size="default"
                className="self-start sm:self-end"
                onFollowingChange={onRelationChange}
                onSpecialChange={onSpecialChange}
                onError={onError}
              />
            )}
          </div>
        </div>

        <div className="mt-4 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{profile.name}</h1>
            {profile.level != null && profile.level > 0 && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] font-semibold text-white",
                  profile.level >= 6
                    ? "bg-red-500"
                    : profile.level >= 4
                      ? "bg-amber-500"
                      : "bg-slate-400",
                )}
              >
                LV{profile.level}
              </span>
            )}
            {profile.officialDesc && (
              <span className="truncate text-xs text-primary">
                {profile.officialDesc}
              </span>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
            {profile.sign || "这个人很神秘，什么都没有写"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            UID {profile.mid}
            {profile.ipLocation ? ` · IP属地：${profile.ipLocation}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

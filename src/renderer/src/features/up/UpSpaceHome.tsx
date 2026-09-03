import type { OpusFavItem, UserCollectionItem, VideoItem } from "@shared/types";
import { OpusAppLink } from "@/components/opus/OpusAppLink";
import { BiliImage } from "@/components/ui/bili-image";
import { VideoCard } from "@/components/video/VideoCard";
import { cn } from "@/lib/utils";
import { ChevronRight, FileText, Folder } from "lucide-react";

function SectionHead({
  title,
  count,
  onMore,
}: {
  title: string;
  count?: number;
  onMore?: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-base font-medium">
        {title}
        {count != null && count > 0 && (
          <span className="ml-1.5 text-sm font-normal text-muted-foreground">
            {count}
          </span>
        )}
      </h3>
      {onMore && (
        <button
          type="button"
          onClick={onMore}
          className="inline-flex items-center text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          更多
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function UpSpaceHome({
  videos,
  videoCount,
  opus,
  opusCount,
  collections,
  collectionCount,
  gridClass,
  onOpenTab,
}: {
  videos: VideoItem[];
  videoCount: number;
  opus: OpusFavItem[];
  opusCount: number;
  collections: UserCollectionItem[];
  collectionCount: number;
  gridClass: string;
  onOpenTab: (tab: "videos" | "opus" | "collections") => void;
}) {
  const hasVideo = videos.length > 0;
  const hasOpus = opus.length > 0;
  const hasCollection = collections.length > 0;

  if (!hasVideo && !hasOpus && !hasCollection) {
    return (
      <p className="text-sm text-muted-foreground">
        该 UP 暂无公开的主页内容
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {hasVideo && (
        <section>
          <SectionHead
            title="视频"
            count={videoCount || videos.length}
            onMore={() => onOpenTab("videos")}
          />
          <div className={cn("grid gap-4", gridClass)}>
            {videos.slice(0, 6).map((video) => (
              <VideoCard key={video.bvid} video={video} />
            ))}
          </div>
        </section>
      )}

      {hasOpus && (
        <section>
          <SectionHead
            title="图文"
            count={opusCount || opus.length}
            onMore={() => onOpenTab("opus")}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {opus.slice(0, 3).map((item) => (
              <OpusAppLink
                key={item.id}
                item={item}
                className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-secondary/40"
              >
                {item.cover ? (
                  <BiliImage
                    src={item.cover}
                    alt=""
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center bg-muted">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <p className="line-clamp-2 p-2.5 text-sm">{item.title}</p>
              </OpusAppLink>
            ))}
          </div>
        </section>
      )}

      {hasCollection && (
        <section>
          <SectionHead
            title="合集和系列"
            count={collectionCount || collections.length}
            onMore={() => onOpenTab("collections")}
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {collections.slice(0, 4).map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => onOpenTab("collections")}
                className="overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:bg-secondary/40"
              >
                {item.cover ? (
                  <BiliImage
                    src={item.cover}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    <Folder className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="line-clamp-2 text-sm font-medium">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.total} 个内容
                  </p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

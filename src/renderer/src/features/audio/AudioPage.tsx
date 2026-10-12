import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { AudioSong } from "@shared/types";
import { PageBackHeader } from "@/components/layout/PageBackHeader";
import { BiliImage } from "@/components/ui/bili-image";
import { extractIpcErrorMessage } from "@/lib/ipc-error";
import { Loader2 } from "lucide-react";

export function AudioPage() {
  const { id = "" } = useParams<{ id: string }>();
  const sid = Number(id);
  const [song, setSong] = useState<AudioSong | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(sid) || sid <= 0) {
      setError("音频 ID 无效");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    void window.biliDesk.bili
      .getAudioSong(sid)
      .then((next) => {
        if (!cancelled) setSong(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(extractIpcErrorMessage(err) || "音频加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sid]);

  return (
    <div className="flex h-full flex-col">
      <PageBackHeader fallback="/" label="返回" />
      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-4 px-6 py-8">
          {loading && (
            <p className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              加载音频...
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {song && (
            <>
              {song.cover ? (
                <BiliImage
                  src={song.cover}
                  alt=""
                  className="mx-auto h-48 w-48 rounded-xl object-cover"
                />
              ) : null}
              <h1 className="text-center text-xl font-semibold">{song.title}</h1>
              {song.author && (
                <p className="text-center text-sm text-muted-foreground">
                  {song.author}
                </p>
              )}
              {song.intro && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {song.intro}
                </p>
              )}
              {song.url ? (
                <audio className="w-full" controls src={song.url} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  这首音频没有可播放的地址，可能需要会员或已下架。
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

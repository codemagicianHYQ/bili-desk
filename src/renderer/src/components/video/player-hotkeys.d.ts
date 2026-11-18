import type Artplayer from "artplayer";
import type { Setting } from "artplayer/types/setting";
export declare function attachPlayerHotkeys(art: Artplayer, isEnabled?: () => boolean): () => void;
export declare function createSeekStepSetting(): Setting;

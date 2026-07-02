export interface BiliDashSegmentBase {
  initialization: string
  indexRange: string
}

export interface BiliDashTrack {
  id: number
  baseUrl: string
  bandwidth: number
  mimeType: string
  codecs: string
  width?: number
  height?: number
  frameRate?: string
  segmentBase: BiliDashSegmentBase
}

export interface BiliDashPlayData {
  duration: number
  video: BiliDashTrack
  audio: BiliDashTrack
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildRepresentation(track: BiliDashTrack, kind: 'video' | 'audio'): string {
  const baseUrl = escapeXml(track.baseUrl)
  const init = escapeXml(track.segmentBase.initialization)
  const indexRange = escapeXml(track.segmentBase.indexRange)
  const sizeAttrs =
    kind === 'video'
      ? ` width="${track.width ?? 0}" height="${track.height ?? 0}" frameRate="${track.frameRate ?? '30'}"`
      : ''

  return `
    <Representation id="${track.id}" bandwidth="${track.bandwidth}" codecs="${escapeXml(track.codecs)}"${sizeAttrs}>
      <BaseURL>${baseUrl}</BaseURL>
      <SegmentBase indexRange="${indexRange}">
        <Initialization range="${init}"/>
      </SegmentBase>
    </Representation>`
}

function encodeMpdToDataUri(mpd: string): string {
  const encoded =
    typeof Buffer !== 'undefined'
      ? Buffer.from(mpd, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(mpd)))
  return `data:application/dash+xml;base64,${encoded}`
}

/** 将 B 站 DASH 音视频轨转为 dash.js 可识别的 MPD Data URI */
export function buildDashMpdUri(data: BiliDashPlayData): string {
  const duration = Math.max(1, Math.ceil(data.duration))
  const videoRep = buildRepresentation(data.video, 'video')
  const audioRep = buildRepresentation(data.audio, 'audio')

  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT${duration}S" minBufferTime="PT1.5S">
  <Period>
    <AdaptationSet contentType="video" mimeType="${escapeXml(data.video.mimeType)}" segmentAlignment="true">
      ${videoRep}
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="${escapeXml(data.audio.mimeType)}" segmentAlignment="true">
      ${audioRep}
    </AdaptationSet>
  </Period>
</MPD>`

  return encodeMpdToDataUri(mpd)
}

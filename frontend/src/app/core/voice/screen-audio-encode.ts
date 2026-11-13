export const SCREEN_AUDIO_MAX_BITRATE = 128_000;

const OPUS_MUSIC_FMTP: Record<string, string> = {
  stereo: '1',
  'sprop-stereo': '1',
  maxaveragebitrate: String(SCREEN_AUDIO_MAX_BITRATE),
  maxplaybackrate: '48000',
  useinbandfec: '1',
  usedtx: '0',
};

export function screenAudioFmtpFlags(
  sdp: string,
  screenMid: string | null,
): { stereo: boolean; maxaveragebitrate: number | null } {
  const section = pickScreenAudioSection(splitMSections(normalizeNewlines(sdp)).sections, screenMid);
  if (!section) {
    return { stereo: false, maxaveragebitrate: null };
  }
  const fmtp = section.split('\n').find((line) => /^a=fmtp:\d+/i.test(line)) ?? '';
  const params = parseFmtpParams(fmtp.replace(/^a=fmtp:\d+\s*/i, ''));
  const bitrate = Number(params.get('maxaveragebitrate'));
  return {
    stereo: params.get('stereo') === '1' || params.get('sprop-stereo') === '1',
    maxaveragebitrate: Number.isFinite(bitrate) ? bitrate : null,
  };
}

export function tuneScreenAudioSdp(sdp: string, screenMid: string | null): string {
  if (!sdp) {
    return sdp;
  }
  const crlf = sdp.includes('\r\n');
  const normalized = normalizeNewlines(sdp);
  const { preamble, sections } = splitMSections(normalized);
  const targetIndex = indexOfScreenAudioSection(sections, screenMid);
  if (targetIndex < 0) {
    return sdp;
  }
  const tuned = sections.map((section, index) => (index === targetIndex ? tuneOpusFmtp(section) : section));
  const out = [preamble, ...tuned.map((section) => section.replace(/\n+$/, ''))]
    .filter((part) => part.length > 0)
    .join('\n');
  const withLine = `${out}\n`;
  return crlf ? withLine.replace(/\n/g, '\r\n') : withLine;
}

export function applyScreenAudioSenderParams(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      return Promise.resolve();
    }
    const encoding = params.encodings[0];
    encoding.active = true;
    encoding.maxBitrate = SCREEN_AUDIO_MAX_BITRATE;
    encoding.priority = 'high';
    encoding.networkPriority = 'high';
    return sender.setParameters(params).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

function normalizeNewlines(sdp: string): string {
  return sdp.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function splitMSections(sdp: string): { preamble: string; sections: string[] } {
  const match = /^m=/m.exec(sdp);
  if (!match || match.index === undefined) {
    return { preamble: sdp, sections: [] };
  }
  const preamble = sdp.slice(0, match.index).replace(/\n+$/, '');
  const rest = sdp.slice(match.index);
  return { preamble, sections: rest.split(/\n(?=m=)/) };
}

function sectionMid(section: string): string | null {
  const line = section.split('\n').find((entry) => entry.startsWith('a=mid:'));
  return line ? line.slice('a=mid:'.length).trim() : null;
}

function indexOfScreenAudioSection(sections: string[], screenMid: string | null): number {
  const audioIndexes = sections
    .map((section, index) => (section.startsWith('m=audio') ? index : -1))
    .filter((index) => index >= 0);
  if (screenMid) {
    const byMid = sections.findIndex(
      (section, index) => audioIndexes.includes(index) && sectionMid(section) === screenMid,
    );
    if (byMid >= 0) {
      return byMid;
    }
  }
  return audioIndexes.length >= 2 ? audioIndexes[1] : -1;
}

function pickScreenAudioSection(sections: string[], screenMid: string | null): string | null {
  const index = indexOfScreenAudioSection(sections, screenMid);
  return index >= 0 ? sections[index] : null;
}

function parseFmtpParams(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      map.set(trimmed, '');
    } else {
      map.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
    }
  }
  return map;
}

function mergeFmtp(existing: string, extra: Record<string, string>): string {
  const map = parseFmtpParams(existing);
  for (const [key, value] of Object.entries(extra)) {
    map.set(key, value);
  }
  return [...map.entries()].map(([key, value]) => (value === '' ? key : `${key}=${value}`)).join(';');
}

function tuneOpusFmtp(section: string): string {
  const lines = section.split('\n');
  const opusPts: string[] = [];
  for (const line of lines) {
    const match = /^a=rtpmap:(\d+)\s+opus\//i.exec(line);
    if (match) {
      opusPts.push(match[1]);
    }
  }
  if (opusPts.length === 0) {
    return section;
  }

  const haveFmtp = new Set<string>();
  const next = lines.map((line) => {
    const match = /^a=fmtp:(\d+)\s+(.*)$/.exec(line);
    if (!match || !opusPts.includes(match[1])) {
      return line;
    }
    haveFmtp.add(match[1]);
    return `a=fmtp:${match[1]} ${mergeFmtp(match[2], OPUS_MUSIC_FMTP)}`;
  });

  for (const pt of opusPts) {
    if (haveFmtp.has(pt)) {
      continue;
    }
    const rtpIndex = next.findIndex((line) => line.startsWith(`a=rtpmap:${pt} `));
    const insertAt = rtpIndex >= 0 ? rtpIndex + 1 : next.length;
    next.splice(insertAt, 0, `a=fmtp:${pt} ${mergeFmtp('', OPUS_MUSIC_FMTP)}`);
  }
  return next.join('\n');
}

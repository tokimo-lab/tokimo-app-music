/**
 * WASM-based audio engine using Web Audio API (AudioContext) for playback.
 *
 * Decodes audio via WASM decoders (FLAC, MP3, OGG Vorbis, Opus) and falls
 * back to the browser's built-in `decodeAudioData()` for other formats
 * (WAV, AAC, M4A, AIFF, WMA, APE, etc.).
 *
 * Drop-in replacement for MusicAudioEngine with the same public API.
 */

// ── Format detection ─────────────────────────────────────────────────────────

type AudioFormat =
  | "flac"
  | "mp3"
  | "ogg-vorbis"
  | "ogg-opus"
  | "wav"
  | "aac"
  | "unknown";

function detectFormat(contentType: string, codec?: string | null): AudioFormat {
  // Prefer codec hint from track metadata (more reliable than MIME)
  if (codec) {
    const c = codec.toLowerCase();
    if (c === "flac") return "flac";
    if (c === "mp3" || c === "mpeg" || c.startsWith("mp3")) return "mp3";
    if (c === "vorbis") return "ogg-vorbis";
    if (c === "opus") return "ogg-opus";
    if (c.startsWith("pcm") || c === "wav") return "wav";
    if (c === "aac" || c === "alac") return "aac";
  }

  const ct = contentType.toLowerCase();
  if (ct.includes("flac")) return "flac";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  if (ct.includes("opus")) return "ogg-opus";
  if (ct.includes("ogg") || ct.includes("vorbis")) return "ogg-vorbis";
  if (ct.includes("wav") || ct.includes("wave")) return "wav";
  if (ct.includes("aac") || ct.includes("mp4") || ct.includes("m4a"))
    return "aac";

  return "unknown";
}

// ── Decoded audio shape (common across all WASM decoders) ────────────────────

interface DecodedAudio {
  channelData: Float32Array[];
  samplesDecoded: number;
  sampleRate: number;
}

// ── WASM decoder helpers (lazy-loaded) ───────────────────────────────────────

async function decodeFLAC(data: Uint8Array): Promise<DecodedAudio> {
  const { FLACDecoder } = await import("@wasm-audio-decoders/flac");
  const decoder = new FLACDecoder();
  await decoder.ready;
  try {
    return await decoder.decodeFile(data);
  } finally {
    decoder.free();
  }
}

async function decodeMP3(data: Uint8Array): Promise<DecodedAudio> {
  const { MPEGDecoder } = await import("mpg123-decoder");
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    return decoder.decode(data);
  } finally {
    decoder.free();
  }
}

async function decodeOggVorbis(data: Uint8Array): Promise<DecodedAudio> {
  const { OggVorbisDecoder } = await import("@wasm-audio-decoders/ogg-vorbis");
  const decoder = new OggVorbisDecoder();
  await decoder.ready;
  try {
    return await decoder.decodeFile(data);
  } finally {
    decoder.free();
  }
}

async function decodeOggOpus(data: Uint8Array): Promise<DecodedAudio> {
  const { OggOpusDecoder } = await import("ogg-opus-decoder");
  const decoder = new OggOpusDecoder();
  await decoder.ready;
  try {
    return await decoder.decodeFile(data);
  } finally {
    decoder.free();
  }
}

/** Convert WASM-decoded PCM to a Web Audio API AudioBuffer. */
function pcmToAudioBuffer(
  ctx: AudioContext,
  decoded: DecodedAudio,
): AudioBuffer {
  const { channelData, samplesDecoded, sampleRate } = decoded;
  const numChannels = channelData.length || 1;
  const buffer = ctx.createBuffer(numChannels, samplesDecoded, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    buffer.copyToChannel(new Float32Array(channelData[ch]), ch);
  }
  return buffer;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class WasmAudioEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private decodedBuffer: AudioBuffer | null = null;

  // Timing state
  private playStartCtxTime = 0;
  private seekOffset = 0;
  private _paused = true;

  // Volume (cached for lazy AudioContext creation)
  private _volume = 1;

  // Callbacks (single-subscriber, same as old engine's usage pattern)
  private _onTimeUpdate: ((time: number) => void) | null = null;
  private _onEnded: (() => void) | null = null;
  private _onLoadStart: (() => void) | null = null;
  private _onCanPlay: (() => void) | null = null;
  private _onError: ((error: unknown) => void) | null = null;

  private rafId: number | null = null;

  // ── AudioContext (lazy) ──────────────────────────────────────────────────

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this._volume;

      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.4;

      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // ── Public API (same surface as MusicAudioEngine) ────────────────────────

  /**
   * Fetch, decode via WASM, and start playing.
   * @param url  Stream URL from resolveStreamUrl()
   * @param codec  Optional codec hint from track metadata (e.g. "flac", "mp3")
   */
  async loadAndPlay(url: string, codec?: string | null): Promise<void> {
    this._onLoadStart?.();

    try {
      const ctx = this.getCtx();
      if (ctx.state === "suspended") await ctx.resume();

      // Stop any in-progress playback
      this.stopSourceInternal();

      // Fetch raw audio bytes
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Audio fetch failed: ${response.status}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      const arrayBuffer = await response.arrayBuffer();

      // Decode
      const format = detectFormat(contentType, codec);
      this.decodedBuffer = await this.decode(ctx, arrayBuffer, format);

      this._onCanPlay?.();

      // Start playback from the beginning
      this.seekOffset = 0;
      this.startSource(0);
    } catch (err) {
      console.error("[WasmAudioEngine] loadAndPlay error:", err);
      this._onError?.(err);
      throw err;
    }
  }

  pause(): void {
    if (this._paused) return;
    this.seekOffset = this.currentTime;
    this.stopSourceInternal();
    this._paused = true;
  }

  resume(): void {
    if (!this._paused || !this.decodedBuffer) return;
    const ctx = this.getCtx();
    if (ctx.state === "suspended") {
      ctx.resume().then(() => this.startSource(this.seekOffset));
    } else {
      this.startSource(this.seekOffset);
    }
  }

  seek(time: number): void {
    if (!this.decodedBuffer) return;
    const t = Math.max(0, Math.min(time, this.audioDuration));
    if (!this._paused) {
      this.startSource(t);
    } else {
      this.seekOffset = t;
    }
  }

  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
  }

  get currentTime(): number {
    if (this._paused || !this.ctx) return this.seekOffset;
    const elapsed = this.ctx.currentTime - this.playStartCtxTime;
    return Math.min(this.seekOffset + elapsed, this.audioDuration);
  }

  get audioDuration(): number {
    return this.decodedBuffer?.duration ?? 0;
  }

  get paused(): boolean {
    return this._paused;
  }

  // ── Event registration ───────────────────────────────────────────────────

  onTimeUpdate(cb: (time: number) => void): void {
    this._onTimeUpdate = cb;
  }
  onEnded(cb: () => void): void {
    this._onEnded = cb;
  }
  onLoadStart(cb: () => void): void {
    this._onLoadStart = cb;
  }
  onCanPlay(cb: () => void): void {
    this._onCanPlay = cb;
  }
  onError(cb: (error: unknown) => void): void {
    this._onError = cb;
  }

  /** Expose the AnalyserNode so visualizer components can read frequency data. */
  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  destroy(): void {
    this.stopSourceInternal();
    this.stopTimeTracking();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.decodedBuffer = null;
    this.gainNode = null;
    this.analyserNode = null;
    this._onTimeUpdate = null;
    this._onEnded = null;
    this._onLoadStart = null;
    this._onCanPlay = null;
    this._onError = null;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async decode(
    ctx: AudioContext,
    data: ArrayBuffer,
    format: AudioFormat,
  ): Promise<AudioBuffer> {
    const raw = new Uint8Array(data);

    // Try WASM decoders for known formats
    try {
      switch (format) {
        case "flac":
          return pcmToAudioBuffer(ctx, await decodeFLAC(raw));
        case "mp3":
          return pcmToAudioBuffer(ctx, await decodeMP3(raw));
        case "ogg-vorbis":
          return pcmToAudioBuffer(ctx, await decodeOggVorbis(raw));
        case "ogg-opus":
          return pcmToAudioBuffer(ctx, await decodeOggOpus(raw));
        case "wav":
        case "aac":
        case "unknown":
          // Fall through to browser decoder
          break;
      }
    } catch (wasmErr) {
      console.warn(
        `[WasmAudioEngine] WASM ${format} decode failed, trying browser fallback:`,
        wasmErr,
      );
    }

    // Fallback: browser's built-in AudioContext decoder
    // (handles WAV, AAC, M4A, AIFF, and some WMA/APE on certain platforms)
    // Note: decodeAudioData detaches the ArrayBuffer, so pass a copy
    return ctx.decodeAudioData(data.slice(0));
  }

  private startSource(offset: number): void {
    this.stopSourceInternal();

    const ctx = this.getCtx();
    if (!this.decodedBuffer || !this.gainNode) return;

    const source = ctx.createBufferSource();
    source.buffer = this.decodedBuffer;
    source.connect(this.gainNode);

    // Capture `source` in closure so the handler only fires for the CURRENT
    // source node.  When seeking, the old node is replaced and its async
    // `ended` event must be ignored.
    source.onended = () => {
      if (this.sourceNode === source) {
        this.stopTimeTracking();
        this._paused = true;
        this._onEnded?.();
      }
    };

    this.sourceNode = source;
    this.seekOffset = offset;
    this.playStartCtxTime = ctx.currentTime;
    this._paused = false;

    source.start(0, offset);
    this.startTimeTracking();
  }

  private stopSourceInternal(): void {
    if (this.sourceNode) {
      const old = this.sourceNode;
      this.sourceNode = null; // detach first so old onended is ignored
      try {
        old.stop();
      } catch {
        /* already stopped */
      }
      old.disconnect();
    }
    this.stopTimeTracking();
  }

  private startTimeTracking(): void {
    this.stopTimeTracking();
    const tick = () => {
      if (!this._paused) {
        this._onTimeUpdate?.(this.currentTime);
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopTimeTracking(): void {
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

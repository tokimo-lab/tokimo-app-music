/**
 * Wraps an HTML5 Audio element with a clean API for the music player context.
 */
export class MusicAudioEngine {
  private audio: HTMLAudioElement;
  private listeners: Array<() => void> = [];

  constructor() {
    this.audio = new Audio();
    this.audio.preload = "auto";
  }

  async loadAndPlay(url: string, _codec?: string | null): Promise<void> {
    this.audio.src = url;
    this.audio.currentTime = 0;
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  resume(): void {
    this.audio.play().catch(() => {
      /* user gesture required — silently ignored */
    });
  }

  seek(time: number): void {
    if (Number.isFinite(time)) {
      this.audio.currentTime = time;
    }
  }

  setVolume(vol: number): void {
    this.audio.volume = Math.max(0, Math.min(1, vol));
  }

  get currentTime(): number {
    return this.audio.currentTime;
  }

  get audioDuration(): number {
    const d = this.audio.duration;
    return Number.isFinite(d) ? d : 0;
  }

  get paused(): boolean {
    return this.audio.paused;
  }

  onTimeUpdate(cb: (time: number) => void): void {
    const handler = () => cb(this.audio.currentTime);
    this.audio.addEventListener("timeupdate", handler);
    this.listeners.push(() =>
      this.audio.removeEventListener("timeupdate", handler),
    );
  }

  onEnded(cb: () => void): void {
    this.audio.addEventListener("ended", cb);
    this.listeners.push(() => this.audio.removeEventListener("ended", cb));
  }

  onLoadStart(cb: () => void): void {
    this.audio.addEventListener("loadstart", cb);
    this.listeners.push(() => this.audio.removeEventListener("loadstart", cb));
  }

  onCanPlay(cb: () => void): void {
    this.audio.addEventListener("canplay", cb);
    this.listeners.push(() => this.audio.removeEventListener("canplay", cb));
  }

  onError(cb: (error: unknown) => void): void {
    const handler = () => cb(this.audio.error);
    this.audio.addEventListener("error", handler);
    this.listeners.push(() => this.audio.removeEventListener("error", handler));
  }

  getAnalyser(): AnalyserNode | null {
    return null;
  }

  destroy(): void {
    this.audio.pause();
    this.audio.src = "";
    for (const remove of this.listeners) remove();
    this.listeners = [];
  }
}

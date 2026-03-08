const STORAGE_KEY = 'seagame_sound_muted';

export class AudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private music: HTMLAudioElement | null = null;
  private musicStarted = false;
  private _muted: boolean;

  constructor() {
    this._muted = localStorage.getItem(STORAGE_KEY) === '1';

    this.preload('click', '/audio/click.wav');
    this.preload('stairs', '/audio/stairs.wav');
    this.preload('deck_change', '/audio/deck_change.wav');

    this.music = new Audio('/audio/shanty.wav');
    this.music.loop = true;
    this.music.volume = 0.4;
  }

  get muted(): boolean {
    return this._muted;
  }

  toggleMute(): void {
    this._muted = !this._muted;
    localStorage.setItem(STORAGE_KEY, this._muted ? '1' : '0');
    if (this.music) {
      if (this._muted) {
        this.music.pause();
      } else if (this.musicStarted) {
        this.music.play().catch(() => {});
      }
    }
  }

  private preload(name: string, src: string): void {
    const audio = new Audio(src);
    audio.volume = 0.5;
    this.sounds.set(name, audio);
  }

  play(name: string): void {
    if (this._muted) return;
    const sound = this.sounds.get(name);
    if (sound) {
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = sound.volume;
      clone.play().catch(() => {});
    }
  }

  /** Start music on first user interaction (browsers require this) */
  startMusicOnInteraction(): void {
    if (this.musicStarted) return;
    this.musicStarted = true;
    if (!this._muted) {
      this.music?.play().catch(() => {});
    }
  }
}

const STORAGE_KEY = 'seagame_sound_muted';

export class AudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private music: HTMLAudioElement | null = null;
  private musicStarted = false;
  private _muted: boolean;

  constructor() {
    this._muted = localStorage.getItem(STORAGE_KEY) === '1';

    this.preload('click', '/audio/elevenlabs-generated/click.mp3');
    this.preload('stairs', '/audio/elevenlabs-generated/stairs.mp3');
    this.preload('deck_change', '/audio/elevenlabs-generated/deck_change.mp3');
    this.preload('lantern_light', '/audio/elevenlabs-generated/lantern_light.mp3');
    this.preload('lantern_extinguish', '/audio/elevenlabs-generated/lantern_extinguish.mp3');
    this.preload('glug_male', '/audio/elevenlabs-generated/glug_male.mp3');
    this.preload('glug_female', '/audio/elevenlabs-generated/glug_female.mp3');
    this.preload('kiss', '/audio/elevenlabs-generated/kiss.mp3');

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

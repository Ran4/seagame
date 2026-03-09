const STORAGE_KEY = 'seagame_sound_muted';

type SoundEntry = {
  audio: HTMLAudioElement;
  category: 'ui' | 'world';
};

export class AudioManager {
  private sounds: Map<string, SoundEntry> = new Map();
  private music: HTMLAudioElement | null = null;
  private musicStarted = false;
  private _muted: boolean;
  activeDeck = 0;

  constructor() {
    this._muted = localStorage.getItem(STORAGE_KEY) === '1';

    this.preload('click', '/audio/elevenlabs-generated/click.mp3', 'ui');
    this.preload('stairs', '/audio/elevenlabs-generated/stairs.mp3', 'ui');
    this.preload('deck_change', '/audio/elevenlabs-generated/deck_change.mp3', 'ui');
    this.preload('lantern_light', '/audio/elevenlabs-generated/lantern_light.mp3', 'world');
    this.preload('lantern_extinguish', '/audio/elevenlabs-generated/lantern_extinguish.mp3', 'world', 0.3);
    this.preload('glug_male', '/audio/elevenlabs-generated/glug_male.mp3', 'world', 0.9);
    this.preload('glug_female', '/audio/elevenlabs-generated/glug_female.mp3', 'world', 0.9);
    this.preload('kiss', '/audio/elevenlabs-generated/kiss.mp3', 'world');

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

  private preload(name: string, src: string, category: 'ui' | 'world', volume = 0.5): void {
    const audio = new Audio(src);
    audio.volume = volume;
    this.sounds.set(name, { audio, category });
  }

  /** Play a sound. For 'world' sounds, pass soundDeck to attenuate by distance. */
  play(name: string, soundDeck?: number): void {
    const entry = this.sounds.get(name);
    if (!entry) return;
    const clone = entry.audio.cloneNode() as HTMLAudioElement;
    let volume = entry.audio.volume;
    if (entry.category === 'world' && soundDeck !== undefined) {
      const dist = Math.abs(soundDeck - this.activeDeck);
      volume *= Math.pow(0.4, dist);
    }
    clone.volume = volume;
    clone.play().catch(() => {});
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

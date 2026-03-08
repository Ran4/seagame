export class AudioManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private music: HTMLAudioElement | null = null;
  private musicStarted = false;

  constructor() {
    this.preload('click', '/audio/click.wav');
    this.preload('stairs', '/audio/stairs.wav');
    this.preload('deck_change', '/audio/deck_change.wav');

    this.music = new Audio('/audio/shanty.wav');
    this.music.loop = true;
    this.music.volume = 0.4;
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
    this.music?.play().catch(() => {});
  }
}

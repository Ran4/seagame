const MUSIC_STORAGE_KEY = 'seagame_sound_muted';
const SFX_STORAGE_KEY = 'seagame_sfx_muted';

type SoundEntry = {
  audio: HTMLAudioElement;
  category: 'ui' | 'world';
};

// Known shanty voice track suffixes
const VOICE_TRACKS = ['male_1', 'male_2', 'female_1', 'female_2'] as const;

export class AudioManager {
  private sounds: Map<string, SoundEntry> = new Map();
  private music: HTMLAudioElement | null = null;
  private musicStarted = false;
  private _muted: boolean;
  private _sfxMuted: boolean;
  activeDeck = 0;
  private availableShanties: string[] = [];
  private playingShantyTracks: HTMLAudioElement[] = [];
  shantyDuration = 0; // duration of current shanty in seconds (0 = unknown)

  constructor() {
    this._muted = localStorage.getItem(MUSIC_STORAGE_KEY) === '1';
    this._sfxMuted = localStorage.getItem(SFX_STORAGE_KEY) === '1';

    this.preload('click', '/audio/elevenlabs-generated/click.mp3', 'ui');
    this.preload('stairs', '/audio/elevenlabs-generated/stairs.mp3', 'ui');
    this.preload('deck_change', '/audio/elevenlabs-generated/deck_change.mp3', 'ui');
    this.preload('lantern_light', '/audio/elevenlabs-generated/lantern_light.mp3', 'world');
    this.preload('lantern_extinguish', '/audio/elevenlabs-generated/lantern_extinguish.mp3', 'world', 0.3);
    this.preload('glug_male', '/audio/elevenlabs-generated/glug_male.mp3', 'world', 0.9);
    this.preload('glug_female', '/audio/elevenlabs-generated/glug_female.mp3', 'world', 0.9);
    this.preload('kiss', '/audio/elevenlabs-generated/kiss.mp3', 'world');
    this.preload('dance_clap', '/audio/elevenlabs-generated/dance_clap.mp3', 'world', 0.5);
    this.preload('harbor_arrive', '/audio/elevenlabs-generated/harbor_arrive.mp3', 'world', 0.6);
    this.preload('tavern_brawl', '/audio/elevenlabs-generated/tavern_brawl.mp3', 'world', 0.7);
    this.preload('fist_fight', '/audio/elevenlabs-generated/fist_fight.mp3', 'world', 0.7);
    this.preload('recruit', '/audio/elevenlabs-generated/recruit.mp3', 'world', 0.8);
    this.preload('notice_board', '/audio/elevenlabs-generated/notice_board.mp3', 'ui', 0.5);
    this.preload('cat_meow', '/audio/elevenlabs-generated/cat_meow.mp3', 'world', 0.5);
    this.preload('monkey_mischief', '/audio/elevenlabs-generated/monkey_mischief.mp3', 'world', 0.5);
    this.preload('cannon_fire', '/audio/elevenlabs-generated/cannon_fire.mp3', 'world', 0.8);
    this.preload('ship_hit', '/audio/elevenlabs-generated/ship_hit.mp3', 'world', 0.7);
    this.preload('repair', '/audio/elevenlabs-generated/repair.mp3', 'world', 0.5);
    // Storm SFX (FEATURE 5). Files may not exist yet — play() tolerates missing sounds.
    this.preload('rain', '/audio/elevenlabs-generated/rain.mp3', 'world', 0.4);
    this.preload('thunder', '/audio/elevenlabs-generated/thunder.mp3', 'world', 0.8);
    this.preload('lightning', '/audio/elevenlabs-generated/lightning.mp3', 'world', 0.9);
    // Sea-monster SFX (FEATURE 6). Files may not exist yet — play() tolerates missing sounds.
    this.preload('kraken_warning', '/audio/elevenlabs-generated/kraken_warning.mp3', 'world', 0.8);
    this.preload('kraken_attack', '/audio/elevenlabs-generated/kraken_attack.mp3', 'world', 0.9);
    // Harbor trading / contracts SFX (FEATURE 7). Files may not exist yet — play() tolerates missing sounds.
    this.preload('buy', '/audio/elevenlabs-generated/buy.mp3', 'ui', 0.5);
    this.preload('sell', '/audio/elevenlabs-generated/sell.mp3', 'ui', 0.5);
    this.preload('contract_accept', '/audio/elevenlabs-generated/contract_accept.mp3', 'ui', 0.6);
    this.preload('contract_complete', '/audio/elevenlabs-generated/contract_complete.mp3', 'ui', 0.7);
    // Treasure / exploration SFX (FEATURE 8). Files may not exist yet — play() tolerates missing sounds.
    this.preload('treasure_dig', '/audio/elevenlabs-generated/treasure_dig.mp3', 'world', 0.6);
    this.preload('treasure_found', '/audio/elevenlabs-generated/treasure_found.mp3', 'world', 0.8);

    this.music = new Audio('/audio/shanty.wav');
    this.music.loop = true;
    this.music.volume = 0.4;

    this.discoverShanties();
  }

  get muted(): boolean {
    return this._muted;
  }

  get sfxMuted(): boolean {
    return this._sfxMuted;
  }

  toggleMute(): void {
    this._muted = !this._muted;
    localStorage.setItem(MUSIC_STORAGE_KEY, this._muted ? '1' : '0');
    if (this.music) {
      if (this._muted) {
        this.music.pause();
      } else if (this.musicStarted) {
        this.music.play().catch(() => {});
      }
    }
  }

  toggleSfxMute(): void {
    this._sfxMuted = !this._sfxMuted;
    localStorage.setItem(SFX_STORAGE_KEY, this._sfxMuted ? '1' : '0');
    if (this._sfxMuted) this.stopShanty();
  }

  private preload(name: string, src: string, category: 'ui' | 'world', volume = 0.5): void {
    const audio = new Audio(src);
    audio.volume = volume;
    this.sounds.set(name, { audio, category });
  }

  play(name: string, soundDeck: number): void {
    if (this._sfxMuted) return;
    const entry = this.sounds.get(name);
    if (!entry) return;
    const clone = entry.audio.cloneNode() as HTMLAudioElement;
    let volume = entry.audio.volume;
    if (entry.category === 'world') {
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

  /** Discover available shanty folders by probing for the mixed track */
  private async discoverShanties(): Promise<void> {
    const knownShanties = ['copper_beacon', 'powderwake', 'riptide_preacher', 'seaghost_steps', 'shiverin_ropes'];
    for (const name of knownShanties) {
      try {
        const resp = await fetch(`/audio/shanties/${name}/${name}__mixed.mp3`, { method: 'HEAD' });
        if (resp.ok) this.availableShanties.push(name);
      } catch { /* not available */ }
    }
  }

  /** Play a shanty with layered voice tracks based on singer composition */
  playShanty(singers: { male: number; female: number }, soundDeck: number): void {
    if (this._sfxMuted || this.availableShanties.length === 0) return;
    this.stopShanty();

    const shanty = this.availableShanties[Math.floor(Math.random() * this.availableShanties.length)];

    // Select voice tracks based on singer composition
    const tracks: string[] = [];
    if (singers.male >= 1) tracks.push('male_1');
    if (singers.male >= 2) tracks.push('male_2');
    if (singers.female >= 1) tracks.push('female_1');
    if (singers.female >= 2) tracks.push('female_2');
    // Fallback: at least one track
    if (tracks.length === 0) tracks.push('male_1');

    // Volume attenuation by deck distance
    const dist = Math.abs(soundDeck - this.activeDeck);
    const baseVolume = 0.5 * Math.pow(0.4, dist);

    for (const track of tracks) {
      const audio = new Audio(`/audio/shanties/${shanty}/${shanty}__${track}.mp3`);
      audio.volume = baseVolume;
      // Grab duration from first track
      if (this.shantyDuration === 0) {
        audio.addEventListener('loadedmetadata', () => {
          if (this.shantyDuration === 0) this.shantyDuration = audio.duration;
        });
      }
      audio.play().catch(() => {});
      this.playingShantyTracks.push(audio);
    }
  }

  /** Stop all playing shanty tracks */
  stopShanty(): void {
    for (const audio of this.playingShantyTracks) {
      audio.pause();
      audio.src = '';
    }
    this.playingShantyTracks = [];
    this.shantyDuration = 0;
  }
}

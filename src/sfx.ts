// sfx.ts - part of Squirm, a Ludum Dare 35 Entry
// (c) 2016 by Arthur Langereis — @zenmumbler

const enum SFX {
	FootStep,
	BodyDrag,
	Gore,
	FindRune,

	Scream1,
	Scream2,
	Pant,
	Insane
}


const enum Music {
	None,
	Main,
	End
}


const enum VoiceGender {
	Female,
	Male
}


class Sound {
	private assets_: SoundAssets;
	private voiceGender_ = VoiceGender.Female;
	private ctx: NativeAudioContext;

	private endMusic_ = false;

	private stepGain: GainNode;
	private musicGain: GainNode;
	private voiceGain: GainNode;
	private effectGain: GainNode;
	private shiftGain: GainNode;
	private ambienceGain: GainNode;

	private musicSource: AudioBufferSourceNode = null;
	private ambientSource: AudioBufferSourceNode = null;
	private effectSource: AudioBufferSourceNode = null;
	private voiceSource: AudioBufferSourceNode = null;

	private ambienceTimer_ = 0;
	private ambienceIndex_ = 0;

	constructor(private ac: audio.AudioContext) {
		var ctx = this.ctx = ac.ctx;

		this.stepGain = ctx.createGain();
		this.musicGain = ctx.createGain();
		this.voiceGain = ctx.createGain();
		this.effectGain = ctx.createGain();
		this.shiftGain = ctx.createGain();
		this.ambienceGain = ctx.createGain();

		this.stepGain.connect(ac.ctx.destination);
		this.musicGain.connect(ac.ctx.destination);
		this.voiceGain.connect(ac.ctx.destination);
		this.effectGain.connect(ac.ctx.destination);
		this.shiftGain.connect(ac.ctx.destination);
		this.ambienceGain.connect(ac.ctx.destination);
	}


	setAssets(assets: SoundAssets) {
		this.assets_ = assets;
	}


	setVoiceGender(newVG: VoiceGender) {
		this.voiceGender_ = newVG;
	}


	startMusic() {
		if (!this.musicSource) {
			this.musicSource = this.ac.ctx.createBufferSource();
			this.musicSource.buffer = this.endMusic_ ? this.assets_.endMusic : this.assets_.mainMusic;
			this.musicSource.loop = !this.endMusic_;
			this.musicSource.connect(this.musicGain);

			this.musicSource.start(0);
		}

		if (! this.endMusic_) {
			this.ambienceTimer_ = setInterval(() => { this.nextAmbience(); }, 16000);
		}
	}

	stopMusic() {
		if (this.endMusic_) {
			return;
		}
		if (this.musicSource) {
			this.musicSource.stop();
			this.musicSource = null;

			clearInterval(this.ambienceTimer_);
		}
	}


	setEndMusic() {
		this.endMusic_ = true;
	}


	nextAmbience() {
		if (this.ambientSource) {
			this.ambientSource.stop();
		}

		var bufferSource = this.ac.ctx.createBufferSource();
		bufferSource.buffer = this.assets_.ambienceArray[this.ambienceIndex_];
		bufferSource.connect(this.ambienceGain);
		bufferSource.start(0);

		this.ambienceIndex_ += 1;
		this.ambienceIndex_ %= this.assets_.ambienceArray.length;
	}


	play(what: SFX) {
		var assets = this.assets_;
		if (! this.ac) {
			return;
		}

		var buffer: AudioBuffer;
		var source: AudioBufferSourceNode;
		var volume = 0;

		var voiceArray = this.voiceGender_ == VoiceGender.Female ? assets.voiceFemaleArray : assets.voiceMaleArray;

		switch (what) {
			case SFX.FootStep: buffer = assets.moveStep; source = this.effectSource; volume = 1; break;
			case SFX.BodyDrag: buffer = assets.moveDrag; source = this.effectSource; volume = 1; break;
			case SFX.Gore: buffer = assets.goreArray[math.intRandomRange(0, assets.goreArray.length - 1)]; source = this.effectSource; volume = 1; break;
			case SFX.FindRune: buffer = assets.findRune; source = this.effectSource; volume = .6; break;

			case SFX.Scream1: buffer = voiceArray[0]; source = this.voiceSource; volume = 1; break;
			case SFX.Scream2: buffer = voiceArray[1]; source = this.voiceSource; volume = 1; break;
			case SFX.Pant: buffer = voiceArray[2]; source = this.voiceSource; volume = 1; break;
			case SFX.Insane: buffer = voiceArray[3]; source = this.voiceSource; volume = 1; break;

			default: buffer = null;
		}

		if (!buffer) {
			return;
		}
		if (source) {
			source.stop();
		}

		var bufferSource = this.ac.ctx.createBufferSource();
		bufferSource.buffer = buffer;
		bufferSource.connect(this.effectGain);
		bufferSource.start(0);
		this.effectGain.gain.value = volume;

		if (what < SFX.Scream1) {
			this.effectSource = bufferSource;
		}
		else {
			this.voiceSource = bufferSource;
		}

		bufferSource.onended = () => {
			if (what < SFX.Scream1) {
				if (this.effectSource == bufferSource) {
					this.effectSource = null;
				}
			}
			else {
				if (this.voiceSource == bufferSource) {
					this.voiceSource = null;
				}
			}

			bufferSource.disconnect();
			bufferSource = null;
		};

	}
}

// player.ts - part of Squirm, a Ludum Dare 35 Entry
// (c) 2016 by Arthur Langereis — @zenmumbler

const LEVEL_SCALE_XZ = 4;
const LEVEL_SCALE_Y = 2.5;


const enum Direction {
	South,
	East,
	North,
	West
}


const enum EdgeMask {
	Left = 1,
	Top = 2
}


const enum WallProp {
	None,
	Crawl,
	Window
}


interface EdgeInfo {
	wall: boolean;
	prop: WallProp;
}


class Level {
	width: number;
	height: number;
	edges: asset.TMXLayer;
	specialEdges: asset.TMXLayer;

	load(level: number) {
		var tmx = new asset.TMXData();
		return tmx.load("data/level" + level + ".tmx").then(data => {
			this.width = data.width;
			this.height = data.height;
			this.edges = data.layers["walls"];
			this.specialEdges = data.layers["special"];
			return this;
		});
	}

	getEdgeInfo(position: sd.Float2, facing: Direction): EdgeInfo {
		if (facing == Direction.East) {
			position[0] += 1;
			facing = Direction.West;
		}
		else if (facing == Direction.South) {
			position[1] += 1;
			facing = Direction.North;
		}

		var edge = this.edges.tileAt(position[0], position[1]);
		var special = this.specialEdges.tileAt(position[0], position[1]);
		edge = Math.max(0, edge - 1);
		special = Math.max(0, special - 16 - 1);
		var specialType = special >> 2;

		if (facing == Direction.West) {
			return {
				wall: (edge & EdgeMask.Left) != 0,
				prop: (special & EdgeMask.Left) ? (specialType + 1) : WallProp.None
			};
		}
		else {
			return {
				wall: (edge & EdgeMask.Top) != 0,
				prop: (special & EdgeMask.Top) ? (specialType + 1) : WallProp.None
			};
		}
	}
}


// -----


const enum PlayerMode {
	Idle,
	TurnLeft,
	TurnRight,
	Forward,
	Reverse,
	Shrink,
	Expand
}


function angleForDirection(dir: Direction) {
	return <number>dir * Math.PI / 2;
}


function easeInOut(t: number) {
	t *= 2;
	if (t < 1) return .5 * t * t;
	t -= 1;
	return -.5 * (t * (t - 2) - 1);
}


class PlayerController {
	private mode_ = PlayerMode.Idle;
	private modeStartT_ = 0;
	private modeDuration_ = 1;

	private level_: Level = null;
	private metalDoors_: MetalDoors = null;
	private posCallback_: (x: number, z: number) => void = null;
	private posCheckCallback_: (x: number, z: number) => boolean = null;

	private playerFacing_ = Direction.North;
	private targetFacing_ = Direction.North;
	private playerAngleZ_ = 0;
	private playerAngleY_ = Math.PI;
	private playerAngleX_ = 0;
	private playerHeight_ = 1.3;

	private playerAngleDyn_ = [0,0,0];

	private playerPos_ = [0, 0];
	private targetPos_ = [0, 0];


	private hasRune_ = false;
	
	constructor(private transformMgr_: world.TransformManager, private sfx_: Sound, private player_: world.TransformInstance) {
	}

	useLevel(level: Level) {
		this.level_ = level;
	}

	useMetalDoors(metalDoors: MetalDoors) {
		this.metalDoors_ = metalDoors;
	}

	private worldPosForTilePos(tilePos: sd.Float2) {
		return [(tilePos[0] + .6) * LEVEL_SCALE_XZ, this.playerHeight_, (tilePos[1] + .6) * LEVEL_SCALE_XZ];
	}

	setPosition(tileX: number, tileY: number) {
		vec2.set(this.playerPos_, tileX, tileY);
		this.transformMgr_.setPositionAndRotation(this.player_, this.worldPosForTilePos(this.playerPos_), this.rotation);
	}

	setBend(bend: number) {
		this.playerAngleX_ = (Math.PI / 12) * math.clamp(bend, -1, 1);
	}

	get rotation() {
		return quat.fromEuler(this.playerAngleZ_, this.playerAngleY_, this.playerAngleX_);
	}

	get direction() {
		var dir3 = vec3.transformQuat([], [0, 0, 1], this.rotation);
		return [Math.round(dir3[0]), Math.round(dir3[2])];
	}

	setPosCallback(fn: (x: number, z: number) => void) {
		this.posCallback_ = fn;
	}

	setPosCheckCallback(fn: (x: number, z: number) => boolean) {
		this.posCheckCallback_ = fn;
	}


	private actOnPosition(pos: sd.Float2) {
		if (pos[0] == 12 && pos[1] == 10) {
			this.metalDoors_.close(11, 12);	// force rune use after getting it
		}
		else if (pos[0] == 2 && pos[1] == 8) {
			this.metalDoors_.close(2, 10);	// seal off initial area
		}
		else if (pos[0] == 13 && pos[1] == 8) {
			this.metalDoors_.close(13, 8);	// trap
		}
		else if (pos[0] == 0 && pos[1] == 1) {
			this.metalDoors_.close(0, 1);	// prison
		}
		else if (pos[0] == 14 && pos[1] == 10) {
			if (! this.hasRune_) {
				this.hasRune_ = true;
				this.sfx_.play(SFX.FindRune);
			}
		}

		if (this.posCallback_) {
			this.posCallback_(pos[0], pos[1]);
		}
	}


	get isSmall() {
		return this.playerHeight_ < 0.5;
	}

	get hasRune() {
		return this.hasRune_;
	}


	trySetMode(newMode: PlayerMode) {
		if (! this.level_) {
			return;
		}

		if (this.mode_ != PlayerMode.Idle) {
			return;
		}

		if (newMode == PlayerMode.Shrink || newMode == PlayerMode.Expand) {
			if (! this.hasRune_) {
				return;
			}
		}

		var edgeInfo: EdgeInfo;
		if (newMode == PlayerMode.Forward) {
			edgeInfo = this.level_.getEdgeInfo(vec2.clone(this.playerPos_), this.playerFacing_);
		}
		else if (newMode == PlayerMode.Reverse) {
			edgeInfo = this.level_.getEdgeInfo(vec2.clone(this.playerPos_), (this.playerFacing_ + 2) % 4);
		}
		if (edgeInfo && edgeInfo.wall) {
			if (edgeInfo.prop == WallProp.Crawl) {
				if (this.playerHeight_ > 0.4) {
					// show message about crawling
					return;
				}
			}
			else {
				return;
			}
		}

		this.mode_ = newMode;
		this.modeStartT_ = sd.defaultRunLoop.globalTime;

		if (newMode == PlayerMode.TurnLeft) {
			this.modeDuration_ = .4;
			this.targetFacing_ = (this.playerFacing_ + 1) % 4;
		}
		else if (newMode == PlayerMode.TurnRight) {
			this.modeDuration_ = .4;
			this.targetFacing_ = (this.playerFacing_ - 1 + 4) % 4;
		}
		else if (newMode == PlayerMode.Forward) {
			vec2.add(this.targetPos_, this.playerPos_, this.direction);

			if (! this.posCheckCallback_(this.targetPos_[0], this.targetPos_[1])) {
				this.mode_ = PlayerMode.Idle;
				return;
			}


			if (this.playerHeight_ > 0.5) {
				this.modeDuration_ = .8;
				setTimeout(() => { this.sfx_.play(SFX.FootStep); }, 200);
				setTimeout(() => { this.sfx_.play(SFX.FootStep); }, 600);
			}
			else {
				this.modeDuration_ = 1.3;
				setTimeout(() => { this.sfx_.play(SFX.BodyDrag); }, 200);
			}
		}
		else if (newMode == PlayerMode.Reverse) {
			vec2.scaleAndAdd(this.targetPos_, this.playerPos_, this.direction, -1);

			if (! this.posCheckCallback_(this.targetPos_[0], this.targetPos_[1])) {
				this.mode_ = PlayerMode.Idle;
				return;
			}

			if (this.playerHeight_ > 0.5) {
				this.modeDuration_ = .9;
				setTimeout(() => { this.sfx_.play(SFX.FootStep); }, 250);
				setTimeout(() => { this.sfx_.play(SFX.FootStep); }, 700);
			}
			else {
				this.modeDuration_ = 1.5;
				setTimeout(() => { this.sfx_.play(SFX.BodyDrag); }, 300);
			}
		}
		else if (newMode == PlayerMode.Shrink) {
			this.modeDuration_ = 5;
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 800);
			setTimeout(() => { this.sfx_.play(SFX.Scream1); }, 1000);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 1050);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 1300);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 1900);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 2400);
			setTimeout(() => { this.sfx_.play(SFX.Scream2); }, 2500);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 2750);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 3600);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 4400);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 4650);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 4800);

			setTimeout(() => { this.sfx_.play(SFX.Pant); }, 5300);
		}
		else if (newMode == PlayerMode.Expand) {
			this.modeDuration_ = 5;
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 800);
			// setTimeout(() => { this.sfx_.play(SFX.Scream1); }, 1000);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 1050);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 1300);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 1900);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 2400);
			setTimeout(() => { this.sfx_.play(SFX.Scream2); }, 2500);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 2750);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 3600);

			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 4400);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 4650);
			setTimeout(() => { this.sfx_.play(SFX.Gore); }, 4800);

			setTimeout(() => { this.sfx_.play(SFX.Pant); }, 5300);
		}
	}


	private getShrinkParams(t: number) {
		var fromAngles: sd.Float3 = null;
		var toAngles: sd.Float3 = null;
		var fromHeight = -1;
		var toHeight = -1;

		if (t >= .2 && t <= .3) {
			t -= .2; t *= 10;
			fromAngles = [0,0,0];
			toAngles = [math.deg2rad(5), math.deg2rad(-10), math.deg2rad(15)];
			fromHeight = 1.3;
			toHeight = 1.0;
		}
		else if (t >= .5 && t <= .6) {
			t -= .5; t *= 10;
			fromAngles = [math.deg2rad(5), math.deg2rad(-10), math.deg2rad(15)];
			toAngles = [math.deg2rad(-7), math.deg2rad(4), math.deg2rad(-4)];
			fromHeight = 1.0;
			toHeight = .8;
		}
		else if (t >= .9) {
			t -= .9; t *= 10;
			fromAngles = [math.deg2rad(-7), math.deg2rad(4), math.deg2rad(-4)];
			toAngles = [0,0,0];
			fromHeight = .8;
			toHeight = .25;
		}

		if (fromAngles) {
			return {
				t: t,
				b: fromAngles,
				e: toAngles,
				h: fromHeight + ((toHeight - fromHeight) * easeInOut(t))
			};
		}
		return null;
	}


	private getExpandParams(t: number) {
		var fromAngles: sd.Float3 = null;
		var toAngles: sd.Float3 = null;
		var fromHeight = -1;
		var toHeight = -1;

		if (t >= .2 && t <= .3) {
			t -= .2; t *= 10;
			fromAngles = [0,0,0];
			toAngles = [math.deg2rad(5), math.deg2rad(-10), math.deg2rad(15)];
			fromHeight = .25;
			toHeight = .4;
		}
		else if (t >= .5 && t <= .6) {
			t -= .5; t *= 10;
			fromAngles = [math.deg2rad(5), math.deg2rad(-10), math.deg2rad(15)];
			toAngles = [math.deg2rad(-7), math.deg2rad(4), math.deg2rad(-4)];
			fromHeight = .4;
			toHeight = .95;
		}
		else if (t >= .9) {
			t -= .9; t *= 10;
			fromAngles = [math.deg2rad(-7), math.deg2rad(4), math.deg2rad(-4)];
			toAngles = [0,0,0];
			fromHeight = .95;
			toHeight = 1.3;
		}

		if (fromAngles) {
			return {
				t: t,
				b: fromAngles,
				e: toAngles,
				h: fromHeight + ((toHeight - fromHeight) * easeInOut(t))
			};
		}
		return null;
	}


	step(_timeStep: number) {
		if (this.mode_ == PlayerMode.Idle) {
			return;
		}

		var ratio = math.clamp01((sd.defaultRunLoop.globalTime - this.modeStartT_) / this.modeDuration_);

		switch (this.mode_) {
			case PlayerMode.TurnLeft:
			case PlayerMode.TurnRight:
				ratio = easeInOut(ratio);
				var angleFrom = angleForDirection(this.playerFacing_);
				var angleTo = angleForDirection(this.targetFacing_);
				if (angleTo - angleFrom > Math.PI / 1.99) {
					angleTo -= Math.PI * 2;
				}
				else if (angleTo - angleFrom < -Math.PI / 1.99) {
					angleTo += Math.PI * 2;
				}

				this.playerAngleY_ = angleFrom + ((angleTo - angleFrom) * ratio);
				this.transformMgr_.setRotation(this.player_, this.rotation);
				break;

			case PlayerMode.Forward:
			case PlayerMode.Reverse:
				// if (ratio <= .5) {
				// 	ratio = .5 * easeInOut(ratio * 2);
				// }
				// else {
				// 	ratio = .5 + (.5 * easeInOut((ratio - .5) * 2));
				// }
				var interpPos = vec2.lerp([], this.playerPos_, this.targetPos_, ratio);
				this.transformMgr_.setPosition(this.player_, this.worldPosForTilePos(interpPos));
				break;


			case PlayerMode.Shrink:
			case PlayerMode.Expand:
				var sp = this.mode_ == PlayerMode.Shrink ? this.getShrinkParams(ratio) : this.getExpandParams(ratio);
				if (sp) {
					vec3.lerp(this.playerAngleDyn_, sp.b, sp.e, sp.t);
					var q = quat.lerp([], quat.fromEuler.apply(quat, sp.b), quat.fromEuler.apply(quat, sp.e), sp.t);
					quat.mul(q, q, this.rotation);

					this.playerHeight_ = sp.h;
					this.transformMgr_.setPositionAndRotation(this.player_, this.worldPosForTilePos(this.playerPos_), q);
				}
				break;

			default:
				break;
		}

		if (ratio >= 1) {
			switch (this.mode_) {
				case PlayerMode.TurnLeft:
				case PlayerMode.TurnRight:
					this.playerFacing_ = this.targetFacing_;
					break;
				case PlayerMode.Forward:
				case PlayerMode.Reverse:
					vec2.copy(this.playerPos_, this.targetPos_);
					this.actOnPosition(this.playerPos_);
					break;
				case PlayerMode.Shrink:
				case PlayerMode.Expand:
					vec3.set(this.playerAngleDyn_, 0,0,0);
					break;
				default:
					break;
			}

			this.mode_ = PlayerMode.Idle;
		}
	}

	get viewMatrix() {
		var worldPos = this.transformMgr_.worldPosition(this.player_);
		var dir = vec3.rotateZ([], vec3.rotateY([], vec3.rotateX([], [0, 0, 1], [0, 0, 0], this.playerAngleX_ + this.playerAngleDyn_[0]), [0,0,0], this.playerAngleY_ + this.playerAngleDyn_[1]), [0,0,0], this.playerAngleZ_ + this.playerAngleDyn_[2]);
		return mat4.lookAt([], worldPos, vec3.add([], worldPos, dir), [0, 1, 0]);
	}
}

// Squirm, a Ludum Dare 35 Entry
// (c) 2016 by Arthur Langereis — @zenmumbler

/// <reference path="../../stardazed/dist/stardazed.d.ts" />
/// <reference path="flycam.ts" />
/// <reference path="asset.ts" />
/// <reference path="player.ts" />
/// <reference path="sfx.ts" />

import io = sd.io;
import math = sd.math;
import world = sd.world;
import render = sd.render;
import meshdata = sd.meshdata;
import dom = sd.dom;
import asset = sd.asset;
import container = sd.container;
import audio = sd.audio;

import vec2 = veclib.vec2;
import vec3 = veclib.vec3;
import vec4 = veclib.vec4;
import quat = veclib.quat;
import mat4 = veclib.mat4;


interface FSQPipeline {
	pipeline: render.Pipeline;
	texUniform: WebGLUniformLocation;
}

function makeFSQPipeline(rc: render.RenderContext) {
	const pfp = {} as FSQPipeline;

	const vertexSource = `
		attribute vec2 vertexPos_model;
		varying vec2 vertexUV_intp;
		void main() {
			gl_Position = vec4(vertexPos_model, 0.5, 1.0);
			vertexUV_intp = vertexPos_model * 0.5 + 0.5;
		}
	`.trim();

	const fragmentSource = `
		precision highp float;
		varying vec2 vertexUV_intp;
		uniform sampler2D texSampler;
		void main() {
			vec3 texColor = texture2D(texSampler, vertexUV_intp).xyz;
			gl_FragColor = vec4(texColor, 1.0);
		}
	`.trim();

	// -- pipeline
	const pld = render.makePipelineDescriptor();
	pld.vertexShader = render.makeShader(rc, rc.gl.VERTEX_SHADER, vertexSource);
	pld.fragmentShader = render.makeShader(rc, rc.gl.FRAGMENT_SHADER, fragmentSource);
	pld.attributeNames.set(meshdata.VertexAttributeRole.Position, "vertexPos_model");

	pfp.pipeline = new render.Pipeline(rc, pld);
	pfp.texUniform = rc.gl.getUniformLocation(pfp.pipeline.program, "texSampler")!;

	// -- invariant uniform
	pfp.pipeline.bind();
	rc.gl.uniform1i(pfp.texUniform, 0);
	pfp.pipeline.unbind();

	return pfp;
}

function drawFSQ(rc: render.RenderContext, meshMgr: world.MeshManager, tex: render.Texture, p: FSQPipeline, m: world.MeshInstance) {
	const rpd = render.makeRenderPassDescriptor();
	rpd.clearMask = render.ClearMask.Colour;

	render.runRenderPass(rc, meshMgr, rpd, null, (rp) => {
		rp.setPipeline(p.pipeline);
		rp.setTexture(tex, 0);
		rp.setMesh(m);
		rp.setDepthTest(render.DepthTest.Disabled);

		// render quad without any transforms, filling full FB
		const primGroup0 = meshMgr.primitiveGroups(m)[0];
		rp.drawIndexedPrimitives(primGroup0.type, meshMgr.indexBufferElementType(m), 0, primGroup0.elementCount);
	});
}


const enum GameMode {
	None,
	Loading,
	Title,
	Start,
	Main,
	Shift,
	End
}


const enum KeyboardType {
	QWERTY,
	QWERTZ,
	AZERTY
}


const enum KeyCommand {
	Forward,
	Backward,
	Left,
	Right,
	Use
}


class Messages {
	private static curTimer_ = 0;

	static show(msg: string) {
		if (this.curTimer_ != 0) {
			clearTimeout(this.curTimer_);
		}

		this.curTimer_ = setTimeout(() => {
			dom.$1(".messages p").textContent = msg;
			dom.show(".messages");
			this.curTimer_ = setTimeout(() => {
				this.curTimer_ = 0;
				dom.hide(".messages");
			}, 4500);
		}, 500);
	}
}


interface MetalDoor {
	tx: world.TransformInstance;
	x: number;
	z: number;
	up: boolean;
	closed: boolean;
}


class MetalDoors {
	private doors = new Map<number, MetalDoor>();

	constructor(private scene: world.Scene, private assets: Assets, private level: Level) {
	}

	add(x: number, z: number, up: boolean, startClosed: boolean) {
		var key = (x * 100) + z;

		var y = startClosed ? 0 : LEVEL_SCALE_Y * 2;
		var door = this.scene.makeEntity({
			transform: { position: [x * LEVEL_SCALE_XZ + 0.015, y, z * LEVEL_SCALE_XZ + 0.015], scale: [LEVEL_SCALE_XZ / 2, LEVEL_SCALE_Y / 2, LEVEL_SCALE_XZ / 2] },
			mesh: this.assets.mesh.wallMeshes[up ? 2 : 1],
			stdModel: { materials: [this.assets.mat.metalDoor] },
		});
		this.doors.set(key, { tx: door.transform, x: x, z: z, up: up, closed: startClosed });

		if (startClosed) {
			var edge = this.level.edges.tileAt(x, z) - 1;
			if (up) {
				edge |= EdgeMask.Top;
			}
			else {
				edge |= EdgeMask.Left;
			}
			this.level.edges.setTileAt(x, z, edge + 1);
		}
	}

	open(x: number, z: number) {
		var key = (x * 100) + z;
		var info = this.doors.get(key);
		if (! info) return false;
		if (!info.closed) return false;
		info.closed = true;

		var edge = this.level.edges.tileAt(x, z) - 1;
		if (info.up) {
			edge &= ~EdgeMask.Top;
		}
		else {
			edge &= ~EdgeMask.Left;
		}
		this.level.edges.setTileAt(x, z, edge + 1);

		var pos = this.scene.transformMgr.localPosition(info.tx);
		pos[1] = LEVEL_SCALE_Y * 2;
		this.scene.transformMgr.setPosition(info.tx, pos);

		return true;
	}


	close(x: number, z: number) {
		var key = (x * 100) + z;
		var info = this.doors.get(key);
		if (! info) return false;
		if (info.closed) return false;
		info.closed = false;

		var edge = this.level.edges.tileAt(x, z) - 1;
		if (info.up) {
			edge |= EdgeMask.Top;
		}
		else {
			edge |= EdgeMask.Left;
		}
		this.level.edges.setTileAt(x, z, edge + 1);

		var pos = this.scene.transformMgr.localPosition(info.tx);
		pos[1] = 0;
		this.scene.transformMgr.setPosition(info.tx, pos);

		return true;
	}
}


class MainScene implements sd.SceneController {
	private scene_: world.Scene;

	private flyCam_: FlyCamController;
	private playerController_: PlayerController = null;

	private player_: world.EntityInfo;
	private spotLight_: world.EntityInfo;

	private mousePosRel_ = [0.5, 0.5];
	private mode_ = GameMode.None;
	private keyboardType_ = KeyboardType.QWERTY;

	private sfx_: Sound;
	private level_: Level;
	private metalDoors_: MetalDoors = null;

	private runeEnt_: world.EntityInfo;

	private debrisPiles_: number[] = [];

	private floorMat_: asset.Material | null = null;


	constructor(private rc: render.RenderContext, private ac: audio.AudioContext) {
		this.scene_ = new world.Scene(rc);
		this.sfx_ = new Sound(ac);

		this.flyCam_ = new FlyCamController(rc.gl.canvas, [9, 1.3, 17]);

		this.setMode(GameMode.Loading);
		this.createScene();
	}


	createScene() {
		const scene = this.scene_;
		const ltm = scene.lightMgr;
		const rc = this.rc;
		const ac = this.ac;

		this.player_ = scene.makeEntity();

		this.playerController_ = new PlayerController(scene.transformMgr, this.sfx_, this.player_.transform);
		this.playerController_.setPosition(7, 14);


		// -- player-attached light
		const spot = this.scene_.makeEntity({
			parent: this.player_.transform,
			transform: { position: [-0.3, -0.2, 0.3] },
			light: {
				name: "player-spotlight",
				type: asset.LightType.Spot,
				colour: [0.8, 0.8, 1],
				intensity: 1.5,
				range: 3.5 * LEVEL_SCALE_XZ,
				cutoff: math.deg2rad(22),
				shadowType: asset.ShadowType.Hard,
				shadowStrength: 1,
				shadowBias: 0.04
			}
		});
		ltm.setDirection(spot.light, [0, 0, 1]);
		// ltm.setEnabled(spot.light, false);
		this.spotLight_ = spot;
		scene.stdModelMgr.setShadowCaster(spot.light);

		const omni = this.scene_.makeEntity({
			parent: this.player_.transform,
			transform: { position: [0, 0, 0] },
			light: {
				name: "player-omnilight",
				type: asset.LightType.Point,
				colour: [1, 1, 1],
				intensity: 0.1,
				range: 3 * LEVEL_SCALE_XZ,
			}
		});
		ltm.setEnabled(omni.light, true);


		// -----

		var progress = (ratio: number) => {
			dom.$1(".progress").style.width = (ratio * 100) + "%";
		};

		loadAllAssets(rc, ac, progress).then((assets: Assets) => {
			this.sfx_.setAssets(assets.sound);

			console.info("ASSETS", assets);
			this.floorMat_ = assets.mat.floor;

			this.level_ = new Level();
			this.level_.load(1).then(l => {
				this.metalDoors_ = new MetalDoors(scene, assets, l);
				this.playerController_.useLevel(l);
				this.playerController_.useMetalDoors(this.metalDoors_);

				// the wall segments, combined into 1 static mesh
				var staticWallsPerType: meshdata.gen.TransformedMeshGen[][] = [[], [], [], []];
				var wallLongDim = LEVEL_SCALE_XZ;
				var wallShortDim = LEVEL_SCALE_XZ * .2;
				var wallHeight = LEVEL_SCALE_Y;
				var halfWallLong = wallLongDim / 2;
				var halfWallShort = wallShortDim / 2;
				var halfWallHeight = wallHeight / 2;

				l.edges.eachTile((row, col, tile) => {
					tile = Math.max(0, tile - 1);
					var wallMask = tile & 3;

					var special = Math.max(0, l.specialEdges.tileAt(col, row) - 16 - 1);
					var specialMask = special & 3;
					var specialType = special >> 2;
					var yAdjust = 0;
					if (specialType == 0) {
						yAdjust = 0.4;
					}
					else if (specialType == 1) {
						yAdjust = -1.5;
					}
					var y = 0;

					if (wallMask & EdgeMask.Left) {
						y = (specialMask & EdgeMask.Left) ? yAdjust : 0;

						staticWallsPerType[tile >> 2].push({
							generator: new meshdata.gen.Box({ width: wallShortDim, height: wallHeight, depth: wallLongDim, inward: false }),
							translation: [
								halfWallShort + (col * wallLongDim),
								halfWallHeight + y,
								halfWallLong + (row * wallLongDim) + 0.01
							]
						});

						if (specialType == 1) {
							staticWallsPerType[tile >> 2].push({
								generator: new meshdata.gen.Box({ width: wallShortDim, height: wallHeight, depth: wallLongDim, inward: false }),
								translation: [
									halfWallShort + (col * wallLongDim),
									halfWallHeight + 1.8,
									halfWallLong + (row * wallLongDim) + 0.01
								]
							});
						}
					}
					if (wallMask & EdgeMask.Top) {
						y = (specialMask & EdgeMask.Top) ? yAdjust : 0;

						staticWallsPerType[tile >> 2].push({
							generator: new meshdata.gen.Box({ width: wallLongDim, height: wallHeight, depth: wallShortDim, inward: false }),
							translation: [
								halfWallLong + (col * wallLongDim) + 0.01,
								halfWallHeight + y,
								halfWallShort + (row * wallLongDim)
							]
						});

						if (specialType == 1) {
							staticWallsPerType[tile >> 2].push({
								generator: new meshdata.gen.Box({ width: wallLongDim, height: wallHeight, depth: wallShortDim, inward: false }),
								translation: [
									halfWallLong + (col * wallLongDim) + 0.01,
									halfWallHeight + 1.8,
									halfWallShort + (row * wallLongDim)
								]
							});
						}
					}
				});

				// walls
				for (var staticWallsIx = 0; staticWallsIx < staticWallsPerType.length; ++staticWallsIx) {
					var staticWalls = staticWallsPerType[staticWallsIx];
					if (staticWalls.length > 0) {
						var wallsMD = meshdata.gen.generate(staticWalls, meshdata.AttrList.Pos3Norm3UV2());
						scene.makeEntity({
							transform: { position: [0, 0, 0] },
							mesh: { name: "allWalls", meshData: wallsMD },
							stdModel: { materials: [assets.mat.wallArray[staticWallsIx]] },
						});
					}
				}

				// metal doors
				this.metalDoors_.add(7, 12, true, true);	// initial area block
				this.metalDoors_.add(11, 12, true, false);	// block exit after rune
				this.metalDoors_.add(2, 10, true, false);	// block starting area
				this.metalDoors_.add(0, 1, true, false);	// block prison
				this.metalDoors_.add(13, 8, false, false);	// trap

				// the floor and ceiling
				var floorCeilMD = meshdata.gen.generate(new meshdata.gen.Box({ width: l.width * LEVEL_SCALE_XZ, depth: l.height * LEVEL_SCALE_XZ, height: 0.1, inward: false }));
				var floorCeilMesh: asset.Mesh = { name: "floorCeil", meshData: floorCeilMD };

				// adjust floor and ceiling tiling
				assets.mat.floor.textureScale = [l.width * LEVEL_SCALE_XZ, l.height * LEVEL_SCALE_XZ];
				assets.mat.ceiling.textureScale = [l.width * LEVEL_SCALE_XZ / 2, l.height * LEVEL_SCALE_XZ / 2];

				scene.makeEntity({
					transform: { position: [(l.width * LEVEL_SCALE_XZ) / 2, -0.05, (l.height * LEVEL_SCALE_XZ) / 2] },
					mesh: floorCeilMesh,
					stdModel: { materials: [assets.mat.floor] }
				});
				scene.makeEntity({
					transform: { position: [(l.width * LEVEL_SCALE_XZ) / 2, LEVEL_SCALE_Y + 0.05, (l.height * LEVEL_SCALE_XZ) / 2] },
					mesh: floorCeilMesh,
					stdModel: { materials: [assets.mat.ceiling] }
				});


				// rune
				this.runeEnt_ = scene.makeEntity({
					transform: { position: [14.5 * LEVEL_SCALE_XZ, LEVEL_SCALE_Y / 2, 10.6 * LEVEL_SCALE_XZ] },
					mesh: assets.mesh.rune,
					stdModel: { materials: assets.mat.runeArray }
				});


				this.playerController_.setPosCallback((x: number, z: number) => {
					if (x == 14 && z == 10) {
						scene.stdModelMgr.setEnabled(this.runeEnt_.stdModel, false);
						Messages.show("Press `E` to use the Rune when not moving");
					}
					else if (x == 0 && z == 1) {
						if (this.mode_ != GameMode.End) {
							this.setMode(GameMode.End);
						}
					}
				});


				var placeDebris = (x: number, z: number) => {
					var key = (x * 100) + z;
					this.debrisPiles_.push(key);

					var gent = scene.makeEntity({
						transform: {
							position: [(x + .5) * LEVEL_SCALE_XZ, .3, (z + .5) * LEVEL_SCALE_XZ],
							scale: [3,3,3]
						},
						mesh: assets.mesh.gold,
						stdModel: { materials: [assets.mat.gold] }
					});

					setInterval(() => {
						this.scene_.transformMgr.setRotation(gent.transform, quat.setAxisAngle([], [0,1,0], sd.defaultRunLoop.globalTime / 1.68));
					}, 16);
				};

				// for (var yy = 0; yy < 15; ++yy) {
				// 	for (var xx = 0; xx < 15; ++xx) {
				// 		placeDebris(xx, yy);
				// 	}
				// }

				placeDebris(7.1, 12.7);

				this.playerController_.setPosCheckCallback((x: number, z: number) => {
					if (this.playerController_.isSmall) {
						var key = (x * 100) + z;
						return this.debrisPiles_.indexOf(key) == -1;
					}

					return true;
				});


				this.setMode(GameMode.Title);
			});
		});


		var canvasOX = -1;
		var canvasOY = -1;

		dom.on(window, "mousemove", (evt: MouseEvent) => {
			if (canvasOX < 0) {
				var stageHolder = dom.$1("div.stageholder");
				canvasOX = stageHolder.offsetLeft;
				canvasOY = stageHolder.offsetTop;
			}

			this.mousePosRel_ = <number[]>vec2.mul([], [evt.pageX - canvasOX, evt.pageY - canvasOY], [1 / this.rc.gl.canvas.width, 1 / this.rc.gl.canvas.height]);
			vec2.scaleAndAdd(this.mousePosRel_, [-1, -1, -1], this.mousePosRel_, 2);

			const twistAngleX = this.mousePosRel_[1] * math.deg2rad(25);
			const twistAngleY = -(this.mousePosRel_[0] - 0.4) * math.deg2rad(30);
			const newDir = vec3.rotateY([], vec3.rotateX([], [0, 0, 1], [0, 0, 0], twistAngleX), [0, 0, 0], twistAngleY);
			ltm.setDirection(this.spotLight_.light, newDir);

			var bendFactor = math.clamp(this.mousePosRel_[1], -1, 1);
			if (Math.abs(bendFactor) < 0.75) {
				bendFactor = 0;
			}
			else {
				bendFactor = 4 * Math.sign(bendFactor) * (Math.abs(bendFactor) - .75);
			}
			this.playerController_.setBend(Math.sign(bendFactor) * easeInOut(bendFactor));
		});

		dom.on(".butan", "click", (evt: MouseEvent) => {
			var tgt = <HTMLElement>evt.target;
			if (tgt.classList.contains("begin")) {
				this.setMode(GameMode.Start);
				this.metalDoors_.open(7, 12);
				return;
			}

			var multi = dom.closest(tgt, ".multi");
			var group = tgt.dataset["key"];
			var value = tgt.dataset["value"];

			dom.$(".butan", multi).forEach((b: HTMLElement) => b.classList.remove("pres"));
			tgt.classList.add("pres");

			if (group == "voice") {
				this.sfx_.setVoiceGender(value == "female" ? VoiceGender.Female : VoiceGender.Male);
			}
			else if (group == "keyboard") {
				this.keyboardType_ = ["qwerty", "qwertz", "azerty"].indexOf(value);
				dom.$1("#wasd").textContent = (value == "azerty") ? "ZQSD" : "WASD";
			}
			else if (group == "viewport") {
				canvasOX = canvasOY = -1;
				if (value == "fullhd") {
					dom.$1(".stageholder").classList.remove("tiny");
					dom.$1(".stageholder").classList.add("fullhd");
					rc.gl.canvas.width = 1920;
					rc.gl.canvas.height = 1080;
				}
				else if (value == "tiny") {
					dom.$1(".stageholder").classList.remove("fullhd");
					dom.$1(".stageholder").classList.remove("tiny");
					rc.gl.canvas.width = 960;
					rc.gl.canvas.height = 540;
				}
				else {
					dom.$1(".stageholder").classList.remove("fullhd");
					rc.gl.canvas.width = 1280;
					rc.gl.canvas.height = 720;
				}
			}
		});
	}


	resume() {
		if (this.mode_ >= GameMode.Title) {
			this.sfx_.startMusic();
		}
	}


	suspend() {
		if (this.mode_ >= GameMode.Title) {
			this.sfx_.stopMusic();
		}
	}


	setMode(newMode: GameMode) {
		dom.hide(".loading");
		dom.hide(".titles");

		if (newMode == GameMode.Loading) {
			dom.show(".loading");
		}
		else if (newMode == GameMode.Title) {
			dom.show("canvas");
			dom.show(".titles");
			this.sfx_.startMusic();
		}
		else if (newMode == GameMode.End) {
			this.sfx_.stopMusic();
			setTimeout(() => {
				this.sfx_.play(SFX.Insane);
			}, 4000);
			setTimeout(() => {
				this.sfx_.setEndMusic();
				this.sfx_.startMusic();
			}, 8000);
		}
		else {
		}

		this.mode_ = newMode;
	}


	fullQuad: world.MeshInstance = 0;
	quadPipeline?: FSQPipeline;

	SHADQUAD = false;

	downsample128: render.FilterPass;
	downsample64: render.FilterPass;
	boxFilter: render.FilterPass;

	renderFrame(_timeStep: number) {
		if (! this.downsample128) {
			this.downsample128 = render.resamplePass(this.rc, this.scene_.meshMgr, 512);
			this.downsample64 = render.resamplePass(this.rc, this.scene_.meshMgr, 256);
			this.boxFilter = render.boxFilterPass(this.rc, this.scene_.meshMgr, 256);
		}

		var drawCalls = 0;
		// -- shadow pass
		var spotShadow: world.ShadowView = null;
		const shadowCaster = this.scene_.stdModelMgr.shadowCaster();

		if (shadowCaster && this.runeEnt_) {
			const rpdShadow = render.makeRenderPassDescriptor();
			rpdShadow.clearMask = render.ClearMask.ColourDepth;
			vec4.set(rpdShadow.clearColour, 1, 1, 1, 1);

			spotShadow = this.scene_.lightMgr.shadowViewForLight(this.rc, this.spotLight_.light, .1);
			if (spotShadow) {
				render.runRenderPass(this.rc, this.scene_.meshMgr, rpdShadow, spotShadow.shadowFBO, (renderPass) => {
					renderPass.setDepthTest(render.DepthTest.Less);
					renderPass.setFaceCulling(render.FaceCulling.Back);

					// const shadowy = new world.InstanceArrayRange<world.StdModelManager>([this.runeEnt_.stdModel!]);
					drawCalls += this.scene_.stdModelMgr.draw(this.scene_.stdModelMgr.all(), renderPass, spotShadow.lightProjection, null, null, world.RenderMode.Shadow);
				});

				//  filter shadow tex and set as source for shadow calcs
				this.downsample128.apply(this.rc, this.scene_.meshMgr, spotShadow.shadowFBO.colourAttachmentTexture(0)!);
				this.downsample64.apply(this.rc, this.scene_.meshMgr, this.downsample128.output);
				this.boxFilter.apply(this.rc, this.scene_.meshMgr, this.downsample64.output);
				spotShadow.filteredTexture = this.boxFilter.output;

				if (this.fullQuad === 0) {
					const quad = meshdata.gen.generate(new meshdata.gen.Quad(2, 2), [meshdata.attrPosition2(), meshdata.attrUV2()]);
					this.fullQuad = this.scene_.meshMgr.create({ name: "squareQuad", meshData: quad });
					this.quadPipeline = makeFSQPipeline(this.rc);
				}

				if (this.SHADQUAD) {
					drawFSQ(this.rc, this.scene_.meshMgr, this.boxFilter.output, this.quadPipeline!, this.fullQuad);
					// drawFSQ(this.rc, this.scene_.meshMgr, spotShadow.shadowFBO.colourAttachmentTexture(0)!, this.quadPipeline!, this.fullQuad);
				}
			}
		}

		if (this.SHADQUAD) {
			return;
		}

		// -- main forward pass
		const rpdMain = render.makeRenderPassDescriptor();
		vec4.set(rpdMain.clearColour, 0, 0, 0, 1);
		rpdMain.clearMask = render.ClearMask.ColourDepth;

		render.runRenderPass(this.rc, this.scene_.meshMgr, rpdMain, null, (renderPass) => {
			const viewport = renderPass.viewport()!;
			let camera: world.ProjectionSetup = {
				projectionMatrix: mat4.perspective([], math.deg2rad(50), viewport.width / viewport.height, 0.1, 100),
				viewMatrix: this.link_ ? this.flyCam_.cam.viewMatrix : this.playerController_.viewMatrix
			};

			this.scene_.lightMgr.prepareLightsForRender(this.scene_.lightMgr.allEnabled(), camera, renderPass.viewport()!);

			renderPass.setDepthTest(render.DepthTest.Less);
			renderPass.setFaceCulling(render.FaceCulling.Back);

			drawCalls += this.scene_.stdModelMgr.draw(this.scene_.stdModelMgr.all(), renderPass, camera, spotShadow, null, world.RenderMode.Forward);
		});

		// console.info(drawCalls);
	}


	private link_ = false;

	private keyForKeyCommand(cmd: KeyCommand): io.Key {
		var keys: io.Key[];
		switch (cmd) {
			case KeyCommand.Forward:
				keys = [io.Key.W, io.Key.W, io.Key.Z];
				break;
			case KeyCommand.Backward:
				keys = [io.Key.S, io.Key.S, io.Key.S];
				break;
			case KeyCommand.Left:
				keys = [io.Key.A, io.Key.A, io.Key.Q];
				break;
			case KeyCommand.Right:
				keys = [io.Key.D, io.Key.D, io.Key.D];
				break;
			case KeyCommand.Use:
				keys = [io.Key.E, io.Key.E, io.Key.E];
				break;
		}

		return keys[this.keyboardType_];
	}

	simulationStep(timeStep: number) {
		var txm = this.scene_.transformMgr;

		if (this.runeEnt_) {
			txm.setRotation(this.runeEnt_.transform, quat.fromEuler(0, sd.defaultRunLoop.globalTime * Math.PI / 3, math.deg2rad(10)));
		}

		if (io.keyboard.pressed(io.Key.L)) {
			// this.flyCam_.cam.pos = txm.localPosition(this.player_.transform);
			// this.link_ = !this.link_;
		}

		if (io.keyboard.pressed(io.Key.O)) {
			this.SHADQUAD = !this.SHADQUAD;
		}

		if (this.link_) {
			// this.flyCam_.step(timeStep);
			// txm.setPositionAndRotation(this.player_.transform, this.flyCam_.cam.pos, this.flyCam_.cam.rotation);
			// txm.setPosition(this.player_.transform, this.flyCam_.cam.pos);
		}
		else {
			if (io.keyboard.down(this.keyForKeyCommand(KeyCommand.Left))) {
				this.playerController_.trySetMode(PlayerMode.TurnLeft);
			}
			else if (io.keyboard.down(this.keyForKeyCommand(KeyCommand.Right))) {
				this.playerController_.trySetMode(PlayerMode.TurnRight);
			}
			else if (io.keyboard.down(this.keyForKeyCommand(KeyCommand.Forward))) {
				this.playerController_.trySetMode(PlayerMode.Forward);
			}
			else if (io.keyboard.down(this.keyForKeyCommand(KeyCommand.Backward))) {
				this.playerController_.trySetMode(PlayerMode.Reverse);
			}
			else if (io.keyboard.down(this.keyForKeyCommand(KeyCommand.Use))) {
				if (this.playerController_.isSmall)
					this.playerController_.trySetMode(PlayerMode.Expand);
				else
					this.playerController_.trySetMode(PlayerMode.Shrink);
			}

			this.playerController_ && this.playerController_.step(timeStep);
		}
	}
}


dom.on(window, "load", () => {
	// -- create managers
	var canvas = <HTMLCanvasElement>document.getElementById("stage");
	var rctx = render.makeRenderContext(canvas);
	var actx = audio.makeAudioContext();

	var testCtl = new MainScene(rctx, actx);
	sd.defaultRunLoop.sceneController = testCtl;
	sd.defaultRunLoop.start();
});

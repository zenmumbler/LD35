// asset.ts - part of Squirm, a Ludum Dare 35 Entry
// (c) 2016 by Arthur Langereis — @zenmumbler

interface SoundAssets {
	ambienceArray: AudioBuffer[];

	findRune: AudioBuffer;

	moveStep: AudioBuffer;
	moveDrag: AudioBuffer;

	mainMusic: AudioBuffer;
	endMusic: AudioBuffer;

	goreArray: AudioBuffer[];

	voiceFemaleArray: AudioBuffer[];
	voiceMaleArray: AudioBuffer[];
}


interface MaterialAssets {
	floor: asset.Material;
	ceiling: asset.Material;

	wallArray: asset.Material[];

	metalDoor: asset.Material;

	runeArray: asset.Material[];
	gold: asset.Material;
	rock: asset.Material;
	glowStone: asset.Material;
}


interface MeshAssets {
	wallMeshes: asset.Mesh[];
	rune: asset.Mesh;
	gold: asset.Mesh;
	rubble: asset.Mesh;
	glowStone: asset.Mesh;
	rocksArray: asset.Mesh[];
}


interface TextureAssets {
	wallDiffuseArray: render.Texture[];
	floorDiffuse: render.Texture;
	floorNormal: render.Texture;
	floorSpecular: render.Texture;
	ceilDiffuse: render.Texture;

	metalDoorDiffuse: render.Texture;
	metalDoorNormal: render.Texture;

	rockDiffuse: render.Texture;
}


interface Assets {
	sound: SoundAssets;
	mat: MaterialAssets;
	mesh: MeshAssets;
	tex: TextureAssets;
}


function loadAllAssets(rc: render.RenderContext, ac: audio.AudioContext, progress: (ratio: number) => void) {
	var assets: Assets = {
		sound: {
			ambienceArray: [],
			findRune: null,
			moveStep: null,
			moveDrag: null,
			mainMusic: null,
			endMusic: null,
			goreArray: [],
			voiceFemaleArray: [],
			voiceMaleArray: []
		},
		mat: {
			wallArray: [],
			floor: null,
			ceiling: null,
			metalDoor: null,
			glowStone: null,
			runeArray: [],
			gold: null,
			rock: null
		},
		mesh: {
			wallMeshes: [],
			rune: null,
			gold: null,
			rubble: null,
			glowStone: null,
			rocksArray: []
		},
		tex: {
			wallDiffuseArray: [],
			floorDiffuse: null,
			floorNormal: null,
			floorSpecular: null,
			ceilDiffuse: null,

			metalDoorDiffuse: null,
			metalDoorNormal: null,

			rockDiffuse: null,
		}
	};


	var totalAssets = 0, assetsLoaded = 0;
	var loaded = () => {
		assetsLoaded += 1;
		progress(assetsLoaded / totalAssets);
	};

	function localURL(path: string) {
		return new URL(path, document.baseURI!);
	}


	var stuff = [
		// ceiling and wall textures
		render.loadSimpleTexture(rc, "data/tex2D/ceil-a.jpg", true).then(tex => { assets.tex.ceilDiffuse = tex; loaded(); }),
		render.loadSimpleTexture(rc, "data/tex2D/wall-a.jpg", true).then(tex => { assets.tex.wallDiffuseArray[0] = tex; loaded(); }),
		render.loadSimpleTexture(rc, "data/tex2D/wall-b.jpg", true).then(tex => { assets.tex.wallDiffuseArray[1] = tex; loaded(); }),
		render.loadSimpleTexture(rc, "data/tex2D/wall-c.jpg", true).then(tex => { assets.tex.wallDiffuseArray[2] = tex; loaded(); }),

		// floor textures
		render.loadSimpleTexture(rc, "data/tex2D/pattern_273/diffuse.jpg", false).then(tex => { assets.tex.floorDiffuse = tex; loaded(); }),
		render.loadSimpleTexture(rc, "data/tex2D/pattern_273/normal.jpg", true, asset.ColourSpace.Linear).then(tex => { assets.tex.floorNormal = tex; loaded(); }),
		render.loadSimpleTexture(rc, "data/tex2D/pattern_273/specular.jpg", true).then(tex => { assets.tex.floorSpecular = tex; loaded(); }),

		// metal door textures
		render.loadSimpleTexture(rc, "data/tex2D/door/MetalPlates_Diffuse.jpg", true).then(tex => { assets.tex.metalDoorDiffuse = tex; loaded(); }),
		render.loadSimpleTexture(rc, "data/tex2D/door/MetalPlates_Normal_35.jpg", true, asset.ColourSpace.Linear).then(tex => { assets.tex.metalDoorNormal = tex; loaded(); }),

		// ----

		// wall meshes
		asset.loadOBJFile(localURL("data/model/wall-n.obj")).then(ag => { assets.mesh.wallMeshes[2] = ag.meshes[0]; loaded(); }),
		asset.loadOBJFile(localURL("data/model/wall-w.obj")).then(ag => { assets.mesh.wallMeshes[1] = ag.meshes[0]; loaded(); }),
		asset.loadOBJFile(localURL("data/model/wall-nw.obj")).then(ag => { assets.mesh.wallMeshes[3] = ag.meshes[0]; loaded(); }),

		// the rune
		asset.loadOBJFile(localURL("data/model/rune/mese.obj")).then(ag => {
			Promise.all(ag.materials.map(mat => {
				return render.loadSimpleTexture(rc, mat.albedoTexture.url.href, false);
			})).then(diffTexArray => {
				diffTexArray.forEach((tex, ix) => { ag.materials[ix].albedoTexture.texture = tex; });
				assets.mat.runeArray = ag.materials;
				assets.mesh.rune = ag.meshes[0];
				loaded();
			});
		}),

		// gold
		asset.loadOBJFile(localURL("data/model/gold/Gold-08.obj")).then(ag => {
			Promise.all([
				render.loadSimpleTexture(rc, ag.materials[0].albedoTexture.url.href, false).then(tex => { ag.materials[0].albedoTexture.texture = tex; }),
				render.loadSimpleTexture(rc, ag.materials[0].normalTexture.url.href, false, asset.ColourSpace.Linear).then(tex => { ag.materials[0].normalTexture.texture = tex; })
			]).then(_tex => {
				assets.mat.gold = ag.materials[0];
				assets.mesh.gold = ag.meshes[0];
				loaded();
			});
		}),

		// rocks
		render.loadSimpleTexture(rc, "data/model/rocks/rock_diffuse.jpg", false).then(tex => { assets.tex.rockDiffuse = tex; loaded(); }),
		asset.loadOBJFile(localURL("data/model/rocks/stone.obj")).then(ag => { assets.mesh.rubble = ag.meshes[0]; loaded(); }),
		asset.loadOBJFile(localURL("data/model/rocks/LP_B-Rocks_05.obj")).then(ag => { assets.mesh.glowStone = ag.meshes[0]; loaded(); }),
		// asset.loadOBJFile("data/model/rocks/LP_B-Rocks2_02.obj").then(ag => { assets.model.rocksArray[0] = instantiateAGMesh(meshMgr, ag); loaded(); }),
		// asset.loadOBJFile("data/model/rocks/LP_B-Rocks2_03.obj").then(ag => { assets.model.rocksArray[1] = instantiateAGMesh(meshMgr, ag); loaded(); }),
		// asset.loadOBJFile("data/model/rocks/LP_B-Rocks2_04.obj").then(ag => { assets.model.rocksArray[2] = instantiateAGMesh(meshMgr, ag); loaded(); }),
		// asset.loadOBJFile("data/model/rocks/LP_S-Rocks_all.obj").then(ag => { assets.model.rocksArray[3] = instantiateAGMesh(meshMgr, ag); loaded(); }),

		// ----

		// ambience sounds
		asset.loadSoundFile(ac, "data/sound/ambience/17219__meatball4u__darkthumpwave.mp3").then(buf => { assets.sound.ambienceArray[0] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/ambience/170722__andromadax24__woosh.mp3").then(buf => { assets.sound.ambienceArray[1] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/ambience/248150__hykenfreak__deepest-boom-yet.mp3").then(buf => { assets.sound.ambienceArray[2] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/ambience/329674__unaxete__cathedral-reverb-jumpscare.mp3").then(buf => { assets.sound.ambienceArray[3] = buf; loaded(); }),

		// effect sounds
		asset.loadSoundFile(ac, "data/sound/effect/FX142-rune-find.mp3").then(buf => { assets.sound.findRune = buf; loaded(); }),

		// movement sounds
		asset.loadSoundFile(ac, "data/sound/move/197778__samulis__footstep-on-stone.mp3").then(buf => { assets.sound.moveStep = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/move/174634__altfuture__guts-dragging.mp3").then(buf => { assets.sound.moveDrag = buf; loaded(); }),

		// shifting sounds
		asset.loadSoundFile(ac, "data/sound/shift/180491__vincentoliver__boneclicks-goresquelches-16.mp3").then(buf => { assets.sound.goreArray[0] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/shift/185147__afilion__bone-crack.mp3").then(buf => { assets.sound.goreArray[1] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/shift/204041__duckduckpony__impacts-slushy-orange-002.mp3").then(buf => { assets.sound.goreArray[2] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/shift/bite-small.mp3").then(buf => { assets.sound.goreArray[3] = buf; loaded(); }),
		// asset.loadSoundFile(ac, "data/sound/shift/bite-small2.mp3").then(buf => { assets.sound.goreArray[4] = buf; loaded(); }),

		// female voice
		asset.loadSoundFile(ac, "data/sound/voice/female/241573__reitanna__short-scream.mp3").then(buf => { assets.sound.voiceFemaleArray[0] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/voice/female/261419__archeos__womanscream.mp3").then(buf => { assets.sound.voiceFemaleArray[1] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/voice/female/218183__madamvicious__woman-panting-painfully.mp3").then(buf => { assets.sound.voiceFemaleArray[2] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/voice/female/132252__robinhood76__02940-insane-women-laughter.mp3").then(buf => { assets.sound.voiceFemaleArray[3] = buf; loaded(); }),

		// male voice
		asset.loadSoundFile(ac, "data/sound/voice/male/272023__aldenroth2__male-scream.mp3").then(buf => { assets.sound.voiceMaleArray[0] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/voice/male/90790__kmoon__scream-male-middistance-outdoors.mp3").then(buf => { assets.sound.voiceMaleArray[1] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/voice/male/317477__drkvixn91__breathless-panting-2.mp3").then(buf => { assets.sound.voiceMaleArray[2] = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/voice/male/338902__gentlemanwalrus__mad-laughter.mp3").then(buf => { assets.sound.voiceMaleArray[3] = buf; loaded(); }),

		// music
		asset.loadSoundFile(ac, "data/sound/music/137109__klankbeeld__horror-ambience-16.mp3").then(buf => { assets.sound.mainMusic = buf; loaded(); }),
		asset.loadSoundFile(ac, "data/sound/music/262257__gowlermusic__horror-sounds-1.mp3").then(buf => { assets.sound.endMusic = buf; loaded(); })
	];

	totalAssets = stuff.length;


	return Promise.all(stuff).then(() => {
		assets.mat.wallArray = [asset.makeMaterial("wall0"), asset.makeMaterial("wall1"), asset.makeMaterial("wall2")];
		assets.mat.wallArray[0].albedoTexture = { name: "wall0Diff", texture: assets.tex.wallDiffuseArray[0], colourSpace: asset.ColourSpace.sRGB };
		assets.mat.wallArray[1].albedoTexture = { name: "wall1Diff", texture: assets.tex.wallDiffuseArray[1], colourSpace: asset.ColourSpace.sRGB };
		assets.mat.wallArray[2].albedoTexture = { name: "wall2Diff", texture: assets.tex.wallDiffuseArray[2], colourSpace: asset.ColourSpace.sRGB };
		vec2.set(assets.mat.wallArray[0].textureScale, 1 / 1.5, 1 / 1.5);
		vec2.set(assets.mat.wallArray[1].textureScale, 1 / 1.5, 1 / 1.5);
		vec2.set(assets.mat.wallArray[2].textureScale, 1 / 1.5, 1 / 1.5);
		assets.mat.wallArray[0].roughness = .9; assets.mat.wallArray[0].metallic = 0;
		assets.mat.wallArray[1].roughness = .9; assets.mat.wallArray[1].metallic = 0;
		assets.mat.wallArray[2].roughness = .9; assets.mat.wallArray[2].metallic = 0;

		assets.mat.floor = asset.makeMaterial("floor");
		assets.mat.floor.albedoTexture = { name: "floorDiff", texture: assets.tex.floorDiffuse, colourSpace: asset.ColourSpace.sRGB };
		assets.mat.floor.normalTexture = { name: "floorNormal", texture: assets.tex.floorNormal, colourSpace: asset.ColourSpace.Linear };
		assets.mat.floor.specularTexture = { name: "floorSpec", texture: assets.tex.floorSpecular, colourSpace: asset.ColourSpace.sRGB };
		assets.mat.floor.specularIntensity = 1;
		assets.mat.floor.specularExponent = 8;
		assets.mat.floor.roughness = .3;
		assets.mat.floor.metallic = 0;

		assets.mat.ceiling = asset.makeMaterial("ceiling");
		assets.mat.ceiling.albedoTexture = { name: "ceilDiff", texture: assets.tex.ceilDiffuse, colourSpace: asset.ColourSpace.sRGB };
		assets.mat.ceiling.roughness = .9;
		assets.mat.floor.metallic = 0;

		assets.mat.metalDoor = asset.makeMaterial();
		assets.mat.metalDoor.albedoTexture = { name: "metalDoorDiff", texture: assets.tex.metalDoorDiffuse, colourSpace: asset.ColourSpace.sRGB };
		assets.mat.metalDoor.normalTexture = { name: "metalDoorNormal", texture: assets.tex.metalDoorNormal, colourSpace: asset.ColourSpace.Linear };
		vec3.set(assets.mat.metalDoor.specularColour, .5, .5, .5);
		assets.mat.metalDoor.specularIntensity = 1;
		assets.mat.metalDoor.specularExponent = 8;
		assets.mat.metalDoor.textureOffset = [0, -0.1];
		assets.mat.metalDoor.flags |= asset.MaterialFlags.usesSpecular;
		assets.mat.metalDoor.roughness = 0.6;
		assets.mat.metalDoor.metallic = 1;

		const rockDiffTex: asset.Texture2D = { name: "rockDiffTex", texture: assets.tex.rockDiffuse, colourSpace: asset.ColourSpace.sRGB };

		assets.mat.glowStone = asset.makeMaterial("glowStone");
		assets.mat.glowStone.albedoTexture = rockDiffTex;
		assets.mat.glowStone.emissiveColour = [1, 20 / 255, 84 / 255];
		assets.mat.glowStone.emissiveIntensity = 0.8;
		assets.mat.glowStone.flags |= asset.MaterialFlags.usesEmissive;
		assets.mat.metalDoor.roughness = 0.1;
		assets.mat.metalDoor.metallic = 0;

		assets.mat.rock = asset.makeMaterial("rock");
		assets.mat.rock.albedoTexture = rockDiffTex;
		assets.mat.rock.specularIntensity = 0.7;
		assets.mat.rock.specularExponent = 4;
		assets.mat.rock.flags |= asset.MaterialFlags.usesSpecular;

		return assets;
	});
}

// Game.ts
import Phaser from "phaser";
import PlayerController from "./PlayerController";

type TiledObject = Phaser.Types.Tilemaps.TiledObject;

export default class Game extends Phaser.Scene {
  private level = 1;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private escKey!: Phaser.Input.Keyboard.Key;

  private penquin?: Phaser.Physics.Matter.Sprite;
  private playerController?: PlayerController;
  
  private tileset?: Phaser.Tilemaps.Tileset;

  // Parallax background
  private bg!: Phaser.GameObjects.TileSprite;

  // Parallax tuning
  private _baseTileY = 0;
  private _basePlayerY = 0;
  private readonly _baseTileRatio = 0.2;

  // --- terminal ---
  private terminalOpen = false;
  private terminalContainer?: Phaser.GameObjects.Container;
  private terminalInput = "";
  private terminalInputText?: Phaser.GameObjects.Text;
  private terminalCursorText?: Phaser.GameObjects.Text;

  // Step 1 e Step 2
  private terminalStep: 1 | 2 = 1;
  private readonly CMD_ADD = "git add game.json";
  private readonly CMD_COMMIT_BASE = 'git commit -m "level';
  private CMD_COMMIT = 'git commit -m "level 1"';
  private readonly CMD_CLONE = "git clone https://github.com/supermariobros";
  private readonly CMD_PULL = "git pull";


  // trigger (tile con proprietà)
  private terminalTriggerBody?: MatterJS.BodyType;
  private terminalTriggerInside = false;

  // --- GIT FILE TILE ---
  private gitFileTiles: Phaser.Tilemaps.Tile[] = [];
  private groundLayer?: Phaser.Tilemaps.TilemapLayer;

  // --- cutscenes ---
  private levelEnding = false;
  private introDrop = false;
  private introPlayerFrozen = false;
  private introUfo?: Phaser.GameObjects.Image;

  // ✅ UFO del goal (unico)
  private goalUfo?: Phaser.GameObjects.Image;
  private goalBody?: MatterJS.BodyType;

  // --- TUBE SYSTEM ---
  private tubeEnterBody?: MatterJS.BodyType;
  private tubeExitPoint?: { x: number; y: number };
  private tubeBusy = false;
  private tubeInside = false;


  // --- PORTAL SYSTEM ---
  private portalEnterBody?: MatterJS.BodyType;
  private portalExitPoint?: { x: number; y: number };
  private portalBusy = false;
  private portalInside = false;


  //bloccoquestion
  private usedQuestionTiles = new Set<string>();

  private tileKey(tile: Phaser.Tilemaps.Tile) {
  return `${tile.x},${tile.y}`;
  }


  private enterTube() {
    if (!this.penquin || !this.tubeExitPoint) return;

    this.tubeBusy = true;
    this.freezePlayer();

    const startX = this.penquin.x;
    const startY = this.penquin.y;

    // Animazione: scende nel tubo
    this.tweens.add({
      targets: this.penquin,
      y: startY + 32,
      scaleY: 0.1,
      duration: 400,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.penquin?.setVisible(false);

        // TELEPORT
        this.penquin?.setPosition(
          this.tubeExitPoint!.x,
          this.tubeExitPoint!.y + 32
        );

        this.exitTube();
      },
    });
  }

  private exitTube() {
    if (!this.penquin) return;

    this.penquin.setVisible(true);
    this.penquin.setScale(1.5, 0.1);

    // Animazione: esce dal tubo
    this.tweens.add({
      targets: this.penquin,
      y: this.penquin.y - 32,
      scaleY: 1.5,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tubeBusy = false;
      },
    });
  }

  private enterPortal() {
  if (!this.penquin || !this.portalExitPoint) return;

  this.portalBusy = true;
  this.freezePlayer();

  this.tweens.add({
    targets: this.penquin,
    alpha: 0,
    duration: 250,
    onComplete: () => {
      this.penquin?.setPosition(
        this.portalExitPoint!.x,
        this.portalExitPoint!.y
      );
      this.exitPortal();
    },
  });
}

  private exitPortal() {
    if (!this.penquin) return;

    this.tweens.add({
      targets: this.penquin,
      alpha: 1,
      duration: 250,
      onComplete: () => {
        this.portalBusy = false;
      },
    });
  }



  // =========================
  // TUNING OFFSETS (QUI!)
  // =========================
  private readonly PLAYER_SPAWN_Y_OFFSET = -10;
  private readonly UFO_SEAT_Y_OFFSET = 0;

  // “rimbalzo” quando prova a uscire senza task fatta
  private readonly GOAL_BLOCK_PUSH_X = -26;
  private readonly GOAL_BLOCK_SHAKE = true;
  // =========================

  // =========================
  // DEATH SYSTEM (tile verde + caduta)
  // =========================
  private dead = false;

  private deathOverlay?: Phaser.GameObjects.Rectangle;
  private deathText?: Phaser.GameObjects.Text;

  private deathY = Number.POSITIVE_INFINITY; // backup: sotto mappa
  private readonly DEATH_Y_MARGIN = 120;


  private deathBodies: MatterJS.BodyType[] = []; // sensori “death-zone”
  // =========================


  // --- HINT TILE ---
  private hintTiles: Phaser.Tilemaps.Tile[] = [];
  private hintActive = false;
  private hintBox?: Phaser.GameObjects.Container;

  // --- DARKNESS (LEVEL 3) ---
  private darkness?: Phaser.GameObjects.Graphics;
  private lightMask?: Phaser.GameObjects.Graphics;
  private isDarkLevel = false;


  private enableDarkness() {
    this.isDarkLevel = true;

    const cam = this.cameras.main;

    // overlay nero
    this.darkness = this.add.graphics();
    this.darkness
      .fillStyle(0x000000, 0.95)
      .fillRect(0, 0, cam.width, cam.height)
      .setScrollFactor(0)
      .setDepth(9000);

    // 👉 GRAFICA DELLA LUCE (INVISIBILE)
    this.lightMask = this.add.graphics();
    this.lightMask.setVisible(false);

    // 👉 MASK: il bianco della lightMask buca il nero
    const mask = this.lightMask.createGeometryMask();
    mask.invertAlpha = true; // 🔥 QUESTA È LA CHIAVE
    this.darkness.setMask(mask);

    // resize safe
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      this.darkness?.clear();
      this.darkness
        ?.fillStyle(0x000000, 0.95)
        .fillRect(0, 0, size.width, size.height);
    });
  }






  
  constructor() {
    super("game");
  }

  init(data: { level?: number; introDrop?: boolean } = {}) {
    this.level = data.level ?? 1;
    this.introDrop = !!data.introDrop;
    this.didPlayWin = false;
    this.stopLevelBgm();

    // ✅ salva sempre il livello corrente (utile per "Gioca")
    localStorage.setItem("currentLevel", String(this.level));

    this.CMD_COMMIT = `${this.CMD_COMMIT_BASE} ${this.level}"`;
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // reset flags
    this.levelEnding = false;
    this.introPlayerFrozen = false;
    this.terminalTriggerInside = false;

    this.goalUfo = undefined;
    this.goalBody = undefined;
    this.introUfo = undefined;

    // death reset
    this.dead = false;
    this.deathY = Number.POSITIVE_INFINITY;
    this.deathBodies = [];
    this.deathOverlay = undefined;
    this.deathText = undefined;

    // terminal reset
    this.terminalOpen = false;
    this.terminalContainer = undefined;
    this.terminalInput = "";
  }

  preload() {
    this.load.on("loaderror", (file: any) => {
      console.error("[LOAD ERROR]", file?.key, file?.src);
    });

    // background per livelli
    this.load.image("bg", "assets/bg.png");
    this.load.image("bg2", "assets/bg2.png");
    this.load.image("bg3", "assets/bg3.png");

    this.load.atlas("penquin", "assets/penquin.png", "assets/penquin.json");
    this.load.spritesheet("tiles", "assets/sheet.png", {  frameWidth: 70,
      frameHeight: 70,
    });
    this.load.image("ufo", "assets/ufo.png");
    this.load.spritesheet("goomba", "assets/goomba.png", {
      frameWidth: 70,
      frameHeight: 70,
    });

    this.load.image("options-image", "options-image.png");



    this.load.audio("bgm-level1", "assets/that-8-bit-music-322062.mp3");
    this.load.audio("bgm-level2", "assets/retro-gaming-248421.mp3");

    this.load.audio("sfx-jump", "assets/sfx-jump.mp3");
    this.load.audio("sfx-level-complete", "assets/sfx-level-complete.mp3");


    this.load.tilemapTiledJSON("tilemap", "assets/game.json");
    this.load.tilemapTiledJSON("tilemap2", "assets/game2.json");
    this.load.tilemapTiledJSON("tilemap3", "assets/game3.json");
    this.load.tilemapTiledJSON("tilemap4", "assets/game4.json");
  }

  create() {
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    this.startLevelBgm();

    const wantedBgKey = this.level === 1 ? "bg" : `bg${this.level}`;
    const bgKey = this.textures.exists(wantedBgKey) ? wantedBgKey : "bg";

    // --- BG parallax ---
    this.bg = this.add
      .tileSprite(0, 0, cam.width, cam.height, bgKey)
      .setScrollFactor(0)
      .setDepth(-1000)
      .setOrigin(0, 1)
      .setPosition(0, cam.height);

    this._baseTileY = Math.floor(cam.height * this._baseTileRatio);
    this.bg.tilePositionY = this._baseTileY;

    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      this.bg.setSize(size.width, size.height).setDisplaySize(size.width, size.height);
      this.bg.setPosition(0, size.height);
      this._baseTileY = Math.floor(size.height * this._baseTileRatio);
      this.bg.tilePositionY = this._baseTileY;
      this.layoutTerminal();

      if (this.deathOverlay) this.deathOverlay.setSize(size.width, size.height);
      if (this.deathText) this.deathText.setPosition(size.width * 0.5, this.getDeathMessageScreenY());
    });


    const audioOn = localStorage.getItem("audio") !== "off";
    this.sound.mute = !audioOn;


    // --- choose correct tilemap key ---
    const mapKey = this.level === 1 ? "tilemap" : `tilemap${this.level}`;

    if (!this.cache.tilemap.exists(mapKey)) {
      console.error(`[Game] Tilemap key not found in cache: "${mapKey}".`);
      this.add
        .text(20, 80, `ERROR: tilemap "${mapKey}" not loaded`, {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#ff5555",
          backgroundColor: "#000000aa",
          padding: { left: 10, right: 10, top: 6, bottom: 6 },
        })
        .setScrollFactor(0)
        .setDepth(9999);
      this.createGoBackButton();
      return;
    }

    const jumpSound = this.sound.add("sfx-jump", {
      volume: 0.4,
    });

    const levelCompleteSound = this.sound.add("sfx-level-complete", {
      volume: 0.6,
    });

    this.sfxJump = jumpSound;
    this.sfxLevelComplete = levelCompleteSound;



    // --- Map + tileset ---
    const map = this.make.tilemap({ key: mapKey });
    const tileset = map.addTilesetImage("iceworld", "tiles");
    
    

    if (!tileset) {
      console.error(`[Game] Tileset not found. In Tiled tileset name must be "iceworld".`);
      this.createGoBackButton();
      return;
    }
    
    this.tileset = tileset;


    const ground = map.createLayer("ground", tileset);
    if (!ground) {
      console.error(`[Game] Layer "ground" not found. Must be named exactly "ground".`);
      this.createGoBackButton();
      return;
    }

    this.groundLayer = ground;

    // --- raccogli i tile git="file" ---
    this.gitFileTiles = [];
    ground.forEachTile((tile) => {
      const p = tile?.properties as any;
      if (p && p.git === "file") this.gitFileTiles.push(tile);
    });

    // --- se task già completata, rimuovi i file subito ---
    if (this.isGitFileTaskCompleted()) {
      this.removeGitFileTiles();
    }

    // --- raccogli i tile hint="light" ---
    this.hintTiles = [];
    ground.forEachTile((tile) => {
      const p = tile?.properties as any;
      if (p?.hint === "light") this.hintTiles.push(tile);
    });


    // collision per i tile solidi
    ground.setCollisionByProperty({ collides: true });
    this.matter.world.convertTilemapLayer(ground);

    // death zones dai TILE con proprietà death-zone=true
    this.createDeathZonesFromTiles(ground);

    // World bounds / camera bounds
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.matter.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels, 64, true, true, true, false);

    // backup morte sotto mappa
    this.deathY = map.heightInPixels + this.DEATH_Y_MARGIN;

    // --- Objects layer ---
    const objectsLayer = map.getObjectLayer("objects");
    if (!objectsLayer) {
      console.error(`[Game] Object layer "objects" not found. Must be named exactly "objects".`);
      this.createGoBackButton();
      return;
    }

    // (opzionale) death-zone anche da objects:
    this.createDeathZonesFromObjects(objectsLayer.objects);

    //spritesheet goomba  
    if (!this.anims.exists("goomba-walk")) {
      this.anims.create({
        key: "goomba-walk",
        frames: this.anims.generateFrameNumbers("goomba", {
          start: 0,
          end: 3,
        }),
        frameRate: 6,
        repeat: -1,
      });

      this.anims.create({
        key: "goomba-squash",
        frames: this.anims.generateFrameNumbers("goomba", {
          start: 4,
          end: 5,
        }),
        frameRate: 8,
        repeat: 0,
      });
    }


    // --- TUBES ---
    const tubeEnterObj = objectsLayer.objects.find(o => o.name === "tube-enter");
    const tubeExitObj = objectsLayer.objects.find(o => o.name === "tube-exit");

    if (tubeEnterObj && tubeExitObj) {
      const ex = tubeEnterObj.x ?? 0;
      const ey = tubeEnterObj.y ?? 0;
      const ew = tubeEnterObj.width ?? 32;
      const eh = tubeEnterObj.height ?? 16;

      this.tubeEnterBody = this.matter.add.rectangle(
        ex + ew / 2,
        ey + eh / 2,
        ew,
        eh,
        {
          isStatic: true,
          isSensor: true,
          label: "tube-enter",
        }
      );

      this.tubeExitPoint = {
        x: (tubeExitObj.x ?? 0) + (tubeExitObj.width ?? 0) / 2,
        y: tubeExitObj.y ?? 0,
      };
    }

    // --- PORTAL ---
    const portalEnterObj = objectsLayer.objects.find(o => o.name === "portal-enter");
    const portalExitObj = objectsLayer.objects.find(o => o.name === "portal-exit");

    if (portalEnterObj && portalExitObj) {
      const ex = portalEnterObj.x ?? 0;
      const ey = portalEnterObj.y ?? 0;
      const ew = portalEnterObj.width ?? 32;
      const eh = portalEnterObj.height ?? 32;

      this.portalEnterBody = this.matter.add.rectangle(
        ex + ew / 2,
        ey + eh / 2,
        ew,
        eh,
        {
          isStatic: true,
          isSensor: true,
          label: "portal-enter",
        }
      );

      this.portalExitPoint = {
        x: (portalExitObj.x ?? 0) + (portalExitObj.width ?? 0) / 2,
        y: portalExitObj.y ?? 0,
      };
    }



    // --- Spawn player ---
    const spawnObj = objectsLayer.objects.find((o) => o.name === "penquin-spawn");
    if (!spawnObj) {
      console.error(`[Game] "penquin-spawn" not found in objects layer.`);
      this.createGoBackButton();
      return;
    }

    const sx = spawnObj.x ?? 0;
    const sy = spawnObj.y ?? 0;
    const sw = spawnObj.width ?? 0;

    this.penquin = this.matter.add
    .sprite(sx + sw * 0.5, sy, "penquin")
    .setOrigin(0.5, 0.365)
    .setScale(1.5)
    .setFixedRotation()
    .setFriction(0)
    .setDepth(9500); // ✅ TUTTO NELLA CATENA


    this.playerController = new PlayerController(this, this.penquin, this.cursors);
    cam.startFollow(this.penquin, true);
    this._basePlayerY = this.penquin.y;

    // --- GOOMBAS ---
    const goombas = objectsLayer.objects.filter(o => o.name === "enemy-goomba");

    for (const g of goombas) {
      const x = (g.x ?? 0) + (g.width ?? 70) / 2;
      const y = (g.y ?? 0) + (g.height ?? 70) / 2;

      const enemy = this.matter.add
        .sprite(x, y, "goomba", 0)
        .setFixedRotation()
        .setFriction(0)
        .setBounce(0);

      enemy.play("goomba-walk");

      enemy.setData("type", "goomba");
      enemy.setData("alive", true);
      enemy.setData("startX", x);
      enemy.setData("dir", -1);
      enemy.setData("range", 3 * 70); // 8 tile
      enemy.setVelocityX(-1.2);

      this.enemies.push(enemy);
    }

    // --- Intro drop (solo se arrivi da git init) ---
    if (this.introDrop) {
      this.playIntroDrop(sx + sw * 0.5, sy);
    }

    // --- UFO GOAL ---
    const ufoObj = objectsLayer.objects.find((o) => o.name === "ufo-goal");
    if (ufoObj) {
      const x = ufoObj.x ?? 0;
      const y = ufoObj.y ?? 0;
      const w = ufoObj.width ?? 64;
      const h = ufoObj.height ?? 64;

      const cx = x + w * 0.5;
      const cy = y + h * 0.5;

      this.goalUfo?.destroy();
      this.goalUfo = this.add
        .image(cx, cy, "ufo")
        .setOrigin(0.5)
        .setDepth(900)
        .setScrollFactor(1)
        .setScale(1);

      this.goalBody = this.matter.add.rectangle(cx, cy, w, h, {
        isStatic: true,
        isSensor: true,
        label: "ufo-goal",
      });
    } else {
      console.warn("[Game] ufo-goal not found in objects layer.");
    }


    // --- DARK LEVEL (LEVEL 3) ---
    if (this.level === 3 && !this.isGitFileTaskCompleted()) {
      this.enableDarkness();
    }



    // --- TERMINAL TRIGGER VIA TILE PROPERTY ---
    if (!this.isGitFileTaskCompleted()) {
      this.createTerminalTriggerFromTiles(ground);
    } else {
      this.terminalTriggerBody = undefined;
    }

    // collision handler unico (morte + ufo)
    this.matter.world.on("collisionstart", (event: any) => {
      if (this.levelEnding || this.dead) return;
      if (!this.penquin) return;

      const playerBody = this.penquin.body as MatterJS.BodyType;
      if (!playerBody) return;

      for (const pair of event.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;

        // DEATH
        if (this.isDeathCollision(a, b, playerBody)) {
          this.onPlayerDied();
          return;
        }

        // UFO GOAL
        if (this.goalBody) {
          const hitGoal =
            (a === this.goalBody && b === playerBody) || (b === this.goalBody && a === playerBody);

          if (hitGoal) {
            if (!this.isGitFileTaskCompleted()) {
              this.blockGoalExit();
              return;
            }
            this.playUfoExitCutscene(this.goalUfo?.x ?? 0, this.goalUfo?.y ?? 0);
            return;
          }
        }

        // --- BRICK BOUNCE ---
        const otherBody =
        (a !== playerBody && (a as any).gameObject?.tile) ? a :
        (b !== playerBody && (b as any).gameObject?.tile) ? b :
        null;

        if (otherBody && this.groundLayer) {
          const tile = (otherBody as any).gameObject.tile as Phaser.Tilemaps.Tile;
          const props = tile?.properties as any;

          // Solo brick/question (così muri e pavimenti non triggerano)
          if (props?.brick || props?.question) {
            const vy = (playerBody as any).velocity?.y ?? 0;

            // Solo se stai salendo (colpo di testa)
            if (vy < -0.5) {
              const headY = playerBody.bounds.min.y;
              const tileBottomY = (otherBody as MatterJS.BodyType).bounds.max.y;

              // La testa deve essere davvero vicino al fondo del tile (hit da sotto)
              if (headY <= tileBottomY + 2) {
                this.tryBrickBounceTile(tile, playerBody);
              }
            }
          }
        }


        for (const enemy of this.enemies) {
          const eb = enemy.body as MatterJS.BodyType;
          if (!eb || !enemy.getData("alive")) continue;

          const hitEnemy =
            (a === eb && b === playerBody) ||
            (b === eb && a === playerBody);

          if (!hitEnemy) continue;

          const py = playerBody.bounds.max.y; // piedi player
          const ey = eb.position.y;

          // SALTATO SOPRA → GOOMBA MUORE
          if (py < ey - 6) {
            enemy.setData("alive", false);
            enemy.setVelocity(0, 0);
            enemy.setStatic(true);

            this.tweens.add({
              targets: enemy,
              scaleY: 0.2,
              duration: 120,
              onComplete: () => enemy.destroy()
            });

            this.penquin?.setVelocityY(-6);
            return;
          }

          // TOCCATO DI LATO → PLAYER MUORE
          this.onPlayerDied();
          return;
        }


      }
    });

    
    // UI
    this.createGoBackButton();
    
    // cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stopLevelBgm();
      this.input.keyboard?.off("keydown", this.onTerminalKeyDown, this);
    });
  }

  update(_t: number, dt: number) {
    // ESC = back to menu
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
        // Qui sarebbe opportuno aprire un menu di pausa prima di tornare al menu principale con un alert
        this.goBackToMenu();
      return;
    }

    // blocca player quando terminale o cutscene o death
    if (this.terminalOpen || this.levelEnding || this.introPlayerFrozen || this.dead) {
      this.freezePlayer();
    } else {
      this.playerController?.update(dt);
    }


    // --- HINT TILE CHECK ---
    if (
      this.level === 3 &&
      this.isDarkLevel &&
      this.penquin &&
      this.groundLayer
    ) {
      const tw = this.groundLayer.tilemap.tileWidth;
      const th = this.groundLayer.tilemap.tileHeight;

      const px = Math.floor(this.penquin.x / tw);
      const py = Math.floor(this.penquin.y / th);

      const tile = this.groundLayer.getTileAt(px, py);
      const isHintTile = tile && (tile.properties as any)?.hint === "light";

      // 👉 ENTRA nel tile
      if (isHintTile && !this.hintActive) {
        this.hintActive = true;
        this.showLightHint();
      }

      // 👉 ESCE dal tile
      if (!isHintTile && this.hintActive) {
        this.hintActive = false;
      }


      // --- PLAYER LIGHT AURA ---
        if (this.isDarkLevel && this.penquin && this.lightMask) {
          this.lightMask.clear();

          const radius = 80; // 👈 dimensione aura (prova 120–180)
          const x = this.penquin.x;
          const y = this.penquin.y;

          this.lightMask.fillStyle(0xffffff, 1);
          this.lightMask.fillCircle(x, y, radius);
        }

    }


    // --- GOOMBA PATROL (AVANTI ↔ DIETRO) ---
    for (const e of this.enemies) {
      if (!e.getData("alive")) continue;

      const startX = e.getData("startX") as number;
      const range = e.getData("range") as number;
      let dir = e.getData("dir") as number;

      const dist = e.x - startX;

      // limite destro
      if (dist >= range && dir > 0) {
        dir = -1;
        e.setData("dir", dir);
        e.setFlipX(false);
      }

      // limite sinistro
      if (dist <= -range && dir < 0) {
        dir = 1;
        e.setData("dir", dir);
        e.setFlipX(true);
      }

      // movimento costante
      e.setVelocityX(dir * 1.2);

    }





    // Parallax X
    this.bg.tilePositionX = Math.floor(this.cameras.main.scrollX * 0.2);

    // Parallax Y
    const playerY = this.penquin?.y ?? this._basePlayerY;
    const dyUp = Math.max(0, this._basePlayerY - playerY);
    const target = this._baseTileY - Math.floor(dyUp * 0.3);
    this.bg.tilePositionY = Math.min(this._baseTileY, target);

    // open terminal when inside trigger
    if (this.terminalTriggerBody && this.penquin && !this.terminalOpen && !this.dead) {
      const pb = this.penquin.body as MatterJS.BodyType;
      const inside = this.isPlayerInsideRectBody(pb, this.terminalTriggerBody);
      if (inside && !this.terminalTriggerInside) {
        this.terminalTriggerInside = true;
        this.openTerminal();
      }
      if (!inside && this.terminalTriggerInside) {
        this.terminalTriggerInside = false;
      }
    }

    // --- TUBE AUTO ENTER (NO INPUT) ---
    if (
      this.tubeEnterBody &&
      this.penquin &&
      !this.tubeBusy &&
      !this.dead &&
      !this.levelEnding
    ) {
      const pb = this.penquin.body as MatterJS.BodyType;
      const inside = this.isPlayerInsideRectBody(pb, this.tubeEnterBody);

      // entra una sola volta quando ci sale sopra
      if (inside && !this.tubeInside) {
        this.tubeInside = true;
        this.enterTube();
      }

      // reset quando esce dalla zona
      if (!inside && this.tubeInside) {
        this.tubeInside = false;
      }
    }

    // --- PORTAL AUTO ENTER ---
    if (
      this.portalEnterBody &&
      this.penquin &&
      !this.portalBusy &&
      !this.dead &&
      !this.levelEnding
    ) {
      const pb = this.penquin.body as MatterJS.BodyType;
      const px = pb.position.x;
      const py = pb.position.y; // 👈 CENTRO, non piedi

      const b = this.portalEnterBody.bounds;
      const inside =
        px >= b.min.x &&
        px <= b.max.x &&
        py >= b.min.y &&
        py <= b.max.y;


      if (inside && !this.portalInside) {
        this.portalInside = true;
        this.enterPortal();
      }

      if (!inside && this.portalInside) {
        this.portalInside = false;
      }
    }



    // backup: se cade sotto mappa muore
    if (!this.dead && !this.levelEnding && this.penquin && this.penquin.y > this.deathY) {
      this.onPlayerDied();
    }

   }

  private sfxJump!: Phaser.Sound.BaseSound;
  private sfxLevelComplete!: Phaser.Sound.BaseSound;

  private startLevelBgm() {
  // rispetta il toggle audio
  const audioOn = localStorage.getItem("audio") !== "off";
  if (!audioOn) return;

  // scegli musica per livello
  let key: string | null = null;
  if (this.level === 1) key = "bgm-level1";
  if (this.level === 2) key = "bgm-level2";

  if (!key) return;

  // evita doppioni
  if (this.bgm && this.bgm.isPlaying) return;

  this.bgm = this.sound.add(key, { loop: true, volume: 0.35 });
  this.bgm.play();
}
private bgm?: Phaser.Sound.BaseSound;
private didPlayWin = false;

private stopLevelBgm() {
  if (!this.bgm) return;
  this.bgm.stop();
  this.bgm.destroy();
  this.bgm = undefined;
}

private playWinOnlyOnce() {
  if (this.didPlayWin) return;
  this.didPlayWin = true;

  // STOP di qualsiasi bgm prima di suonare la win
  this.stopLevelBgm();

  // suono vittoria (no sovrapposizione)
  this.sfxLevelComplete?.play({ volume: 0.6 });
}



  private freezePlayer() {
    if (!this.penquin) return;
    const body = this.penquin.body as MatterJS.BodyType | undefined;
    if (!body) return;

    this.penquin.setVelocity(0, 0);
    this.penquin.setAngularVelocity(0);
  }
  private tryBrickBounceTile(tile: Phaser.Tilemaps.Tile, playerBody: MatterJS.BodyType) {
  if (!this.penquin) return;

  const props = tile.properties as any;
  if (!props?.brick && !props?.question) return;

  // question block
  if (props?.question) {
    this.tryQuestionBlock(tile);
  }

  // ❌ NON fare setVelocityY(0) (causa hover / jump infinito)
  // ✅ invece: se stavi salendo, spingiti leggermente giù
  const vy = (playerBody as any).velocity?.y ?? 0;
  if (vy < 0) this.penquin.setVelocityY(1.2); // prova 0.8–2.0

  // bounce visivo
  const worldX = tile.getCenterX();
  const worldY = tile.getCenterY();
  const frame = tile.index - (this.tileset?.firstgid ?? 1);

  const bounce = this.add
    .sprite(worldX, worldY, "tiles", frame)
    .setOrigin(0.5)
    .setDepth(1000)
    .setScrollFactor(1);

  this.tweens.add({
    targets: bounce,
    y: worldY - 4,
    duration: 60,
    yoyo: true,
    ease: "Sine.easeOut",
    onComplete: () => bounce.destroy(),
  });
}


  private tryQuestionBlock(tile: Phaser.Tilemaps.Tile) {
    const key = this.tileKey(tile);
    if (this.usedQuestionTiles.has(key)) return;

    const props = tile.properties as any;
    if (!props?.question) return;

    this.usedQuestionTiles.add(key);

    const worldX = tile.getCenterX();
    const worldY = tile.getCenterY();

    // 🪙 MONETA
    const coin = this.add
      .sprite(worldX, worldY - 16, "tiles", this.getCoinFrame())
      .setDepth(1200);

    this.tweens.add({
      targets: coin,
      y: worldY - 64,
      alpha: 0.8,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => coin.destroy(),
    });
    // ⬜ CAMBIA BLOCCO IN "VUOTO"
    if (typeof props.usedFrame === "number") {
    tile.index = props.usedFrame + (this.tileset?.firstgid ?? 1);
    tile.setCollision(false, false, false, false);
    }
  }

  private getCoinFrame() {
  // indice DELLO SPRITESHEET (non GID)
      return 73 - (this.tileset?.firstgid ?? 1);
  }


  private tryBrickBounce(playerBody: MatterJS.BodyType) {
    if (!this.groundLayer || !this.penquin) return;

    const map = this.groundLayer.tilemap;
    const tw = map.tileWidth;
    const th = map.tileHeight;

    // testa player
    const headX = playerBody.position.x;
    const headY = playerBody.bounds.min.y - 2;

    const tileX = Math.floor(headX / tw);
    const tileY = Math.floor(headY / th);

    const tile = this.groundLayer.getTileAt(tileX, tileY);
    if (!tile) return;

    const props = tile.properties as any;

    // deve essere brick O question
    if (!props?.brick && !props?.question) return;

    // 👉 se è question block, gestisci la moneta
    if (props?.question) {
      this.tryQuestionBlock(tile);
    }

    // 👉 BLOCCA rimbalzo fisico del player
    this.penquin.setVelocityY(0);

    // 👉 bounce VISIVO (vale per entrambi)
    const worldX = tile.getCenterX();
    const worldY = tile.getCenterY();
    const frame = tile.index - (this.tileset?.firstgid ?? 1);

    const bounce = this.add
      .sprite(worldX, worldY, "tiles", frame)
      .setOrigin(0.5)
      .setDepth(1000)
      .setScrollFactor(1);

    this.tweens.add({
      targets: bounce,
      y: worldY - 4,
      duration: 60,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => bounce.destroy(),
    });
  }aa

  // -------------------------
  // ✅ RESET TASK QUANDO MUORI
  // -------------------------
  private resetGitTaskForThisLevel() {
    localStorage.removeItem(`lvl${this.level}_git_file_completed`);
    localStorage.removeItem(`lvl${this.level}_git_add_done`);
    localStorage.removeItem(`lvl${this.level}_git_commit_done`);
  }

  // -------------------------
  // DEATH ZONES - DA TILE (ground)
  // -------------------------
  private createDeathZonesFromTiles(layer: Phaser.Tilemaps.TilemapLayer) {
    const map = layer.tilemap;
    const tw = map.tileWidth;
    const th = map.tileHeight;

    this.deathBodies = [];

    layer.forEachTile((t) => {
      if (!t || t.index < 0) return;
      const p = t.properties as any;

      if (p && p["death-zone"] === true) {
        const cx = t.x * tw + tw / 2;
        const cy = t.y * th + th / 2;

        const body = this.matter.add.rectangle(cx, cy, tw, th, {
          isStatic: true,
          isSensor: true,
          label: "death-zone",
        });

        this.deathBodies.push(body);
      }
    });

    console.log("[Game] death tiles found =", this.deathBodies.length);
  }

  // -------------------------
  // DEATH ZONES - DA OBJECTS (opzionale)
  // -------------------------
  private createDeathZonesFromObjects(objects: TiledObject[]) {
    const deathObjs = objects.filter((o) => {
      const name = (o.name ?? "").toLowerCase();
      const type = (o.type ?? "").toLowerCase();
      const deadly = this.getTiledBool(o, "deadly");
      return name === "death-zone" || type === "death" || deadly === true;
    });

    for (const o of deathObjs) {
      const x = o.x ?? 0;
      const y = o.y ?? 0;
      const w = o.width ?? 0;
      const h = o.height ?? 0;
      if (w <= 0 || h <= 0) continue;

      const cx = x + w * 0.5;
      const cy = y + h * 0.5;

      const body = this.matter.add.rectangle(cx, cy, w, h, {
        isStatic: true,
        isSensor: true,
        label: "death-zone",
      });

      this.deathBodies.push(body);
    }
  }

  private isDeathCollision(a: MatterJS.BodyType, b: MatterJS.BodyType, playerBody: MatterJS.BodyType) {
    if (a !== playerBody && b !== playerBody) return false;
    const other = a === playerBody ? b : a;
    return this.deathBodies.includes(other);
  }

  private getTiledBool(o: TiledObject, key: string): boolean | undefined {
    const props = (o as any).properties as { name: string; type?: string; value: any }[] | undefined;
    if (!props) return undefined;
    const p = props.find((pp) => pp.name === key);
    if (!p) return undefined;
    return !!p.value;
  }

  // -------------------------
  // YOU DIED + RESTART
  // -------------------------
  private getDeathMessageScreenY() {
    const cam = this.cameras.main;
    const h = cam.height;

    if (this.goalUfo) {
      const screenY = this.goalUfo.y - cam.scrollY + 120;
      return Phaser.Math.Clamp(screenY, 90, h - 90);
    }

    return h * 0.5;
  }
  private getDeathMessage(): string {
  if (this.level === 3) return "Non puoi prendere l'ufo da qui ,ops\nRicomincia...";
  return "Sei morto\nRicomincia...";
  }


  private onPlayerDied() {
    if (this.dead) return;
    this.dead = true;

    this.levelEnding = true;
    this.freezePlayer();
    this.penquin?.setVisible(false);

    if (this.terminalOpen) this.closeTerminal();

    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;

    this.deathOverlay?.destroy();
    this.deathOverlay = this.add
      .rectangle(0, 0, w, h, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(99998);

    this.deathText?.destroy();
    this.deathText = this.add
      .text(w * 0.5, this.getDeathMessageScreenY(), this.getDeathMessage(), {
        fontFamily: "Arial",
        fontSize: "48px",
        color: "#ffffff",
        align: "center",
        stroke: "#000000",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(99999);

    this.time.delayedCall(1100, () => this.restartLevel());
  }

  private restartLevel() {
    // ✅ IMPORTANTISSIMO: se muori, devi rifare la task
    this.resetGitTaskForThisLevel();
    this.usedQuestionTiles.clear();

    this.deathOverlay?.destroy();
    this.deathOverlay = undefined;

    this.deathText?.destroy();
    this.deathText = undefined;

    this.scene.restart({ level: this.level, introDrop: false });
  }

  // -------------------------
  // BLOCCO USCITA (TASK NON COMPLETATA)
  // -------------------------
  private blockGoalExit() {
    if (!this.penquin) return;

    const newX = this.penquin.x + this.GOAL_BLOCK_PUSH_X;
    const newY = this.penquin.y;

    this.penquin.setPosition(newX, newY);
    this.penquin.setVelocity(0, 0);

    if (this.GOAL_BLOCK_SHAKE && this.goalUfo) {
      this.tweens.add({
        targets: this.goalUfo,
        x: this.goalUfo.x + 6,
        duration: 60,
        yoyo: true,
        repeat: 3,
      });
    }
  }

  // -------------------------
  // CUTSCENES
  // -------------------------
  // --- ENEMIES ---
  private enemies: Phaser.Physics.Matter.Sprite[] = [];



  private playIntroDrop(spawnX: number, spawnY: number) {
    if (!this.penquin) return;
    if (this.introPlayerFrozen) return;

    this.introPlayerFrozen = true;
    this.freezePlayer();

    this.penquin.setVisible(false);

    const startY = spawnY - 260;
    const landY = spawnY - 40;

    this.introUfo?.destroy();
    this.introUfo = this.add.image(spawnX, startY, "ufo").setDepth(900);

    this.tweens.add({
      targets: this.introUfo,
      y: landY,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.penquin?.setPosition(spawnX, spawnY + this.PLAYER_SPAWN_Y_OFFSET);
        this.penquin?.setVisible(true);

        this.tweens.add({
          targets: this.introUfo,
          y: landY - 320,
          duration: 700,
          ease: "Sine.easeIn",
          onComplete: () => {
            this.introUfo?.destroy();
            this.introUfo = undefined;
            this.introPlayerFrozen = false;
          },
        });
      },
    });
  }

  private playUfoExitCutscene(ufoX: number, ufoY: number) {
    if (this.levelEnding || this.dead) return;
    this.levelEnding = true;

    if (!this.penquin) {
      this.onLevelComplete();
      return;
    }

    this.freezePlayer();

    const ufo = this.goalUfo ?? this.add.image(ufoX, ufoY, "ufo").setOrigin(0.5).setDepth(900);
    ufo.setDepth(900);

    const px = this.penquin.x;
    const py = this.penquin.y;

    this.penquin.setVisible(false);

    const fake = this.add
      .sprite(px, py, "penquin")
      .setOrigin(0.5, 0.365)
      .setScale(1.5)
      .setDepth(901);

    const targetX = ufo.x;
    const targetY = ufo.y + this.UFO_SEAT_Y_OFFSET;

    this.tweens.add({
      targets: fake,
      x: targetX,
      y: targetY,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: fake,
          alpha: 0,
          duration: 160,
          onComplete: () => fake.destroy(),
        });

        this.tweens.add({
          targets: ufo,
          x: ufo.x + 240,
          y: ufo.y - 360,
          duration: 850,
          ease: "Sine.easeIn",
          onComplete: () => {
            ufo.destroy();
            this.goalUfo = undefined;
            this.onLevelComplete();
          },
        });
      },
    });
  }

  // -------------------------
  // TERMINAL
  // -------------------------
  private openTerminal() {
    if (this.terminalOpen) return;
    this.terminalOpen = true;
    this.terminalInput = "";
    this.terminalStep = 1;

    this.buildTerminal();
    this.layoutTerminal();
    this.refreshTerminalInput();
  }

  private closeTerminal() {
    this.terminalOpen = false;
    this.terminalInput = "";
    this.terminalContainer?.destroy(true);
    this.terminalContainer = undefined;

    this.input.keyboard?.off("keydown", this.onTerminalKeyDown, this);
  }

  private layoutTerminal() {
    if (!this.terminalContainer) return;
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;
    this.terminalContainer.setPosition(Math.floor(w * 0.5), Math.floor(h * 0.36));
  }

  private showLightHint() {

    this.hintBox?.destroy();
    this.hintBox = undefined;

      const cam = this.cameras.main;
      const w = cam.width;
      const h = cam.height;

      const boxW = Math.min(520, w * 0.8);
      const boxH = 90;

      const box = this.add.rectangle(0, 0, boxW, boxH, 0x000000, 0.8)
        .setStrokeStyle(2, 0xffffff, 0.25);


      const text = this.add.text(0, 0,
        "Trova un modo per vedere meglio\nin questo livello buio…",
        {
          fontFamily: "Arial",
          fontSize: "22px",
          color: "#ffffff",
          align: "center",
          wordWrap: { width: boxW - 32 }
        }
      ).setOrigin(0.5);

      this.hintBox = this.add.container(
        w * 0.5,
        Math.max(80, h * 0.15),
        [box, text]
      );

      this.hintBox.setScrollFactor(0);
      this.hintBox.setDepth(99997);

      // fade-in
      this.hintBox.alpha = 0;
      this.tweens.add({
        targets: this.hintBox,
        alpha: 1,
        duration: 300,
        ease: "Power2"
      });

      // auto-hide dopo un po’
      this.time.delayedCall(2600, () => {
        this.tweens.add({
          targets: this.hintBox,
          alpha: 0,
          duration: 100,
          onComplete: () => this.hintBox?.destroy()
        });
      });
    }

  private buildTerminal() {
    this.terminalContainer?.destroy(true);

    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    const boxW = Math.floor(w * 0.78);
    const boxH = Math.floor(h * 0.52);

    const TITLE = "32px";
    const OBJ = "24px";
    const EXPLAIN = "20px";
    const HINT = "22px";
    const CMD = "24px";
    const FEEDBACK = "20px";
    const PROMPT = "26px";
    const FOOTER = "18px";

    const bg = this.add.rectangle(0, 0, boxW, boxH, 0x000000, 0.82).setStrokeStyle(2, 0xffffff, 0.22);

    const title = this.add.text(-boxW / 2 + 22, -boxH / 2 + 14, `Terminale Git — Livello ${this.level}`, {
      fontFamily: "monospace",
      fontSize: TITLE,
      color: "#ffffff",
    });

    const objective = this.add.text(-boxW / 2 + 22, -boxH / 2 + 58, ``, {
      fontFamily: "monospace",
      fontSize: OBJ,
      color: "#ffd84d",
    });

    const explain = this.add.text(-boxW / 2 + 22, -boxH / 2 + 92, ``, {
      fontFamily: "monospace",
      fontSize: EXPLAIN,
      color: "#cfcfcf",
      wordWrap: { width: boxW - 44 },
    });

    const hint = this.add.text(-boxW / 2 + 22, -boxH / 2 + 150, `Scrivi esattamente:`, {
      fontFamily: "monospace",
      fontSize: HINT,
      color: "#ffffff",
    });

    const cmd = this.add.text(-boxW / 2 + 22, -boxH / 2 + 184, ``, {
      fontFamily: "monospace",
      fontSize: CMD,
      color: "#00ff6a",
    });

    const feedback = this.add.text(-boxW / 2 + 22, -boxH / 2 + 220, ``, {
      fontFamily: "monospace",
      fontSize: FEEDBACK,
      color: "#00ff6a",
      wordWrap: { width: boxW - 44 },
    });

    const prompt = this.add.text(-boxW / 2 + 22, -boxH / 2 + 280, `>`, {
      fontFamily: "monospace",
      fontSize: PROMPT,
      color: "#ffffff",
    });

    this.terminalInputText = this.add.text(-boxW / 2 + 50, -boxH / 2 + 280, ``, {
      fontFamily: "monospace",
      fontSize: PROMPT,
      color: "#ffffff",
    });

    this.terminalCursorText = this.add.text(-boxW / 2 + 50, -boxH / 2 + 280, `▌`, {
      fontFamily: "monospace",
      fontSize: PROMPT,
      color: "#ffffff",
    });

    this.tweens.add({ targets: this.terminalCursorText, alpha: 0, duration: 450, yoyo: true, repeat: -1 });

    const footer = this.add.text(
      -boxW / 2 + 22,
      boxH / 2 - 34,
      `Invio = esegui   |   Backspace = cancella   |   CTRL-C = chiudi`,
      { fontFamily: "monospace", fontSize: FOOTER, color: "#bbbbbb" }
    );

    this.terminalContainer = this.add.container(0, 0, [
      bg,
      title,
      objective,
      explain,
      hint,
      cmd,
      feedback,
      prompt,
      this.terminalInputText,
      this.terminalCursorText,
      footer,
    ]);

    this.terminalContainer.setDepth(99999).setScrollFactor(0);

    (this.terminalContainer as any).__objective = objective;
    (this.terminalContainer as any).__explain = explain;
    (this.terminalContainer as any).__cmd = cmd;
    (this.terminalContainer as any).__feedback = feedback;

    this.renderTerminalStep();
    this.input.keyboard?.on("keydown", this.onTerminalKeyDown, this);
  }

    private renderTerminalStep() {
    if (!this.terminalContainer) return;

    const objective: Phaser.GameObjects.Text = (this.terminalContainer as any).__objective;
    const explain: Phaser.GameObjects.Text = (this.terminalContainer as any).__explain;
    const cmd: Phaser.GameObjects.Text = (this.terminalContainer as any).__cmd;
    const feedback: Phaser.GameObjects.Text = (this.terminalContainer as any).__feedback;

    feedback.setText("");



    // 🔹 LIVELLO 3 → git pull (rimuove il buio)
    if (this.level === 3) {
      objective.setText("Obiettivo: aggiorna il repository.");
      explain.setText(
        "Il repository remoto contiene nuovi dati. Usa git pull per sincronizzare e rendere visibile il mondo."
      );
      cmd.setText(`> ${this.CMD_PULL}`);
      cmd.setColor("#00ff6a");

      this.terminalInput = "";
      this.refreshTerminalInput();
      return;
    }



    // 🔹 LIVELLO 2 → SOLO GIT CLONE
    if (this.level === 2) {
      objective.setText("Obiettivo: clona il repository.");
      explain.setText(
        "Usa git clone per copiare un repository remoto sul tuo computer."
      );
      cmd.setText(`> ${this.CMD_CLONE}`);
      cmd.setColor("#00ff6a");

      this.terminalInput = "";
      this.refreshTerminalInput();
      return;
    }

    // 🔹 LIVELLO 1 (come prima)
    if (this.terminalStep === 1) {
      objective.setText(`Obiettivo: git add (staging).`);
      explain.setText(
        `Si usa "git add" per mettere game.json nello staging: cioè scegli quali modifiche finiranno nel prossimo commit.`
      );
      cmd.setText(`> ${this.CMD_ADD}`);
      cmd.setColor("#00ff6a");
    } else {
      objective.setText(`Obiettivo: git commit (salvataggio).`);
      explain.setText(
        `Dopo lo staging, "git commit" crea uno snapshot nella cronologia con un messaggio: da qui in poi la modifica è tracciata.`
      );
      cmd.setText(`> ${this.CMD_COMMIT}`);
      cmd.setColor("#00ff6a");
    }

    this.terminalInput = "";
    this.refreshTerminalInput();
  }


  private onTerminalKeyDown(e: KeyboardEvent) {
    if (!this.terminalOpen) return;

    e.stopPropagation();
    e.preventDefault();

    if (e.ctrlKey && e.key === "c") {
      this.closeTerminal();
      return;
    }

    if (e.key === "Backspace") {
      this.terminalInput = this.terminalInput.slice(0, -1);
      this.refreshTerminalInput();
      return;
    }

    if (e.key === "Enter") {
      this.executeTerminalCommand();
      return;
    }

    // Handle "Dead" keys (modifier keys for accents/quotes)
    // Use e.key if it's a single character, otherwise use e.code for common symbols
    if (e.key === "Dead") {
      // Try to get the character from e.code and shift state
      // e.code examples: "Quote", "Backquote", "BracketLeft", "BracketRight", "Digit6" (for ^)
      // We'll handle the most common ones for quotes and caret
      let char = "";
      switch (e.code) {
        case "Quote":
          char = e.shiftKey ? '"' : "'";
          break;
        case "Backquote":
          char = "`";
          break;
        case "Digit6":
          if (e.shiftKey) char = "^";
          break;
        // Add more cases as needed for your keyboard layout
      }
      if (char) {
        this.terminalInput += char;
        this.refreshTerminalInput();
      }
      return;
    }

    if (e.key.length === 1) {
      this.terminalInput += e.key;
      this.refreshTerminalInput();
    }
  }

  private refreshTerminalInput() {
    if (!this.terminalInputText || !this.terminalCursorText) return;
    this.terminalInputText.setText(this.terminalInput);
    this.terminalCursorText.setX(this.terminalInputText.x + this.terminalInputText.width + 6);
  }

  private executeTerminalCommand() {
    const typed = this.terminalInput.trim();

    const feedback: Phaser.GameObjects.Text | undefined = this.terminalContainer
      ? (this.terminalContainer as any).__feedback
      : undefined;


      // 🔹 LIVELLO 3 → git pull
      if (this.level === 3) {
        if (typed === this.CMD_PULL) {
          feedback?.setColor("#00ff6a");
          feedback?.setText("✓ Repository aggiornato\n✓ Visibilità ripristinata");

          this.completeGitFileTask();
          this.revealWorld();

          this.time.delayedCall(600, () => this.closeTerminal());
          return;
        }

        feedback?.setColor("#ff4d4d");
        feedback?.setText(`Comando errato. Scrivi: ${this.CMD_PULL}`);
        return;
      }




    // 🔹 LIVELLO 2 → git clone
    if (this.level === 2) {
      if (typed === this.CMD_CLONE) {
        feedback?.setColor("#00ff6a");
        feedback?.setText("OK ✅ Repository clonato!");

        this.completeGitFileTask();
        this.spawnClonePlayer();

        this.time.delayedCall(500, () => {
          this.closeTerminal();
        });

        return;
      }

      feedback?.setColor("#ff4d4d");
      feedback?.setText(`Comando errato. Scrivi: ${this.CMD_CLONE}`);
      return;
    }

    // 🔹 LIVELLO 1 → git add + git commit

    if (this.terminalStep === 1) {
      if (typed === this.CMD_ADD) {
        feedback?.setColor("#00ff6a");
        feedback?.setText(`OK ✅  game.json è nello staging. Ora fai il commit.`);

        localStorage.setItem(`lvl${this.level}_git_add_done`, "1");

        this.terminalStep = 2;
        this.time.delayedCall(650, () => this.renderTerminalStep());
        return;
      }

      feedback?.setColor("#ff4d4d");
      feedback?.setText(`Comando errato. Scrivi: ${this.CMD_ADD}`);
      return;
    }

    if (this.terminalStep === 2) {
      if (typed === this.CMD_COMMIT) {
        feedback?.setColor("#00ff6a");
        feedback?.setText(`OK ✅  Commit creato!`);

        localStorage.setItem(`lvl${this.level}_git_commit_done`, "1");

        this.completeGitFileTask();
      
        this.time.delayedCall(650, () => this.closeTerminal());
        return;
      }

      feedback?.setColor("#ff4d4d");
      feedback?.setText(`Comando errato. Scrivi: ${this.CMD_COMMIT}`);
      return;
    }
  }

    private createTerminalTriggerFromTiles(
      layer: Phaser.Tilemaps.TilemapLayer
    ) {
      let found: { x: number; y: number } | null = null;

      layer.forEachTile((t) => {
        if (!t || t.index < 0 || found) return;

        const p = t.properties as any;
        if (p?.git === "file") {
          found = { x: t.x, y: t.y };
        }
      });

      if (!found) return;

      const { x, y } = found;

      const tileW = layer.tilemap.tileWidth;
      const tileH = layer.tilemap.tileHeight;

      const cx = x * tileW + tileW / 2;
      const cy = y * tileH + tileH / 2;

      const body = this.matter.add.rectangle(
        cx,
        cy,
        tileW * 1.2,
        tileH * 1.2,
        {
          isStatic: true,
          isSensor: true,
          label: "git-terminal-trigger",
        }
      );

      this.terminalTriggerBody = body;
    }

  private spawnClonePlayer() {
  const mapKey = `tilemap${this.level}`;
  const map = this.make.tilemap({ key: mapKey });
  const objectsLayer = map.getObjectLayer("objects");
  if (!objectsLayer || !this.penquin) return;

  const spawn = objectsLayer.objects.find(o => o.name === "penquin-spawn clone");
  if (!spawn) return;

  const x = (spawn.x ?? 0) + (spawn.width ?? 0) / 2;
  const y = spawn.y ?? 0;

  this.penquin.setPosition(x, y + this.PLAYER_SPAWN_Y_OFFSET);
}



    private isPlayerInsideRectBody(player: MatterJS.BodyType, rect: MatterJS.BodyType) {
    const px = player.position.x;

    // ⬇️ piedi del player (non il centro)
    const py = player.bounds.max.y;

    const b = rect.bounds;

    return px >= b.min.x && px <= b.max.x && py >= b.min.y && py <= b.max.y;
  }


  private gitFileKey() {
    return `lvl${this.level}_git_file_completed`;
  }

  private isGitFileTaskCompleted() {
    return localStorage.getItem(this.gitFileKey()) === "1";
  }

  private completeGitFileTask() {
    localStorage.setItem(this.gitFileKey(), "1");
    this.removeGitFileTiles();

    if (this.terminalTriggerBody) {
      this.matter.world.remove(this.terminalTriggerBody);
      this.terminalTriggerBody = undefined;
    }
    this.terminalTriggerInside = false;
  }

  private removeGitFileTiles() {
    if (!this.groundLayer) return;
    if (!this.gitFileTiles.length) return;

    for (const tile of this.gitFileTiles) {
      this.groundLayer.removeTileAt(tile.x, tile.y);
    }
    this.gitFileTiles = [];
  }
  

  private revealWorld() {
  if (!this.darkness) return;

    this.isDarkLevel = false;

    this.tweens.add({
      targets: this.darkness,
      alpha: 0,
      duration: 800,
      ease: "Power2",
      onComplete: () => {
        this.darkness?.destroy();
        this.lightMask?.destroy();

        this.darkness = undefined;
        this.lightMask = undefined;

      },
    });
  }





  private createGoBackButton() {
    const btn = this.add
      .text(16, 16, "← Go back", {
        fontFamily: "Arial",
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { left: 10, right: 10, top: 6, bottom: 6 },
      })
      .setScrollFactor(0)
      .setDepth(9999)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setStyle({ backgroundColor: "#ffffffaa", color: "#000000" }));
    btn.on("pointerout", () => btn.setStyle({ backgroundColor: "#000000aa", color: "#ffffff" }));
    btn.on("pointerdown", () => this.goBackToMenu());
  }

  private goBackToMenu() {
    const unlocked = (this.registry.get("unlocked") as number) ?? 1;
    this.scene.start("level-select", { unlocked });
  }

  private onLevelComplete() {
    const currentUnlocked = (this.registry.get("unlocked") as number) ?? 1;
    const nextUnlocked = Math.max(currentUnlocked, this.level + 1);
    
    this.playWinOnlyOnce();

    this.registry.set("unlocked", nextUnlocked);
    localStorage.setItem("unlocked", String(nextUnlocked));

    this.time.delayedCall(900, () => {
    this.scene.start("level-select", { unlocked: nextUnlocked });
    });

  }

  





}
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

  constructor() {
    super("game");
  }

  init(data: { level?: number; introDrop?: boolean } = {}) {
    this.level = data.level ?? 1;
    this.introDrop = !!data.introDrop;

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

    this.load.atlas("penquin", "assets/penquin.png", "assets/penquin.json");
    this.load.image("tiles", "assets/sheet.png");
    this.load.image("ufo", "assets/ufo.png");

    this.load.tilemapTiledJSON("tilemap", "assets/game.json");
    this.load.tilemapTiledJSON("tilemap2", "assets/game2.json");
    this.load.tilemapTiledJSON("tilemap3", "assets/game3.json");
    this.load.tilemapTiledJSON("tilemap4", "assets/game4.json");
  }

  create() {
    const cam = this.cameras.main;
    cam.setRoundPixels(true);

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

    // --- Map + tileset ---
    const map = this.make.tilemap({ key: mapKey });
    const tileset = map.addTilesetImage("iceworld", "tiles");

    if (!tileset) {
      console.error(`[Game] Tileset not found. In Tiled tileset name must be "iceworld".`);
      this.createGoBackButton();
      return;
    }

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

    // collision per i tile solidi
    ground.setCollisionByProperty({ collides: true });
    this.matter.world.convertTilemapLayer(ground);

    // death zones dai TILE con proprietà death-zone=true
    this.createDeathZonesFromTiles(ground);

    // World bounds / camera bounds
    cam.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.matter.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels, 64, true, true, true, true);

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
      .setFixedRotation();

    this.playerController = new PlayerController(this, this.penquin, this.cursors);
    cam.startFollow(this.penquin, true);
    this._basePlayerY = this.penquin.y;

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
      }
    });

    
    // UI
    this.createGoBackButton();
    
    // cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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

    // backup: se cade sotto mappa muore
    if (!this.dead && !this.levelEnding && this.penquin && this.penquin.y > this.deathY) {
      this.onPlayerDied();
    }
  }

  private freezePlayer() {
    if (!this.penquin) return;
    const body = this.penquin.body as MatterJS.BodyType | undefined;
    if (!body) return;

    this.penquin.setVelocity(0, 0);
    this.penquin.setAngularVelocity(0);
  }

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
      .text(w * 0.5, this.getDeathMessageScreenY(), "Sei morto\nRicomincia...", {
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

  private createTerminalTriggerFromTiles(layer: Phaser.Tilemaps.TilemapLayer) {
    const map = layer.tilemap;
    const w = map.tileWidth;
    const h = map.tileHeight;

    let found: { x: number; y: number } | null = null;

    layer.forEachTile((t) => {
      if (!t || t.index < 0) return;
      const p = t.properties as any;
      if (p && p.git === "file") found = { x: t.x, y: t.y };
    });

    if (!found) return;

    const cx = found.x * w + w / 2;
    const cy = found.y * h + h / 2;

    const body = this.matter.add.rectangle(cx, cy, w * 1.2, h * 1.2, {
      isStatic: true,
      isSensor: true,
      label: "git-terminal-trigger",
    });

    this.terminalTriggerBody = body;
  }

  private isPlayerInsideRectBody(player: MatterJS.BodyType, rect: MatterJS.BodyType) {
    const px = player.position.x;
    const py = player.position.y;
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

    this.registry.set("unlocked", nextUnlocked);
    localStorage.setItem("unlocked", String(nextUnlocked));

    this.scene.start("level-select", { unlocked: nextUnlocked });
  }
}

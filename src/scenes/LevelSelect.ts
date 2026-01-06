// LevelSelect.ts
import Phaser from "phaser";

type LevelSelectData = { unlocked?: number };

type PlanetDef = {
  key: string;
  level: number;
  sprite?: Phaser.GameObjects.Image;
  label?: Phaser.GameObjects.Text;
};

type InitDoneMap = Record<number, boolean>;

export default class LevelSelect extends Phaser.Scene {
  private unlocked = 1;

  private bg!: Phaser.GameObjects.Image;
  private orbitsOverlay!: Phaser.GameObjects.Image;
  private face!: Phaser.GameObjects.Image;

  private pupilL!: Phaser.GameObjects.Image;
  private pupilR!: Phaser.GameObjects.Image;

  private eyeL = new Phaser.Math.Vector2();
  private eyeR = new Phaser.Math.Vector2();

  private eyeOffsetL = new Phaser.Math.Vector2(9, -1);
  private eyeOffsetR = new Phaser.Math.Vector2(116, -1);

  private maxOffsetX = 10;
  private maxOffsetY = 10;

  private planets: PlanetDef[] = [];

  // ====== TUNING ======
  private readonly PLANET_SCALE = 0.22;
  private readonly FACE_SCALE = 0.9;

  private readonly ORBITS_ALPHA = 0.18;
  private readonly LOCKED_ALPHA = 0.45;
  private readonly HOVER_SCALE = 1.06;

  private readonly USE_CLAMP = false;
  private readonly PLANET_PADDING = 20;
  // ====================

  private initDone: InitDoneMap = {};

  private inputBlocker?: Phaser.GameObjects.Rectangle;
  private commandContainer?: Phaser.GameObjects.DOMElement;
  private pendingLevel?: number;

  // ✅ Audio
  private clickSfx?: Phaser.Sound.BaseSound;
  private music?: Phaser.Sound.BaseSound;

  constructor() {
    super("level-select");
  }

  init(data: LevelSelectData = {}) {
    const fromData = data.unlocked;

    const fromRegistryRaw = this.registry.get("unlocked");
    const fromRegistry = typeof fromRegistryRaw === "number" ? fromRegistryRaw : undefined;

    const fromStorage = Number(localStorage.getItem("unlocked") ?? "1") || 1;

    this.unlocked = fromData ?? fromRegistry ?? fromStorage ?? 1;

    this.initDone = this.loadInitDone();

    this.registry.set("unlocked", this.unlocked);
    localStorage.setItem("unlocked", String(this.unlocked));
  }

  preload() {
    this.load.setPath("assets/");

    this.load.image("menuBg", "menuBg.png");
    this.load.image("octoFace", "octoFace.png");
    this.load.image("pupil", "pupil.png");

    this.load.image("planet1", "planet1.png");
    this.load.image("planet2", "planet2.png");
    this.load.image("planet3", "planet3.png");
    this.load.image("planet4", "planet4.png");

    // ✅ audio (così funziona anche se arrivi qui senza passare dal Menu)
    this.load.audio("sfx_click", "computer-mouse-click-352734.mp3");
    this.load.audio("music_menu", "356-8-bit-chiptune-game-music-357518.mp3");

    this.load.on("loaderror", (file: any) => {
      console.error("[LevelSelect] LOAD ERROR:", file?.key, file?.src);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#15263B");

    // ✅ setup audio (continua musica menu)
    this.setupAudio();

    this.bg = this.add.image(0, 0, "menuBg").setOrigin(0.5).setDepth(0);

    // Remove rx/ry from here, only keep key and level
    this.planets = [
      { key: "planet1", level: 1 },
      { key: "planet2", level: 2 },
      { key: "planet3", level: 3 },
      { key: "planet4", level: 4 },
    ];

    this.planets.forEach((p) => {
      const spr = this.add.image(0, 0, p.key).setOrigin(0.5).setDepth(5);
      spr.setScale(this.PLANET_SCALE);
      p.sprite = spr;

      const label = this.add
        .text(0, 0, String(p.level), {
          fontFamily: "Arial",
          fontSize: "20px",
          color: "#ffffff",
          stroke: "#000000",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(9);
      p.label = label;

      this.enablePlanetInteractivity(p);
    });

    this.orbitsOverlay = this.add
      .image(0, 0, "menuBg")
      .setOrigin(0.5)
      .setDepth(6)
      .setAlpha(this.ORBITS_ALPHA);

    this.face = this.add.image(0, 0, "octoFace").setOrigin(0.5).setDepth(10);
    this.pupilL = this.add.image(0, 0, "pupil").setOrigin(0.5).setDepth(11);
    this.pupilR = this.add.image(0, 0, "pupil").setOrigin(0.5).setDepth(11);

    this.layout();
    this.refreshPlanetVisualState();
    this.createGoBackButton();

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.updatePupil(this.pupilL, this.eyeL, world.x, world.y);
      this.updatePupil(this.pupilR, this.eyeR, world.x, world.y);
    });

    this.input.on("gameout", () => {
      this.pupilL.setPosition(this.eyeL.x, this.eyeL.y);
      this.pupilR.setPosition(this.eyeR.x, this.eyeR.y);
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => {
      this.layout();
      this.refreshPlanetVisualState();
    });
  }

  // =========================
  // ✅ AUDIO
  // =========================
  private setupAudio() {
    // click
    if (!this.clickSfx) {
      this.clickSfx = this.sound.add("sfx_click", { volume: 0.6 });
    }

    // musica: se già esiste (da Menu) NON la ricreo, la riuso
    const existing = this.sound.get("music_menu");
    if (existing) {
      this.music = existing;
      if (!this.music.isPlaying) this.music.play({ loop: true, volume: 0.35 });
    } else {
      this.music = this.sound.add("music_menu", { loop: true, volume: 0.35 });
      this.music.play();
    }
  }

  private playClick() {
    if (!this.clickSfx) return;
    if (this.clickSfx.isPlaying) this.clickSfx.stop();
    this.clickSfx.play();
  }

  private stopMenuMusic() {
    const m = this.sound.get("music_menu");
    if (!m) return;
    m.stop();
    m.destroy();
  }

  // =========================
  // Planet interactivity
  // =========================
  private enablePlanetInteractivity(p: PlanetDef) {
    const spr = p.sprite!;
    spr.removeAllListeners();
    spr.disableInteractive();

    spr.setInteractive({
      useHandCursor: true,
      pixelPerfect: true,
      alphaTolerance: 1,
    });

    spr.on("pointerover", () => spr.setScale(this.PLANET_SCALE * this.HOVER_SCALE));
    spr.on("pointerout", () => spr.setScale(this.PLANET_SCALE));

    spr.on("pointerdown", () => {
      this.playClick();
      this.onPlanetClicked(p.level);
    });
  }

  private disableAllPlanetsInteractivity() {
    this.planets.forEach((p) => p.sprite?.disableInteractive());
  }

  private enableAllPlanetsInteractivity() {
    this.planets.forEach((p) => this.enablePlanetInteractivity(p));
  }

  private onPlanetClicked(level: number) {
    // locked
    if (level > this.unlocked) return;

    // ✅ se è già initDone -> entra diretto (NO intro)
    if (this.initDone[level]) {
      // ✅ salva ultimo livello avviato
      localStorage.setItem("currentLevel", String(level));

      // entrando nel gioco: stop musica menu
      this.stopMenuMusic();
      this.scene.start("game", { level });
      return;
    }

    this.openCommandPrompt(level);
  }

  // =========================
  // Command prompt (git init)
  // =========================
  private openCommandPrompt(level: number) {
    this.closeCommandPrompt();
    this.pendingLevel = level;

    this.disableAllPlanetsInteractivity();

    const w = this.scale.width;
    const h = this.scale.height;

    this.inputBlocker = this.add
      .rectangle(0, 0, w, h, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9998)
      .setInteractive();

    const html = `
      <div style="width: min(520px, 86vw); font-family: Arial; color: white; text-align:center;">
        <div style="margin-bottom:10px; font-size:16px; opacity:0.95;">
          Type the command to initialize this level:
        </div>
        <input id="cmd" type="text"
          style="
            width: 100%;
            padding: 10px 12px;
            font-size: 18px;
            border-radius: 10px;
            border: 2px solid rgba(255,255,255,0.35);
            outline: none;
            background: rgba(0,0,0,0.45);
            color: white;
          "
          placeholder="git init"
        />
        <div style="margin-top:10px; font-size:13px; opacity:0.8;">
          (Press Enter • Esc to cancel)
        </div>
      </div>
    `;

    this.commandContainer = this.add.dom(w * 0.5, h * 0.65).createFromHTML(html).setDepth(9999);

    const input = this.commandContainer.getChildByID("cmd") as HTMLInputElement | null;

    if (input) {
      const stop = (e: Event) => e.stopPropagation();
      input.addEventListener("keydown", stop);
      input.addEventListener("keyup", stop);
      input.addEventListener("keypress", stop);

      this.input.keyboard?.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);

      input.focus();

      input.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Escape") {
          this.closeCommandPrompt();
          return;
        }

        if (ev.key === "Enter") {
          const value = (input.value || "").trim().toLowerCase();

          if (value === "git init") {
            this.initDone[level] = true;
            this.saveInitDone(this.initDone);

            // ✅ salva l'ultimo pianeta dove hai fatto git init
            localStorage.setItem("lastInitLevel", String(level));
            // ✅ opzionale ma utile: salva anche il current
            localStorage.setItem("currentLevel", String(level));

            this.refreshPlanetVisualState();
            this.closeCommandPrompt();

            // entrando nel gioco: stop musica menu
            this.stopMenuMusic();
            this.scene.start("game", { level, introDrop: true });
          } else {
            input.style.borderColor = "rgba(255, 80, 80, 0.85)";
            setTimeout(() => (input.style.borderColor = "rgba(255,255,255,0.35)"), 250);
          }
        }
      });
    }

    this.input.keyboard?.once("keydown-ESC", () => this.closeCommandPrompt());
  }

  private closeCommandPrompt() {
    this.pendingLevel = undefined;

    this.commandContainer?.destroy();
    this.commandContainer = undefined;

    this.inputBlocker?.destroy();
    this.inputBlocker = undefined;

    this.enableAllPlanetsInteractivity();
    this.refreshPlanetVisualState();
  }

  private refreshPlanetVisualState() {
    this.planets.forEach((p) => {
      const spr = p.sprite!;
      const label = p.label!;

      const locked = p.level > this.unlocked;
      if (locked) {
        spr.setAlpha(this.LOCKED_ALPHA);
        label.setAlpha(0.6);
        return;
      }

      const done = !!this.initDone[p.level];
      spr.setAlpha(done ? 1 : 0.75);
      label.setAlpha(1);
    });
  }

  // =========================
  // Layout
  // =========================
  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    const bgS = Math.min(w / this.bg.width, h / this.bg.height);
    this.bg.setScale(bgS).setPosition(cx, cy);
    this.orbitsOverlay.setScale(bgS).setPosition(cx, cy);

    this.face.setScale(this.FACE_SCALE).setPosition(cx, cy);

    const fx = this.face.scaleX;
    const fy = this.face.scaleY;

    this.eyeL.set(cx + this.eyeOffsetL.x * fx, cy + this.eyeOffsetL.y * fy);
    this.eyeR.set(cx + this.eyeOffsetR.x * fx, cy + this.eyeOffsetR.y * fy);

    this.pupilL.setPosition(this.eyeL.x, this.eyeL.y);
    this.pupilR.setPosition(this.eyeR.x, this.eyeR.y);

    // Use ellipse for planet positions
    const rx = w * 0.43;
    const ry = h * 0.32;
    const padding = this.PLANET_PADDING;

    // Custom angles for 4 planets: 1 (top), 2 (left edge), 3 (bottom), 4 (right edge)
    const angles = [
      -Math.PI / 2,           // top (planet 1)
      -Math.PI,               // left edge (planet 2)
      Math.PI / 2,            // bottom (planet 3)
      0,                      // right edge (planet 4)
    ];

    this.planets.forEach((p, i) => {
      const spr = p.sprite!;
      const label = p.label!;

      const angle = angles[i] ?? (-Math.PI / 2 + i * ((Math.PI * 2) / this.planets.length));
      let x = cx + Math.cos(angle) * rx;
      let y = cy + Math.sin(angle) * ry;

      // Clamp so planets don't go outside the screen
      const halfW = spr.displayWidth * 0.5;
      const halfH = spr.displayHeight * 0.5;
      x = Phaser.Math.Clamp(x, padding + halfW, w - padding - halfW);
      y = Phaser.Math.Clamp(y, padding + halfH, h - padding - halfH);

      spr.setPosition(Math.round(x), Math.round(y));
      label.setPosition(spr.x, spr.y - spr.displayHeight * 0.65);
    });

    if (this.inputBlocker) this.inputBlocker.setSize(w, h);
    if (this.commandContainer) this.commandContainer.setPosition(w * 0.5, h * 0.65);
  }

  private updatePupil(
    pupil: Phaser.GameObjects.Image,
    eyeCenter: Phaser.Math.Vector2,
    targetX: number,
    targetY: number
  ) {
    const dx = targetX - eyeCenter.x;
    const dy = targetY - eyeCenter.y;

    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    const offX = Phaser.Math.Clamp(nx * this.maxOffsetX, -this.maxOffsetX, this.maxOffsetX);
    const offY = Phaser.Math.Clamp(ny * this.maxOffsetY, -this.maxOffsetY, this.maxOffsetY);

    pupil.setPosition(Math.round(eyeCenter.x + offX), Math.round(eyeCenter.y + offY));
  }

  // =========================
  // Go back
  // =========================
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

    btn.on("pointerdown", () => {
      this.playClick();
      this.scene.start("menu");
    });
  }

  // =========================
  // persistence helpers
  // =========================
  private loadInitDone(): InitDoneMap {
    try {
      const raw = localStorage.getItem("initDone");
      if (!raw) return {};
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return {};
      const out: InitDoneMap = {};
      for (const k of Object.keys(obj)) out[Number(k)] = !!obj[k];
      return out;
    } catch {
      return {};
    }
  }

  private saveInitDone(map: InitDoneMap) {
    localStorage.setItem("initDone", JSON.stringify(map));
  }
}

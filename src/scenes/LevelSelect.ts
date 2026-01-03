import Phaser from "phaser";

type LevelSelectData = { unlocked?: number };

type PlanetDef = {
  key: string;
  rx: number;
  ry: number;
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

  // progress
  private initDone: InitDoneMap = {};

  // UI input
  private inputBlocker?: Phaser.GameObjects.Rectangle;
  private commandContainer?: Phaser.GameObjects.DOMElement;
  private pendingLevel?: number;

  constructor() {
    super("level-select");
  }

  init(data: LevelSelectData = {}) {
    const fromData = data.unlocked;

    const fromRegistryRaw = this.registry.get("unlocked");
    const fromRegistry =
      typeof fromRegistryRaw === "number" ? fromRegistryRaw : undefined;

    const fromStorage = Number(localStorage.getItem("unlocked") ?? "1") || 1;

    this.unlocked = fromData ?? fromRegistry ?? fromStorage ?? 1;

    // ✅ carica initDone (per non riscrivere "git init" ogni volta)
    this.initDone = this.loadInitDone();

    this.registry.set("unlocked", this.unlocked);
    localStorage.setItem("unlocked", String(this.unlocked));

    console.log("[LevelSelect] unlocked =", this.unlocked, "initDone =", this.initDone);
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

    this.load.on("loaderror", (file: any) => {
      console.error("LOAD ERROR:", file?.key, file?.src);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor("#28373C");

    this.bg = this.add.image(0, 0, "menuBg").setOrigin(0.5).setDepth(0);

    this.planets = [
      { key: "planet1", rx: 0.25, ry: -0.55, level: 1 },
      { key: "planet2", rx: -0.15, ry: 0.75, level: 2 },
      { key: "planet3", rx: -2.0, ry: 0.09, level: 3 },
      { key: "planet4", rx: 2.2, ry: 0.22, level: 4 },
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

      // ✅ pianeti SEMPRE cliccabili come hit-test,
      // ma la logica decide se aprire input / entrare / ignorare
      spr.setInteractive({
        useHandCursor: true,
        pixelPerfect: true,
        alphaTolerance: 1,
      });

      spr.on("pointerover", () => spr.setScale(this.PLANET_SCALE * this.HOVER_SCALE));
      spr.on("pointerout", () => spr.setScale(this.PLANET_SCALE));

      spr.on("pointerdown", () => this.onPlanetClicked(p.level));
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

  private onPlanetClicked(level: number) {
    // 🔒 se non sbloccato (non hai fatto UFO del precedente) => niente
    if (level > this.unlocked) {
      console.log("[LevelSelect] level locked:", level, "unlocked =", this.unlocked);
      return;
    }

    // ✅ se "git init" già fatto per questo livello => entra diretto
    if (this.initDone[level]) {
      this.scene.start("game", { level });
      return;
    }

    // ⌨️ altrimenti chiedi comando
    this.openCommandPrompt(level);
  }

  private openCommandPrompt(level: number) {
    this.closeCommandPrompt();
    this.pendingLevel = level;

    const w = this.scale.width;
    const h = this.scale.height;

    // blocker (click fuori non deve cliccare pianeti)
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
          placeholder='git init'
        />
        <div style="margin-top:10px; font-size:13px; opacity:0.8;">
          (Press Enter • Esc to cancel)
        </div>
      </div>
    `;

    this.commandContainer = this.add
      .dom(w * 0.5, h * 0.65)
      .createFromHTML(html)
      .setDepth(9999);

    const input = this.commandContainer.getChildByID("cmd") as HTMLInputElement | null;
    if (input) {
      input.focus();

      input.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key === "Enter") {
          const value = (input.value || "").trim().toLowerCase();
          if (value === "git init") {
            this.initDone[level] = true;
            this.saveInitDone(this.initDone);

            // (opzionale) puoi anche “rendere nitido” il pianeta
            this.refreshPlanetVisualState();

            this.closeCommandPrompt();
            this.scene.start("game", { level });
          } else {
            // feedback rapido
            input.style.borderColor = "rgba(255, 80, 80, 0.85)";
            setTimeout(() => (input.style.borderColor = "rgba(255,255,255,0.35)"), 250);
          }
        }
      });
    }

    // ESC chiude
    this.input.keyboard?.once("keydown-ESC", () => this.closeCommandPrompt());
  }

  private closeCommandPrompt() {
    this.pendingLevel = undefined;

    if (this.commandContainer) {
      this.commandContainer.destroy();
      this.commandContainer = undefined;
    }
    if (this.inputBlocker) {
      this.inputBlocker.destroy();
      this.inputBlocker = undefined;
    }
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

      // sbloccato:
      // se initDone[level] => pieno; se no => puoi scegliere: leggermente “locked” finché non scrivi git init
      const done = !!this.initDone[p.level];
      spr.setAlpha(done ? 1 : 0.75);
      label.setAlpha(1);
    });
  }

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

    const radius = Math.min(w, h) * 0.43;

    this.planets.forEach((p) => {
      const spr = p.sprite!;
      const label = p.label!;

      let x = cx + p.rx * radius;
      let y = cy + p.ry * radius;

      if (this.USE_CLAMP) {
        const padding = this.PLANET_PADDING;
        const halfW = spr.displayWidth * 0.5;
        const halfH = spr.displayHeight * 0.5;
        x = Phaser.Math.Clamp(x, padding + halfW, w - padding - halfW);
        y = Phaser.Math.Clamp(y, padding + halfH, h - padding - halfH);
      }

      spr.setPosition(Math.round(x), Math.round(y));
      label.setPosition(spr.x, spr.y - spr.displayHeight * 0.65);
    });

    // se prompt aperto e fai resize, riallinea overlay
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

  // -------------------------
  // persistence helpers
  // -------------------------
  private loadInitDone(): InitDoneMap {
    try {
      const raw = localStorage.getItem("initDone");
      if (!raw) return {};
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return {};
      // normalizza chiavi in numeri
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

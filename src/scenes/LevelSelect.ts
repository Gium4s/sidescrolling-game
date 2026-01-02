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

export default class LevelSelect extends Phaser.Scene {
  private unlocked = 1;

  private bg!: Phaser.GameObjects.Image;
  private orbitsOverlay!: Phaser.GameObjects.Image;
  private face!: Phaser.GameObjects.Image;

  private pupilL!: Phaser.GameObjects.Image;
  private pupilR!: Phaser.GameObjects.Image;

  private eyeL = new Phaser.Math.Vector2();
  private eyeR = new Phaser.Math.Vector2();

  // offset occhi rispetto al centro faccia (px su file originale)
  private eyeOffsetL = new Phaser.Math.Vector2(9, -1);
  private eyeOffsetR = new Phaser.Math.Vector2(116, -1);

  private maxOffsetX = 10;
  private maxOffsetY = 10;

  private planets: PlanetDef[] = [];

  // ====== TUNING ======
  private readonly PLANET_SCALE = 0.22; // <-- PIÙ PICCOLI (prova 0.25 / 0.30)
  private readonly FACE_SCALE = 0.9;

  private readonly ORBITS_ALPHA = 0.18;
  private readonly LOCKED_ALPHA = 0.45;
  private readonly HOVER_SCALE = 1.06;

  private readonly USE_CLAMP = false;
  private readonly PLANET_PADDING = 20;

  // Hit area circolare: 1.0 = raggio = metà diametro (copre quasi tutto il pianeta)
  // Se vuoi più “preciso”, metti 0.9 o 0.85
  private readonly HIT_RADIUS_RATIO = 1.0;
  // ====================

  constructor() {
    super("level-select");
  }

  init(data: LevelSelectData) {
    // per ora: se non passi niente, di default sblocchi SOLO il livello 1
    this.unlocked = data.unlocked ?? 1;
  }

  preload() {
    // ✅ Tutti gli asset serviti da public/assets => path unico
    this.load.setPath("/assets/");

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

    // BG base
    this.bg = this.add.image(0, 0, "menuBg").setOrigin(0.5).setDepth(0);

    // Pianeti (posizioni relative)
    this.planets = [
      { key: "planet1", rx: 0.25, ry: -0.55, level: 1 },
      { key: "planet2", rx: -0.15, ry: 0.75, level: 2 },
      { key: "planet3", rx: -2.0, ry: 0.09, level: 3 },
      { key: "planet4", rx: 2.2, ry: 0.22, level: 4 },
    ];

    this.planets.forEach((p) => {
      const img = this.add.image(0, 0, p.key).setOrigin(0.5).setDepth(5);
      img.setScale(this.PLANET_SCALE);
      p.sprite = img;

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

      this.applyPlanetState(p);
    });

    // Overlay orbite (stessa immagine sopra ai pianeti)
    this.orbitsOverlay = this.add
      .image(0, 0, "menuBg")
      .setOrigin(0.5)
      .setDepth(6)
      .setAlpha(this.ORBITS_ALPHA);

    // Faccia e pupille sopra
    this.face = this.add.image(0, 0, "octoFace").setOrigin(0.5).setDepth(10);
    this.pupilL = this.add.image(0, 0, "pupil").setOrigin(0.5).setDepth(11);
    this.pupilR = this.add.image(0, 0, "pupil").setOrigin(0.5).setDepth(11);

    this.layout();

    // mouse move -> pupille
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.updatePupil(this.pupilL, this.eyeL, world.x, world.y);
      this.updatePupil(this.pupilR, this.eyeR, world.x, world.y);
    });

    this.input.on("gameout", () => {
      this.pupilL.setPosition(this.eyeL.x, this.eyeL.y);
      this.pupilR.setPosition(this.eyeR.x, this.eyeR.y);
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
  }

  private canEnterLevel(level: number) {
    // PER ORA: solo 1 cliccabile (poi sblocchi con unlocked)
    // Se vuoi già la logica “unlocked”, basta tornare a: return level <= this.unlocked;
    return level === 1;
  }

  private applyPlanetState(p: PlanetDef) {
    const spr = p.sprite!;
    const label = p.label!;
    const enabled = this.canEnterLevel(p.level);

    spr.removeAllListeners();
    spr.disableInteractive();

    if (!enabled) {
      spr.setAlpha(this.LOCKED_ALPHA);
      label.setAlpha(0.6);
      return;
    }

    spr.setAlpha(1);
    label.setAlpha(1);

    // CLICK SOLO SUI PIXEL VISIBILI
    spr.setInteractive({
      useHandCursor: true,
      pixelPerfect: true,
      alphaTolerance: 1, // 1 = basta che non sia trasparente
    });

    spr.on("pointerover", () => {
      spr.setScale(this.PLANET_SCALE * this.HOVER_SCALE);
    });

    spr.on("pointerout", () => {
      spr.setScale(this.PLANET_SCALE);
    });

    spr.on("pointerdown", () => {
      console.log("CLICK planet level:", p.level);
      this.scene.start("game", { level: p.level });
    });
  }

  private setPlanetHitCircle(spr: Phaser.GameObjects.Image) {
    const r =
      Math.min(spr.displayWidth, spr.displayHeight) * 0.5 * this.HIT_RADIUS_RATIO;

    const circle = new Phaser.Geom.Circle(0, 0, r);

    spr.setInteractive(circle, (shape, x, y) => {
      return (shape as Phaser.Geom.Circle).contains(x, y);
    });
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    // BG contain
    const bgS = Math.min(w / this.bg.width, h / this.bg.height);
    this.bg.setScale(bgS).setPosition(cx, cy);
    this.orbitsOverlay.setScale(bgS).setPosition(cx, cy);

    // testa
    this.face.setScale(this.FACE_SCALE).setPosition(cx, cy);

    // occhi
    const fx = this.face.scaleX;
    const fy = this.face.scaleY;

    this.eyeL.set(cx + this.eyeOffsetL.x * fx, cy + this.eyeOffsetL.y * fy);
    this.eyeR.set(cx + this.eyeOffsetR.x * fx, cy + this.eyeOffsetR.y * fy);

    this.pupilL.setPosition(this.eyeL.x, this.eyeL.y);
    this.pupilR.setPosition(this.eyeR.x, this.eyeR.y);

    // pianeti
    const radius = Math.min(w, h) * 0.43;
    const padding = this.PLANET_PADDING;

    this.planets.forEach((p) => {
      const spr = p.sprite!;
      const label = p.label!;

      let x = cx + p.rx * radius;
      let y = cy + p.ry * radius;

      if (this.USE_CLAMP) {
        const halfW = spr.displayWidth * 0.5;
        const halfH = spr.displayHeight * 0.5;
        x = Phaser.Math.Clamp(x, padding + halfW, w - padding - halfW);
        y = Phaser.Math.Clamp(y, padding + halfH, h - padding - halfH);
      }

      spr.setPosition(Math.round(x), Math.round(y));
      label.setPosition(spr.x, spr.y - spr.displayHeight * 0.65);
    });
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

    const offX = Phaser.Math.Clamp(
      nx * this.maxOffsetX,
      -this.maxOffsetX,
      this.maxOffsetX
    );
    const offY = Phaser.Math.Clamp(
      ny * this.maxOffsetY,
      -this.maxOffsetY,
      this.maxOffsetY
    );

    pupil.setPosition(Math.round(eyeCenter.x + offX), Math.round(eyeCenter.y + offY));
  }
}

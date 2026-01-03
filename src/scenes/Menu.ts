import Phaser from "phaser";

export default class Menu extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image;

  constructor() {
    super("menu");
  }

  preload() {
    this.load.setPath("assets/");
    this.load.image("menu", "menu.png");
  }

  create() {
    // ✅ colore delle barre (e dello sfondo in generale)
    this.cameras.main.setBackgroundColor("#2C454E");

    // ✅ carico font pixel via CSS (serve avere il .ttf in public/assets)
    this.injectPixelFontCSS();

    this.bg = this.add.image(0, 0, "menu").setOrigin(0.5);

    const items = [
      { key: "play", label: "Gioca", enabled: true },
      { key: "levels", label: "Livelli", enabled: true },
      { key: "credits", label: "Credits", enabled: false },
      { key: "options", label: "Opzioni", enabled: false },
    ];

    // ✅ più in basso
    const startX = 120;
    const startY = 360;   // <-- prima era 270
    const gapY = 58;

    items.forEach((it, i) => {
      const t = this.add
        .text(startX, startY + i * gapY, it.label, {
          fontFamily: '"PixelFont", monospace', // <-- pixel se hai il ttf
          fontSize: "44px",
          color: it.enabled ? "#ffffff" : "#9a9a9a",
        })
        .setOrigin(0, 0.5)
        .setDepth(10);

      if (!it.enabled) return;

      t.setInteractive({ useHandCursor: true });

      t.on("pointerover", () => t.setColor("#FFFE7A"));
      t.on("pointerout", () => t.setColor("#ffffff"));

      t.on("pointerdown", () => {
        if (it.key === "play") this.onPlay();
        if (it.key === "levels") this.onLevels();
      });
    });

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.layout());
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w * 0.5;
    const cy = h * 0.5;

    // ✅ COVER (riempie tutto, niente bande nere)
    const s = Math.max(w / this.bg.width, h / this.bg.height);
    this.bg.setScale(s).setPosition(cx, cy);
  }

  private onPlay() {
    const savedLevel = Number(localStorage.getItem("currentLevel") ?? "0") || 0;

    if (!savedLevel || savedLevel < 1) {
      this.onLevels();
      return;
    }

    this.scene.start("game", { level: savedLevel });
  }

  private onLevels() {
    const unlocked = Number(localStorage.getItem("unlocked") ?? "1") || 1;
    this.scene.start("level-select", { unlocked });
  }

  private injectPixelFontCSS() {
    const id = "pixel-font-css";
    if (document.getElementById(id)) return;

    const style = document.createElement("style");
    style.id = id;

    // ⚠️ cambia "pixel.ttf" se il tuo font ha un altro nome
    style.innerHTML = `
      @font-face {
        font-family: "PixelFont";
        src: url("assets/pixel.ttf") format("truetype");
        font-weight: normal;
        font-style: normal;
      }
    `;

    document.head.appendChild(style);
  }
}

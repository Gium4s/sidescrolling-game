import Phaser from "phaser";

type MenuItem = {
  key: "play" | "levels" | "credits" | "options";
  label: string;
  enabled: boolean;
};

export default class Menu extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image;

  constructor() {
    super("menu");
  }

  preload() {
    this.load.setPath("assets/");
    this.load.image("menu", "menu.png");
  }

  async create() {
    // 🎨 background
    this.cameras.main.setBackgroundColor("#2C454E");

    // 🔤 font pixel
    await this.injectPixelFontCSS();

    // 🖼️ background image
    this.bg = this.add.image(0, 0, "menu").setOrigin(0.5);

    const items: MenuItem[] = [
      { key: "play", label: "Gioca", enabled: true },
      { key: "levels", label: "Livelli", enabled: true },
      { key: "credits", label: "Credits", enabled: false },
      { key: "options", label: "Opzioni", enabled: false },
    ];

    // 📐 layout menu
    const startX = 120;
    const startY = 360;
    const fontSize = 64;   // ⬅️ multiplo di 8 → pixel puliti
    const gapY = 132;       // ⬅️ spazio proporzionato al font

    items.forEach((item, index) => {
      const text = this.add.text(
        startX,
        startY + index * gapY,
        item.label,
        {
          fontFamily: '"PixelFont", monospace',
          fontSize: `${fontSize}px`,
          color: item.enabled ? "#ffffff" : "#9a9a9a",
        }
      );

      text
        .setOrigin(0, 0.5)
        .setDepth(10)
        .setResolution(1); // 🧼 pixel netti

      if (!item.enabled) return;

      text.setInteractive({ useHandCursor: true });

      text.on("pointerover", () => text.setColor("#FFFE7A"));
      text.on("pointerout", () => text.setColor("#ffffff"));

      text.on("pointerdown", () => {
        if (item.key === "play") this.onPlay();
        if (item.key === "levels") this.onLevels();
      });
    });

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
  }

  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;

    const scale = Math.max(w / this.bg.width, h / this.bg.height);
    this.bg.setScale(scale).setPosition(w * 0.5, h * 0.5);
  }

  private onPlay() {
    const savedLevel = Number(localStorage.getItem("currentLevel")) || 0;

    if (savedLevel < 1) {
      this.onLevels();
      return;
    }

    this.scene.start("game", { level: savedLevel });
  }

  private onLevels() {
    const unlocked = Number(localStorage.getItem("unlocked")) || 1;
    this.scene.start("level-select", { unlocked });
  }

  private async injectPixelFontCSS(): Promise<void> {
    const id = "pixel-font-css";

    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
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

    // ⏳ aspetta il font prima di disegnare il testo
    await document.fonts.load('16px "PixelFont"');
    await document.fonts.ready;
  }
}

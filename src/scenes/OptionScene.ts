import Phaser from "phaser";

export default class OptionsScene extends Phaser.Scene {
  constructor() {
    super("options");
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;

    // overlay scuro (lasciamo vedere il menu dietro)
    this.add
      .rectangle(0, 0, w, h, 0x000000, 0.45)
      .setOrigin(0, 0)
      .setDepth(9990);

    // pannello PIÙ PICCOLO
    const panelW = 660;
    const panelH = 660;

    this.add
      .rectangle(w * 0.5, h * 0.5, panelW, panelH, 0x111111, 0.95)
      .setStrokeStyle(3, 0xffffff, 0.18)
      .setDepth(9991);

    // =========================
    // TITOLO
    // =========================
    this.add.text(
      w * 0.5,
      h * 0.5 - panelH / 2 + 80,
      "OPZIONI",
      {
        fontFamily: '"PixelFont", monospace',
        fontSize: "64px",
        color: "#ffffff",
      }
    )
      .setOrigin(0.5)
      .setDepth(9992);

    // =========================
    // 🖼️ IMMAGINE SOTTO IL TITOLO
    // =========================
    this.add
      .image(
        w * 0.5,
        h * 0.5 - panelH / 2 + 200, // ⬅️ spostala cambiando SOLO questo numero
        "options-image"
      )
      .setOrigin(0.5)
      .setDepth(9992)
      .setScale(0.6);

    // =========================
    // 🔊 VOLUME
    // =========================
    const volumeText = this.add.text(
      w * 0.5,
      h * 0.5 + 40,
      "Volume: ON",
      {
        fontFamily: '"PixelFont", monospace',
        fontSize: "36px",
        color: "#ffffff",
      }
    )
      .setOrigin(0.5)
      .setDepth(9992)
      .setInteractive({ useHandCursor: true });

    volumeText.on("pointerover", () => volumeText.setColor("#FFFE7A"));
    volumeText.on("pointerout", () => volumeText.setColor("#ffffff"));

    volumeText.on("pointerdown", () => {
      this.sound.mute = !this.sound.mute;
      volumeText.setText(`Volume: ${this.sound.mute ? "OFF" : "ON"}`);
    });

    // =========================
    // 🗑 RESET
    // =========================
    const resetText = this.add.text(
      w * 0.5,
      h * 0.5 + 100,
      "Reset salvataggi",
      {
        fontFamily: '"PixelFont", monospace',
        fontSize: "36px",
        color: "#ffffff",
      }
    )
      .setOrigin(0.5)
      .setDepth(9992)
      .setInteractive({ useHandCursor: true });

    resetText.on("pointerover", () => resetText.setColor("#FF6B6B"));
    resetText.on("pointerout", () => resetText.setColor("#ffffff"));

    resetText.on("pointerdown", () => {
      localStorage.clear();
      resetText.setText("Salvataggi cancellati!");
      resetText.setColor("#6BCB77");
    });

    // =========================
    // ⬅ INDIETRO
    // =========================
    const back = this.add.text(
      w * 0.5,
      h * 0.5 + panelH / 2 - 70,
      "← Indietro",
      {
        fontFamily: '"PixelFont", monospace',
        fontSize: "36px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { left: 16, right: 16, top: 10, bottom: 10 },
      }
    )
      .setOrigin(0.5)
      .setDepth(9992)
      .setInteractive({ useHandCursor: true });

    back.on("pointerover", () =>
      back.setStyle({ backgroundColor: "#ffffffaa", color: "#000000" })
    );
    back.on("pointerout", () =>
      back.setStyle({ backgroundColor: "#000000aa", color: "#ffffff" })
    );
    back.on("pointerdown", () => this.scene.start("menu"));

    // ESC
    this.input.keyboard?.once("keydown-ESC", () => {
      this.scene.start("menu");
    });
  }
}

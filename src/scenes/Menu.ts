import Phaser from "phaser";

type MenuItem = {
  key: "play" | "levels" | "credits" | "options";
  label: string;
  enabled: boolean;
};

export default class Menu extends Phaser.Scene {
  private bg!: Phaser.GameObjects.Image;

  // ✅ Audio
  private clickSfx?: Phaser.Sound.BaseSound;
  private music?: Phaser.Sound.BaseSound;

  // ✅ Credits overlay objects (NO container, più stabile)
  private creditsOpen = false;
  private creditsOverlay?: Phaser.GameObjects.Rectangle;
  private creditsPanel?: Phaser.GameObjects.Rectangle;
  private creditsTitle?: Phaser.GameObjects.Text;
  private creditsLogo?: Phaser.GameObjects.Image;
  private creditsBack?: Phaser.GameObjects.Text;

  private creditsNameRows: Phaser.GameObjects.Container[] = [];
  private creditsTweens: Phaser.Tweens.Tween[] = [];

  private creditsImage?: Phaser.GameObjects.Image;


  constructor() {
    super("menu");
  }

  preload() {
    this.load.setPath("assets/");
    this.load.image("menu", "menu.png");
    this.load.image("git", "git.png");
    this.load.image("credits-image", "credits-image.png");
    this.load.image("options-image", "options-image.png");



    // ✅ audio (stanno in assets/)
    this.load.audio("sfx_click", "computer-mouse-click-352734.mp3");
    this.load.audio("music_menu", "356-8-bit-chiptune-game-music-357518.mp3");
  }

  async create() {
    this.cameras.main.setBackgroundColor("#2C454E");
    await this.injectPixelFontCSS();

    // 🖼️ background image
    this.bg = this.add.image(0, 0, "menu").setOrigin(0.5);

    // ✅ setup audio
    this.setupAudio();

    const items: MenuItem[] = [
      { key: "play", label: "Gioca", enabled: true },
      { key: "levels", label: "Livelli", enabled: true },
      { key: "credits", label: "Credits", enabled: true },
      { key: "options", label: "Opzioni", enabled: true },
    ];

    const startX = 120;
    const startY = 360;
    const fontSize = 64;
    const gapY = 132;

    items.forEach((item, i) => {
      const text = this.add.text(startX, startY + i * gapY, item.label, {
        fontFamily: '"PixelFont", monospace',
        fontSize: `${fontSize}px`,
        color: item.enabled ? "#ffffff" : "#9a9a9a",
      });

      text.setOrigin(0, 0.5).setDepth(10).setResolution(1);

      if (!item.enabled) return;

      text.setInteractive({ useHandCursor: true });

      text.on("pointerover", () => text.setColor("#FFFE7A"));
      text.on("pointerout", () => text.setColor("#ffffff"));

      text.on("pointerdown", () => {
        this.playClick();

        if (item.key === "play") this.onPlay();
        if (item.key === "levels") this.onLevels();
        if (item.key === "credits") this.openCredits();
        if (item.key === "options") this.onOptions();
      });
    });

    // chiudi credits con ESC
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.creditsOpen) this.closeCredits();
    });

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    // cleanup
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closeCredits(true);
    });
  }

  // =========================
  // ✅ AUDIO
  // =========================
  private setupAudio() {
    // click
    this.clickSfx = this.sound.add("sfx_click", { volume: 0.6 });

    // musica menu: evita doppioni se rientri nel menu
    const existing = this.sound.get("music_menu");
    if (existing) {
      this.music = existing;
    } else {
      this.music = this.sound.add("music_menu", { volume: 0.35, loop: true });
      this.music.play();
    }
  }

  private playClick() {
    if (!this.clickSfx) return;
    if (this.clickSfx.isPlaying) this.clickSfx.stop();
    this.clickSfx.play();
  }

  private stopMenuMusic() {
    if (!this.music) return;
    this.music.stop();
    this.music.destroy();
    this.music = undefined;
  }

  // =========================
  // LAYOUT
  // =========================
  private layout() {
    const w = this.scale.width;
    const h = this.scale.height;

    const scale = Math.max(w / this.bg.width, h / this.bg.height);
    this.bg.setScale(scale).setPosition(w * 0.5, h * 0.5);

    if (this.creditsOpen) this.positionCredits();
  }

  // =========================
  // NAVIGAZIONE
  // =========================
  private onPlay() {
    // ✅ qui la musica deve fermarsi
    this.stopMenuMusic();

    // ✅ priorità: ultimo pianeta dove hai fatto git init
    const lastInit = Number(localStorage.getItem("lastInitLevel")) || 0;

    // ✅ fallback: ultimo livello avviato
    const current = Number(localStorage.getItem("currentLevel")) || 0;

    const levelToPlay = lastInit || current;

    // se non ho nulla salvato -> vai alla schermata livelli
    if (levelToPlay < 1) {
      this.onLevels();
      return;
    }

    this.scene.start("game", { level: levelToPlay });
  }

  private onLevels() {
    // ✅ la musica DEVE rimanere
    const unlocked = Number(localStorage.getItem("unlocked")) || 1;
    this.scene.start("level-select", { unlocked });
  }

  // =========================
  // ✅ CREDITS (allineamenti + logo grande)
  // =========================
  private openCredits() {
    if (this.creditsOpen) return;
    this.creditsOpen = true;

    const w = this.scale.width;
    const h = this.scale.height;

    // overlay scuro (click per chiudere)
    this.creditsOverlay = this.add
      .rectangle(0, 0, w, h, 0x000000, 0.65)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9990)
      .setInteractive({ useHandCursor: true });

    this.creditsOverlay.on("pointerdown", () => this.closeCredits());

    // pannello
    const panelW = Math.floor(w * 0.72);
    const panelH = Math.floor(h * 0.82);

    this.creditsPanel = this.add
      .rectangle(w * 0.5, h * 0.5, panelW, panelH, 0x111111, 0.95)
      .setStrokeStyle(3, 0xffffff, 0.18)
      .setScrollFactor(0)
      .setDepth(9991);

    // titolo
    this.creditsTitle = this.add
      .text(w * 0.5, h * 0.5 - panelH / 2 + 80, "CREDITS", {
        fontFamily: '"PixelFont", monospace',
        fontSize: "64px",
        color: "#ffffff",
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(9992)
      .setResolution(1);

    // logo git vicino al titolo e grande quanto il titolo
    this.creditsLogo = this.add.image(0, 0, "git").setScrollFactor(0).setDepth(9992);

    // posiziono/scala correttamente
    this.positionCreditsLogo();

    // animazione logo molto lenta
    this.creditsTweens.push(
      this.tweens.add({
        targets: this.creditsLogo,
        y: this.creditsLogo.y - 3,
        duration: 4200,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      })
    );

    // nomi in colonna, centrati, lettere colorate MA riga dritta
    const names = ["Maggi Antonio", "Masino Giulia", "Ferrara Tommaso", "Papangelo Maddalena"];
    const colors = ["#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF", "#C77DFF"];

    const namesStartY = h * 0.5 - 190;
    const rowGap = 62;

    this.creditsNameRows = names.map((name, row) => {
      const rowContainer = this.add
        .container(w * 0.5, namesStartY + row * rowGap)
        .setScrollFactor(0)
        .setDepth(9992);

      let x = 0;
      const letters: Phaser.GameObjects.Text[] = [];

      for (let i = 0; i < name.length; i++) {
        const ch = name[i];
        const t = this.add.text(x, 0, ch, {
          fontFamily: '"PixelFont", monospace',
          fontSize: "40px",
          color: colors[i % colors.length],
        });

        t.setOrigin(0, 0.5).setResolution(1);
        rowContainer.add(t);
        letters.push(t);

        x += t.width;
      }

      // centro riga
      const totalW = x;
      const shift = -totalW / 2;
      letters.forEach((t) => (t.x += shift));

      // animazione lentissima della riga (micro)
      this.creditsTweens.push(
        this.tweens.add({
          targets: rowContainer,
          y: rowContainer.y - 1.2,
          duration: 5200 + row * 400,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        })
      );

      return rowContainer;
    });

   


    // =========================
    // CREA IMMAGINE CREDITS (UNA VOLTA SOLA)
    // =========================
    this.creditsImage = this.add
      .image(0, 0, "credits-image")
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9992)
      .setScale(0.6); 
      
    // =========================
    // POSIZIONE IMMAGINE CREDITS (DENTRO IL PANNELLO)
    // =========================
    if (this.creditsImage) {
      const panelTopY = h * 0.5 - panelH / 2;

      this.creditsImage.setPosition(
        w * 0.5,
        panelTopY + 570 // ⬅️ QUI regoli la distanza dall’alto del pannello
      );
    }

  
    // bottone indietro
    this.creditsBack = this.add
      .text(w * 0.5, h * 0.5 + panelH / 2 - 70, "← Indietro", {
        fontFamily: '"PixelFont", monospace',
        fontSize: "36px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { left: 16, right: 16, top: 10, bottom: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9992)
      .setResolution(1)
      .setInteractive({ useHandCursor: true });

    this.creditsBack.on("pointerover", () =>
      this.creditsBack?.setStyle({ backgroundColor: "#ffffffaa", color: "#000000" })
    );
    this.creditsBack.on("pointerout", () =>
      this.creditsBack?.setStyle({ backgroundColor: "#000000aa", color: "#ffffff" })
    );
    this.creditsBack.on("pointerdown", () => {
      this.playClick();
      this.closeCredits();
    });
  }

  private positionCredits() {
    const w = this.scale.width;
    const h = this.scale.height;

    this.creditsOverlay?.setSize(w, h);

    

    if (!this.creditsPanel || !this.creditsTitle) return;

    const panelW = Math.floor(w * 0.72);
    const panelH = Math.floor(h * 0.82);

  

    this.creditsPanel.setPosition(w * 0.5, h * 0.5).setSize(panelW, panelH);
    this.creditsTitle.setPosition(w * 0.5, h * 0.5 - panelH / 2 + 80);

    this.positionCreditsLogo();

    const namesStartY = h * 0.5 - 190
    const rowGap = 62;

    this.creditsNameRows.forEach((row, i) => {
      row.setPosition(w * 0.5, namesStartY + i * rowGap);
    });


    this.creditsBack?.setPosition(w * 0.5, h * 0.5 + panelH / 2 - 70);
  }

  private positionCreditsLogo() {
    if (!this.creditsTitle || !this.creditsLogo) return;

    // altezza logo ~ altezza testo titolo
    const titleH = this.creditsTitle.height;
    const logoH = this.creditsLogo.height || 1;
    const scale = titleH / logoH;
    this.creditsLogo.setScale(scale);

    const margin = 18;

    const titleX = this.creditsTitle.x;
    const titleY = this.creditsTitle.y;
    const titleW = this.creditsTitle.width;

    const scaledLogoW = (this.creditsLogo.width || 0) * scale;

    const leftEdgeTitle = titleX - titleW / 2;
    this.creditsLogo.setPosition(leftEdgeTitle - scaledLogoW / 2 - margin, titleY);
  }

  private closeCredits(silent = false) {
    if (!this.creditsOpen && !silent) return;
    this.creditsOpen = false;

    this.creditsTweens.forEach((t) => t.stop());
    this.creditsTweens = [];

    this.creditsNameRows.forEach((r) => r.destroy(true));
    this.creditsNameRows = [];

    this.creditsBack?.destroy();
    this.creditsBack = undefined;

    this.creditsLogo?.destroy();
    this.creditsLogo = undefined;

    this.creditsTitle?.destroy();
    this.creditsTitle = undefined;

    this.creditsPanel?.destroy();
    this.creditsPanel = undefined;

    this.creditsOverlay?.destroy();
    this.creditsOverlay = undefined;

    this.creditsImage?.destroy();
    this.creditsImage = undefined;

  }

  // =========================
  // FONT
  // =========================
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

    await document.fonts.load('16px "PixelFont"');
    await document.fonts.ready;
  }

private onOptions() {
  this.playClick();

  // NON fermare il menu
  this.scene.launch("options");
  this.scene.bringToTop("options");
}




}

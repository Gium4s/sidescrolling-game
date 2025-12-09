import Phaser from 'phaser'
import PlayerController from './PlayerController'

export default class Game extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys

  private penquin?: Phaser.Physics.Matter.Sprite
  private playerController?: PlayerController

  // Parallax background
  private bg!: Phaser.GameObjects.TileSprite

  // invece di un valore fisso, usiamo un rapporto rispetto all'altezza dello schermo
  private _baseTileY = 0
  private _basePlayerY = 0
  private readonly _baseTileRatio = 0.20 // 0.20 ≈ 20% dell’altezza schermo (regolabile)

  constructor() {
    super('game')
  }

  init() {
    this.cursors = this.input.keyboard!.createCursorKeys()
  }

  preload() {
    this.load.image('bg', 'assets/bg.png')
    this.load.atlas('penquin', 'assets/penquin.png', 'assets/penquin.json')
    this.load.image('tiles', 'assets/sheet.png')
    this.load.tilemapTiledJSON('tilemap', 'assets/game.json')
  }

  create() {
    
  
    // --- SFONDO: TileSprite a schermo intero, ancorato in BASSO ---
    const cam = this.cameras.main
    this.bg = this.add
      .tileSprite(0, 0, cam.width, cam.height, 'bg')
      .setScrollFactor(0)
      .setDepth(-1000)
      .setOrigin(0, 1)
      .setPosition(0, cam.height)

    this.cameras.main.setRoundPixels(true)
     
    // Pulsante "Back to Menu"
      const { width, height } = this.cameras.main

    const backBtn = this.add.text(width - 20, 20, 'Back to Menu', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#ffffff',
      backgroundColor: '#00000055',
      padding: { left: 10, right: 10, top: 5, bottom: 5 }
    })
      .setOrigin(1, 0)
      .setScrollFactor(0)        // 👈 resta fisso sullo schermo
      .setDepth(9999)            // 👈 sopra tutto
      .setInteractive({ useHandCursor: true })

    backBtn.on('pointerover', () => backBtn.setStyle({ color: '#000000ff' }))
    backBtn.on('pointerout',  () => backBtn.setStyle({ color: '#ffffff' }))

    backBtn.on('pointerup', () => {
      this.scene.start('start-menu')   // key della scena del menu
    })

    // calcola offset di base in funzione dell’altezza
    this._baseTileY = Math.floor(cam.height * this._baseTileRatio)
    this.bg.tilePositionY = this._baseTileY

    // quando cambia la dimensione della finestra, ricalcola tutto
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      this.bg
        .setSize(size.width, size.height)
        .setDisplaySize(size.width, size.height)
      this.bg.setPosition(0, size.height)

      this._baseTileY = Math.floor(size.height * this._baseTileRatio)
      this.bg.tilePositionY = this._baseTileY
    })

    // --- Mappa + tileset ---
    const map = this.make.tilemap({ key: 'tilemap' })
    const tileset = map.addTilesetImage('iceworld', 'tiles')!

    const ground = map.createLayer('ground', tileset)!
    ground.setCollisionByProperty({ collides: true })
    this.matter.world.convertTilemapLayer(ground)

    // Limiti mondo/camera
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.matter.world.setBounds(
      0,
      0,
      map.widthInPixels,
      map.heightInPixels,
      64,
      true,
      true,
      true,
      true
    )
  
    // Spawn solo del player
    const objects = map.getObjectLayer('objects')
    objects?.objects.forEach(obj => {
      const { x = 0, y = 0, width = 0, name } = obj
      if (name === 'penquin-spawn') {
        this.penquin = this.matter.add
          .sprite(x + width * 0.5, y, 'penquin')
          .setOrigin(0.5, 0.4)
          .setFixedRotation()

        this.playerController = new PlayerController(
          this,
          this.penquin,
          this.cursors
        )
        this.cameras.main.startFollow(this.penquin, true)

        // baseline per parallasse verticale
        this._basePlayerY = this.penquin.y
      }
    })
  }

  update(_t: number, dt: number) {
    this.playerController?.update(dt)

    // Parallax orizzontale soft
    this.bg.tilePositionX = Math.floor(this.cameras.main.scrollX * 0.2)

    // Parallax verticale: quando il player sale (y diminuisce) il BG scende
    const playerY = this.penquin?.y ?? this._basePlayerY
    const dyUp = Math.max(0, this._basePlayerY - playerY)   // >0 solo se sale
    const target = this._baseTileY - Math.floor(dyUp * 0.7 ) // sposta in giù la texture
    this.bg.tilePositionY = Math.min(this._baseTileY, target)
  }
}
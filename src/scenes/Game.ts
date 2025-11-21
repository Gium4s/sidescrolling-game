import Phaser from 'phaser'
import ObstaclesController from './ObstaclesController'
import PlayerController from './PlayerController'
import SnowmanController from './SnowmanController'

export default class Game extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys

  private penquin?: Phaser.Physics.Matter.Sprite
  private playerController?: PlayerController
  private obstacles!: ObstaclesController
  private snowmen: SnowmanController[] = []

  // Parallax background
  private bg!: Phaser.GameObjects.TileSprite
  private _baseScrollY = 0     // scrollY della camera alla baseline
  private _baseTileY   = 300   // OFFSET DI RIPOSO: alza/abbassa i tentacoli (240–360)
  private _basePlayerY = 0

  constructor() {
    super('game')
  }

  init() {
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.obstacles = new ObstaclesController()
    this.snowmen = []

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.destroy()
    })
  }

  preload() {
    this.load.image('bg', 'assets/bg.png')
    this.load.atlas('penquin', 'assets/penquin.png', 'assets/penquin.json')
    this.load.image('tiles', 'assets/sheet.png')
    this.load.tilemapTiledJSON('tilemap', 'assets/game.json')

    this.load.image('star', 'assets/star.png')
    this.load.image('health', 'assets/health.png')

    this.load.atlas('snowman', 'assets/snowman.png', 'assets/snowman.json')
  }

  create() {
    // UI
    this.scene.launch('ui')

    // --- SFONDO: TileSprite a schermo intero, ancorato in BASSO ---
    const cam = this.cameras.main
    this.bg = this.add
      .tileSprite(0, 0, cam.width, cam.height, 'bg')
      .setScrollFactor(0)
      .setDepth(-1000)

    this.bg.setOrigin(0, 1)
    this.bg.setPosition(0, this.cameras.main.height)

    // Tentacoli visibili da fermi (offset di riposo)
    this.bg.tilePositionY = this._baseTileY

    // Anti artifact
    this.cameras.main.setRoundPixels(true)

    // Resize: riempi e resta appoggiato in basso, mantieni offset di riposo
    this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => {
      const { width, height } = gameSize
      this.bg.setSize(width, height)
      this.bg.setDisplaySize(width, height)
      this.bg.setPosition(0, height)     // sempre in basso
      this.bg.tilePositionY = this._baseTileY
    })
    // ---------------------------------------------------------------

    // Mappa + tileset
    const map = this.make.tilemap({ key: 'tilemap' })
    const tileset = map.addTilesetImage('iceworld', 'tiles')!
    this.matter.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels, 64, true, true, true, true)
    // Bounds normali: niente top negativo (non esporre il “sotto” del mondo)
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

    const ground = map.createLayer('ground', tileset)!
    ground.setCollisionByProperty({ collides: true })
    map.createLayer('obstacles', tileset)

    const objectsLayer = map.getObjectLayer('objects')!

    // Spawn oggetti
    objectsLayer.objects.forEach((objData) => {
      const { x = 0, y = 0, name, width = 0, height = 0 } = objData

      switch (name) {
        case 'penquin-spawn': {
          this.penquin = this.matter.add
            .sprite(x + width * 0.5, y, 'penquin')
            .setOrigin(0.5, 0.4)
            .setFixedRotation()

          this.playerController = new PlayerController(
            this,
            this.penquin,
            this.cursors,
            this.obstacles
          )

          this.cameras.main.startFollow(this.penquin, true)
          // baseline: offset di riposo (tentacoli visibili) e posizioni di partenza
          this._baseTileY   = 300      // regola 240–360 a gusto
          this.bg.tilePositionY = this._baseTileY
          this._basePlayerY = this.penquin.y
          // Memorizza la baseline dopo che la camera segue il player
          this._baseScrollY = this.cameras.main.scrollY
          break
        }

        case 'snowman': {
          const snowman = this.matter.add.sprite(x, y, 'snowman').setFixedRotation()
          this.snowmen.push(new SnowmanController(this, snowman))
          this.obstacles.add('snowman', snowman.body as any)
          break
        }

        case 'star': {
          const star = this.matter.add.sprite(x, y, 'star', undefined, {
            isStatic: true,
            isSensor: true
          })
          star.setData('type', 'star')
          break
        }

        case 'health': {
          const health = this.matter.add.sprite(x, y, 'health', undefined, {
            isStatic: true,
            isSensor: true
          })
          health.setData('type', 'health')
          health.setData('healthPoints', 10)
          break
        }

        case 'spikes': {
          const spike = this.matter.add.rectangle(
            x + width * 0.5,
            y + height * 0.5,
            width,
            height,
            { isStatic: true }
          )
          this.obstacles.add('spikes', spike as any)
          break
        }
      }
    })

    this.matter.world.convertTilemapLayer(ground)
  }

  destroy() {
    this.scene.stop('ui')
    this.snowmen.forEach((s) => s.destroy())
  }

  update(_t: number, dt: number) {
    this.playerController?.update(dt)
    this.snowmen.forEach((s) => s.update(dt))

    // Parallax orizzontale (ok)
    this.bg.tilePositionX = Math.floor(this.cameras.main.scrollX * 0.2)

    // -------- Parallax verticale: il BG scende quando il player sale --------
   // dyUp > 0 solo quando il player sale (y diminuisce)
    const playerY = this.penquin?.y ?? this._basePlayerY
    const dyUp = Math.max(0, this._basePlayerY - playerY)

    // Muovi la texture VERSO IL BASSO partendo dalla base (apre il cielo sopra)
    const target = this._baseTileY - Math.floor(dyUp * 0.9)
    // clamp: non superare mai la base (niente risalita della parte bassa)
    this.bg.tilePositionY = Math.min(this._baseTileY, target)
  }  
}

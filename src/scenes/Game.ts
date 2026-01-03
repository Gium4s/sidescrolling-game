import Phaser from 'phaser'
import PlayerController from './PlayerController'

export default class Game extends Phaser.Scene {
  private level = 1

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private escKey!: Phaser.Input.Keyboard.Key

  private penquin?: Phaser.Physics.Matter.Sprite
  private playerController?: PlayerController

  // Parallax background
  private bg!: Phaser.GameObjects.TileSprite

  // Parallax tuning
  private _baseTileY = 0
  private _basePlayerY = 0
  private readonly _baseTileRatio = 0.2

  constructor() {
    super('game')
  }

  init(data: { level?: number } = {}) {
    this.level = data.level ?? 1

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

    console.log('[Game] start level =', this.level)
  }

  preload() {
    // Debug load errors
    this.load.on('loaderror', (file: any) => {
      console.error('[LOAD ERROR]', file?.key, file?.src)
    })

    // Assets base
    this.load.image('bg', 'assets/bg.png')
    this.load.atlas('penquin', 'assets/penquin.png', 'assets/penquin.json')
    this.load.image('tiles', 'assets/sheet.png')

    // UFO (IMPORTANTISSIMO)
    this.load.image('ufo', 'assets/ufo.png')

    // Tilemaps
    this.load.tilemapTiledJSON('tilemap', 'assets/game.json')   // level 1
    this.load.tilemapTiledJSON('tilemap2', 'assets/game2.json') // level 2
    this.load.tilemapTiledJSON('tilemap3', 'assets/game3.json') // level 3
    this.load.tilemapTiledJSON('tilemap4', 'assets/game4.json') // level 4
  }

  create() {
    const cam = this.cameras.main
    this.cameras.main.setRoundPixels(true)

    // --- BG parallax (full screen, anchored bottom) ---
    this.bg = this.add
      .tileSprite(0, 0, cam.width, cam.height, 'bg')
      .setScrollFactor(0)
      .setDepth(-1000)
      .setOrigin(0, 1)
      .setPosition(0, cam.height)

    this._baseTileY = Math.floor(cam.height * this._baseTileRatio)
    this.bg.tilePositionY = this._baseTileY

    // Resize handler
    this.scale.on(Phaser.Scale.Events.RESIZE, (size: Phaser.Structs.Size) => {
      this.bg.setSize(size.width, size.height).setDisplaySize(size.width, size.height)
      this.bg.setPosition(0, size.height)

      this._baseTileY = Math.floor(size.height * this._baseTileRatio)
      this.bg.tilePositionY = this._baseTileY
    })

    // --- choose correct tilemap key ---
    const mapKey = this.level === 1 ? 'tilemap' : `tilemap${this.level}`
    console.log('[Game] using mapKey =', mapKey)

    if (!this.cache.tilemap.exists(mapKey)) {
      console.error(`[Game] Tilemap key not found in cache: "${mapKey}".`)
      this.add
        .text(20, 80, `ERROR: tilemap "${mapKey}" not loaded`, {
          fontFamily: 'Arial',
          fontSize: '18px',
          color: '#ff5555',
          backgroundColor: '#000000aa',
          padding: { left: 10, right: 10, top: 6, bottom: 6 }
        })
        .setScrollFactor(0)
        .setDepth(9999)

      this.createGoBackButton()
      return
    }

    // --- Map + tileset ---
    const map = this.make.tilemap({ key: mapKey })
    const tileset = map.addTilesetImage('iceworld', 'tiles')

    if (!tileset) {
      console.error(
        `[Game] Tileset not found. In Tiled tileset name must be "iceworld".`
      )
      this.createGoBackButton()
      return
    }

    const ground = map.createLayer('ground', tileset)
    if (!ground) {
      console.error(`[Game] Layer "ground" not found. Must be named exactly "ground".`)
      this.createGoBackButton()
      return
    }

    ground.setCollisionByProperty({ collides: true })
    this.matter.world.convertTilemapLayer(ground)

    // World bounds / camera bounds
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.matter.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels, 64, true, true, true, true)

    // --- Objects layer ---
    const objectsLayer = map.getObjectLayer('objects')
    if (!objectsLayer) {
      console.error(`[Game] Object layer "objects" not found. Must be named exactly "objects".`)
      this.createGoBackButton()
      return
    }

    // --- Spawn player ---
    const spawnObj = objectsLayer.objects.find(o => o.name === 'penquin-spawn')
    if (!spawnObj) {
      console.error(`[Game] "penquin-spawn" not found in objects layer.`)
      this.createGoBackButton()
      return
    }

    const sx = (spawnObj.x ?? 0)
    const sy = (spawnObj.y ?? 0)
    const sw = (spawnObj.width ?? 0)

    this.penquin = this.matter.add
      .sprite(sx + sw * 0.5, sy, 'penquin')
      .setOrigin(0.5, 0.4)
      .setFixedRotation()

    this.playerController = new PlayerController(this, this.penquin, this.cursors)
    this.cameras.main.startFollow(this.penquin, true)
    this._basePlayerY = this.penquin.y

    // --- UFO GOAL (visual + sensor) ---
    const ufoObj = objectsLayer.objects.find(o => o.name === 'ufo-goal')

    if (!ufoObj) {
      console.warn('[Game] ufo-goal not found in objects layer (ok per ora, ma non completerai il livello).')
    } else {
      const x = (ufoObj.x ?? 0)
      const y = (ufoObj.y ?? 0)
      const w = (ufoObj.width ?? 64)
      const h = (ufoObj.height ?? 64)

      // In Tiled: x,y del rettangolo sono TOP-LEFT
      const cx = x + w * 0.5
      const cy = y + h * 0.5

      // UFO visibile (se vuoi più grande: setScale(2))
      this.add
        .image(cx, cy, 'ufo')
        .setOrigin(0.5, 0.5)
        .setDepth(50)
        .setScrollFactor(1)
        .setScale(1)

      // Sensor Matter
      const goalBody = this.matter.add.rectangle(cx, cy, w, h, {
        isStatic: true,
        isSensor: true,
        label: 'ufo-goal'
      })

      // Collisione player-goal
      this.matter.world.on('collisionstart', (event: any) => {
        if (!this.penquin) return
        const playerBody = this.penquin.body as MatterJS.BodyType
        if (!playerBody) return

        for (const pair of event.pairs) {
          const a = pair.bodyA
          const b = pair.bodyB

          const hitGoal =
            (a === goalBody && b === playerBody) ||
            (b === goalBody && a === playerBody)

          if (hitGoal) {
            this.onLevelComplete()
            break
          }
        }
      })
    }

    // UI
    this.createGoBackButton()
  }

  update(_t: number, dt: number) {
    this.playerController?.update(dt)

    // ESC = back
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.goBackToMenu()
      return
    }

    // Parallax X
    this.bg.tilePositionX = Math.floor(this.cameras.main.scrollX * 0.2)

    // Parallax Y
    const playerY = this.penquin?.y ?? this._basePlayerY
    const dyUp = Math.max(0, this._basePlayerY - playerY)
    const target = this._baseTileY - Math.floor(dyUp * 0.3)
    this.bg.tilePositionY = Math.min(this._baseTileY, target)
  }

  // -------------------------
  // GO BACK
  // -------------------------
  private createGoBackButton() {
    const btn = this.add
      .text(16, 16, '← Go back', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { left: 10, right: 10, top: 6, bottom: 6 }
      })
      .setScrollFactor(0)
      .setDepth(9999)
      .setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => {
      btn.setStyle({ backgroundColor: '#ffffffaa', color: '#000000' })
    })

    btn.on('pointerout', () => {
      btn.setStyle({ backgroundColor: '#000000aa', color: '#ffffff' })
    })

    btn.on('pointerdown', () => this.goBackToMenu())
  }

  private goBackToMenu() {
    const unlocked = (this.registry.get('unlocked') as number) ?? 1
    this.scene.start('level-select', { unlocked })
  }

  private onLevelComplete() {
  console.log('[Game] LEVEL COMPLETE!', this.level)

  const currentUnlocked = (this.registry.get('unlocked') as number) ?? 1
  const nextUnlocked = Math.max(currentUnlocked, this.level + 1)

  this.registry.set('unlocked', nextUnlocked)
  localStorage.setItem('unlocked', String(nextUnlocked)) // ✅ PERSISTENZA

  this.scene.start('level-select', { unlocked: nextUnlocked })
  }

}

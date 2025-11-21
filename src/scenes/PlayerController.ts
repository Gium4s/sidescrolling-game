import Phaser from 'phaser'
import StateMachine from '../statemachine/StateMachine'
import { sharedInstance as events } from './EventCenter'
import ObstaclesController from './ObstaclesController'

type CursorKeys = Phaser.Types.Input.Keyboard.CursorKeys

export default class PlayerController {
  private scene: Phaser.Scene
  private sprite: Phaser.Physics.Matter.Sprite
  private cursors: CursorKeys
  private keys: {
    up: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }
  private obstacles: ObstaclesController
  private stateMachine!: StateMachine
  private health = 100

  private lastSnowman?: Phaser.Physics.Matter.Sprite

  constructor(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Sprite,
    cursors: CursorKeys,
    obstacles: ObstaclesController
  ) {
    this.scene = scene
    this.sprite = sprite
    this.cursors = cursors
    this.obstacles = obstacles

    this.keys = this.scene.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as any

    // 1) PRIMA di tutto: crea le animazioni
    this.createAnimations()

    // 2) Poi costruisci la state machine (e SOLO dopo chiama setState)
    this.stateMachine = new StateMachine(this, 'player')
      .addState('idle', {
        onEnter: this.idleOnEnter,
        onUpdate: this.idleOnUpdate
      })
      .addState('walk', {
        onEnter: this.walkOnEnter,
        onUpdate: this.walkOnUpdate,
        onExit: this.walkOnExit
      })
      .addState('jump', {
        onEnter: this.jumpOnEnter,
        onUpdate: this.jumpOnUpdate
      })
      .addState('spike-hit', { onEnter: this.spikeHitOnEnter })
      .addState('snowman-hit', { onEnter: this.snowmanHitOnEnter })
      .addState('snowman-stomp', { onEnter: this.snowmanStompOnEnter })
      .addState('dead', { onEnter: this.deadOnEnter })

    this.stateMachine.setState('idle')

    // Collisioni
    this.sprite.setOnCollide((data: MatterJS.ICollisionPair) => {
      const body = data.bodyB as MatterJS.BodyType

      if (this.obstacles.is('spikes', body)) {
        this.stateMachine.setState('spike-hit')
        return
      }

      if (this.obstacles.is('snowman', body)) {
        const go = body.gameObject
        if (go && go instanceof Phaser.Physics.Matter.Sprite) {
          this.lastSnowman = go
          if (this.sprite.y < body.position.y) this.stateMachine.setState('snowman-stomp')
          else this.stateMachine.setState('snowman-hit')
        } else {
          this.lastSnowman = undefined
          this.stateMachine.setState('snowman-hit')
        }
        return
      }

      const gameObject = body.gameObject
      if (!gameObject) return

      if (gameObject instanceof Phaser.Physics.Matter.TileBody) {
        if (this.stateMachine.isCurrentState('jump')) {
          this.stateMachine.setState('idle')
        }
        return
      }

      const s = gameObject as Phaser.Physics.Matter.Sprite
      const type = s.getData('type')
      switch (type) {
        case 'star':
          events.emit('star-collected')
          s.destroy()
          break
        case 'health': {
          const value = s.getData('healthPoints') ?? 10
          this.health = Phaser.Math.Clamp(this.health + value, 0, 100)
          events.emit('health-changed', this.health)
          s.destroy()
          break
        }
      }
    })
  }

  update(dt: number) {
    // Guard per evitare crash se qualcosa andasse storto
    if (!this.stateMachine) return
    this.stateMachine.update(dt)
  }

  // --- States ---------------------------------------------------------------

  private idleOnEnter() {
    this.sprite.play('player-idle')
  }

  private idleOnUpdate() {
    const left = this.cursors.left.isDown || this.keys.left.isDown
    const right = this.cursors.right.isDown || this.keys.right.isDown
    if (left || right) this.stateMachine.setState('walk')

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.up)
    if (jumpPressed) this.stateMachine.setState('jump')
  }

  private walkOnEnter() {
    this.sprite.play('player-walk')
  }

  private walkOnUpdate() {
    const speed = 5
    const left = this.cursors.left.isDown || this.keys.left.isDown
    const right = this.cursors.right.isDown || this.keys.right.isDown

    if (left) {
      this.sprite.flipX = true
      this.sprite.setVelocityX(-speed)
    } else if (right) {
      this.sprite.flipX = false
      this.sprite.setVelocityX(speed)
    } else {
      this.sprite.setVelocityX(0)
      this.stateMachine.setState('idle')
    }

    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.up)
    if (jumpPressed) this.stateMachine.setState('jump')
  }

  private walkOnExit() {
    this.sprite.stop()
  }

  private jumpOnEnter() {
    this.sprite.setVelocityY(-12)
    this.sprite.play('player-jump', true) // usa penguin_jump01..06
  }

  private jumpOnUpdate() {
    const speed = 5
    const left = this.cursors.left.isDown || this.keys.left.isDown
    const right = this.cursors.right.isDown || this.keys.right.isDown

    if (left) {
      this.sprite.flipX = true
      this.sprite.setVelocityX(-speed)
    } else if (right) {
      this.sprite.flipX = false
      this.sprite.setVelocityX(speed)
    }
  }

  private spikeHitOnEnter() {
    this.sprite.setVelocityY(-12)
    const start = Phaser.Display.Color.ValueToColor(0xffffff)
    const end = Phaser.Display.Color.ValueToColor(0xff0000)
    this.scene.tweens.addCounter({
      from: 0, to: 100, duration: 100, repeat: 2, yoyo: true,
      ease: Phaser.Math.Easing.Sine.InOut,
      onUpdate: t => {
        const v = t.getValue() ?? 0
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(start, end, 100, v)
        this.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b))
      }
    })
    this.stateMachine.setState('idle')
    this.setHealth(this.health - 10)
  }

  private snowmanHitOnEnter() {
    if (this.lastSnowman) {
      this.sprite.setVelocityX(this.sprite.x < this.lastSnowman.x ? -20 : 20)
    } else {
      this.sprite.setVelocityY(-20)
    }

    const start = Phaser.Display.Color.ValueToColor(0xffffff)
    const end = Phaser.Display.Color.ValueToColor(0x0000ff)
    this.scene.tweens.addCounter({
      from: 0, to: 100, duration: 100, repeat: 2, yoyo: true,
      ease: Phaser.Math.Easing.Sine.InOut,
      onUpdate: t => {
        const v = t.getValue() ?? 0
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(start, end, 100, v)
        this.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b))
      }
    })
    this.stateMachine.setState('idle')
    this.setHealth(this.health - 25)
  }

  private snowmanStompOnEnter() {
    this.sprite.setVelocityY(-10)
    events.emit('snowman-stomped', this.lastSnowman)
    this.stateMachine.setState('idle')
  }

  private deadOnEnter() {
    this.sprite.play('player-death')
    this.sprite.setOnCollide(() => {})
    this.scene.time.delayedCall(1500, () => {
      this.scene.scene.start('game-over')
    })
  }

  // --- Helpers --------------------------------------------------------------

  private setHealth(value: number) {
    this.health = Phaser.Math.Clamp(value, 0, 100)
    events.emit('health-changed', this.health)
    if (this.health <= 0) this.stateMachine.setState('dead')
  }

  private createAnimations() {
    // idle = 1 frame
    this.sprite.anims.create({
      key: 'player-idle',
      frames: [{ key: 'penquin', frame: 'penguin_walk01.png' }]
    })

    // walk = 4 frame
    this.sprite.anims.create({
      key: 'player-walk',
      frameRate: 10,
      frames: this.sprite.anims.generateFrameNames('penquin', {
        start: 1, end: 4, prefix: 'penguin_walk0', suffix: '.png'
      }),
      repeat: -1
    })

    // death (se ancora la usi)
    this.sprite.anims.create({
      key: 'player-death',
      frames: this.sprite.anims.generateFrameNames('penquin', {
        start: 1, end: 4, prefix: 'penguin_die', zeroPad: 2, suffix: '.png'
      }),
      frameRate: 10
    })

    // jump = 5 frame (assicurati che esistano in penquin.json)
    this.sprite.anims.create({
      key: 'player-jump',
      frames: this.sprite.anims.generateFrameNames('penquin', {
        start: 1, end: 5, prefix: 'penguin_jump', zeroPad: 2, suffix: '.png'
      }),
      frameRate: 12,
      repeat: 0
    })
  }
}

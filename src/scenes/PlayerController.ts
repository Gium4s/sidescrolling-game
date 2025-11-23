import Phaser from 'phaser'
import StateMachine from '../statemachine/StateMachine'

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

  private stateMachine!: StateMachine

  constructor(
    scene: Phaser.Scene,
    sprite: Phaser.Physics.Matter.Sprite,
    cursors: CursorKeys
  ) {
    this.scene = scene
    this.sprite = sprite
    this.cursors = cursors

    // WASD
    this.keys = this.scene.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D
    }) as {
      up: Phaser.Input.Keyboard.Key
      left: Phaser.Input.Keyboard.Key
      down: Phaser.Input.Keyboard.Key
      right: Phaser.Input.Keyboard.Key
    }

    // 1) Animazioni
    this.createAnimations()

    // 2) State machine
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

    this.stateMachine.setState('idle')

    // 3) Collisione con terreno: se siamo in jump → idle
    this.sprite.setOnCollide(() => {
      if (this.stateMachine.isCurrentState('jump')) {
        this.stateMachine.setState('idle')
      }
    })
  }

  update(dt: number) {
    // se per qualche motivo non è ancora pronta, non crashare
    if (!this.stateMachine) return
    this.stateMachine.update(dt)
  }

  // ---------------- STATI ----------------

  private idleOnEnter() {
    this.sprite.play('player-idle')
    this.sprite.setVelocityX(0)
  }

  private idleOnUpdate() {
    const left = this.cursors.left.isDown || this.keys.left.isDown
    const right = this.cursors.right.isDown || this.keys.right.isDown
    if (left || right) this.stateMachine.setState('walk')

    const jump =
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.up)
    if (jump) this.stateMachine.setState('jump')
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

    const jump =
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.up)
    if (jump) this.stateMachine.setState('jump')
  }

  private walkOnExit() {
    this.sprite.stop()
  }

  private jumpOnEnter() {
    this.sprite.setVelocityY(-12)
    this.sprite.play('player-jump')
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

  // ---------------- ANIMAZIONI ----------------

  private createAnimations() {
    this.sprite.anims.create({
      key: 'player-idle',
      frames: [{ key: 'penquin', frame: 'penguin_walk01.png' }]
    })

    this.sprite.anims.create({
      key: 'player-walk',
      frameRate: 10,
      frames: this.sprite.anims.generateFrameNames('penquin', {
        start: 1,
        end: 4,
        prefix: 'penguin_walk0',
        suffix: '.png'
      }),
      repeat: -1
    })

    this.sprite.anims.create({
      key: 'player-jump',
      frameRate: 12,
      frames: this.sprite.anims.generateFrameNames('penquin', {
        start: 1,
        end: 5,
        prefix: 'penguin_jump',
        zeroPad: 2,
        suffix: '.png'
      }),
      repeat: 0
    })
  }
}

import Phaser from 'phaser'

export default class StartMenu extends Phaser.Scene {
  constructor() {
    super('start-menu')
  }

  create() {
    const { centerX, centerY } = this.cameras.main

    // Titolo
    this.add.text(centerX, centerY - 200, 'Git Adventures', {
      fontFamily: 'Arial',
      fontSize: '64px',
      color: '#ffffff'
    }).setOrigin(0.5)

    // Sottotitolo
    this.add.text(centerX, centerY - 120, 'Select a level', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#cccccc'
    }).setOrigin(0.5)

    // Livelli
    const levels = ['Level 1', 'Level 2', 'Level 3', 'Level 4']

    levels.forEach((text, i) => {
      const levelText = this.add.text(centerX, centerY + i * 60, text, {
        fontFamily: 'Arial',
        fontSize: '40px',
        color: '#1900ffff'
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })

      levelText.on('pointerover', () => levelText.setStyle({ color: '#ffffff' }))
      levelText.on('pointerout', () => levelText.setStyle({ color: '#1900ffff' }))

      levelText.on('pointerup', () => {
        this.scene.start('game', { level: i + 1 })
      })
    })

    this.add.text(centerX, centerY + 300, 'Use mouse to select a level', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#cccccc'
    }).setOrigin(0.5)
  }
}

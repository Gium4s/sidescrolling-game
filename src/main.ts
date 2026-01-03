import Phaser from 'phaser'
import LevelSelect from './scenes/LevelSelect'
import Game from './scenes/Game'
import UI from './scenes/UI'
import GameOver from './scenes/GameOver'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 600,
  height: 600,
  parent: 'game',

  // ✅ serve per l'input "git init" (DOMElement)
  dom: { createContainer: true },

  physics: {
    default: 'matter',
    matter: { debug: false }
  },

  scene: [LevelSelect, Game, UI, GameOver],

  render: { pixelArt: true, roundPixels: true },

  scale: {
    mode: Phaser.Scale.ScaleModes.RESIZE,
    autoCenter: Phaser.Scale.Center.CENTER_BOTH
  }
}

export default new Phaser.Game(config)

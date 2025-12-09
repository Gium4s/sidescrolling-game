import Phaser from 'phaser'
import StartMenu from './scenes/StartMenu'
import Game from './scenes/Game'
import UI from './scenes/UI'
import GameOver from './scenes/GameOver'

const config: Phaser.Types.Core.GameConfig = {
	type: Phaser.AUTO,
	width: 600,
	height: 600,
	parent: 'game',

	physics: {
		default: 'matter',
		matter: {
			debug: false
		}
	},

	scene: [StartMenu, Game, UI, GameOver, 
	],
	
	render: { 
		pixelArt: true, 
		roundPixels: true 
	},

	scale: {
		mode: Phaser.Scale.ScaleModes.RESIZE,
		autoCenter: Phaser.Scale.Center.CENTER_BOTH
	}
}
export default new Phaser.Game(config)

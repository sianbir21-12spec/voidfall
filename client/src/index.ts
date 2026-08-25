import './style.css';
import Game from './game.ts';
import { MobileControls } from './input/mobile-controls.ts';

function main(): void {
  const game = new Game();
  new MobileControls(game.inputController);
  game.init();
}

main();

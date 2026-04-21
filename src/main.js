import Phaser from './phaser.js';
import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 1280,
  height: 720,
  backgroundColor: '#08111d',
  render: {
    antialias: true,
    pixelArt: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  scene: [BootScene, GameScene],
  // Keep simulation running when tab loses focus — required for headless E2E.
  disableContextMenu: true,
  fps: { target: 60, forceSetTimeOut: false },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
};

function showFatalError(error) {
  const container = document.getElementById('game-container');
  if (!container) {
    return;
  }

  const message = error instanceof Error ? (error.stack || error.message) : String(error);
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.style.width = '100%';
  panel.style.maxWidth = '980px';
  panel.style.margin = '24px';
  panel.style.padding = '20px 24px';
  panel.style.border = '1px solid rgba(255, 120, 120, 0.5)';
  panel.style.borderRadius = '14px';
  panel.style.background = 'rgba(15, 18, 26, 0.92)';
  panel.style.color = '#f7d7d7';
  panel.style.fontFamily = 'Consolas, Menlo, monospace';
  panel.style.whiteSpace = 'pre-wrap';
  panel.textContent = `RTS prototype failed to start.\n\n${message}`;
  container.appendChild(panel);
}

window.addEventListener('error', (event) => {
  showFatalError(event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  showFatalError(event.reason || 'Unhandled promise rejection');
});

try {
  window.__rts = new Phaser.Game(config);
} catch (error) {
  showFatalError(error);
}

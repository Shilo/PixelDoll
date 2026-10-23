// One measured horizontal stage shared by canvas actors and their DOM controls.
// Measure after render/resize, never in the animation loop.
let stage = { width: 0, center: 0 };
export function measureStage(screen, ui) {
  const rail = ui.querySelector(screen === 'selection' ? '.library' : '.wardrobe');
  const box = rail?.getBoundingClientRect();
  const sidebar = rail?.checkVisibility() && box.left > 0 && box.width < innerWidth * .8;
  const width = sidebar ? box.left : innerWidth;
  stage = { width, center: width / 2 };
  ui.style.setProperty('--stage-center', `${stage.center}px`);
  ui.style.setProperty('--stage-width', `${stage.width}px`);
}
export const stageLayout = () => stage;

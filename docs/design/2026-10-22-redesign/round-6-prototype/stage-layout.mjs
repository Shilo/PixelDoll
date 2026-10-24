// One measured stage shared by canvas actors and their DOM controls.
// Measure after render/resize, never in the animation loop.
let stage = { width: 0, center: 0, top: 0, bottom: 0 };
export function measureStage(screen, ui) {
  const rail = ui.querySelector(screen === 'selection' ? '.library' : '.wardrobe');
  const box = rail?.getBoundingClientRect();
  const sidebar = rail?.checkVisibility() && box.left > 0 && box.width < innerWidth * .8;
  const width = sidebar ? box.left : innerWidth;
  const visibleBox = selector => {
    const element = ui.querySelector(selector);
    return element?.checkVisibility() ? element.getBoundingClientRect() : null;
  };
  const upper = ['header', '.identity', '.view-tabs', '.mobile-library-actions'].map(visibleBox).filter(Boolean);
  const lower = (screen === 'selection' ? ['.selected-name', ...(!sidebar ? ['.library'] : [])] : ['.playback', ...(!sidebar ? ['.wardrobe'] : [])]).map(visibleBox).filter(Boolean);
  const hint = visibleBox('.hint');
  if (hint) (hint.top < innerHeight / 2 ? upper : lower).push(hint);
  stage = {
    width, center: width / 2,
    top: Math.max(0, ...upper.map(box => box.bottom)) + 8,
    bottom: Math.min(innerHeight, ...lower.map(box => box.top)) - 8,
  };
  ui.style.setProperty('--stage-center', `${stage.center}px`);
  ui.style.setProperty('--stage-width', `${stage.width}px`);
}
export const stageLayout = () => stage;

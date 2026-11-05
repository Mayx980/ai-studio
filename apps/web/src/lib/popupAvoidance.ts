type Area = { left: number; top: number; right: number; bottom: number };
type PopupState = { x: number; y: number; docked: boolean };
const popupSelector = ".el-popper, .mentionOverlay, [data-safe-popup]";
const protectedSelector = "[data-popup-protected], .messageInput, .promptCard, .promptInputWrap, .nodeSkeleton .bottomSlot, .nodeSkeleton .contentCard, .generatedResult img, .generatedResult video, .previewMedia img, .previewMedia video, .workMedia img, .workMedia video, .templatePreviewNode .nodeMedia img, .templatePreviewNode .nodeMedia video, .el-image-viewer__img, .casePreview img, .casePreview video, .historyCard .mediaPreview img, .historyCard .mediaPreview video";
function intersects(a: Area, b: Area) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }
function areaSize(area: Area) { return Math.max(0, area.right - area.left) * Math.max(0, area.bottom - area.top); }
function visibleArea(element: HTMLElement): Area | undefined {
  const style = getComputedStyle(element), rect = element.getBoundingClientRect();
  if (!element.getClientRects().length || style.visibility === "hidden" || style.display === "none" || !rect.width || !rect.height) return;
  const area = { left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(innerWidth, rect.right), bottom: Math.min(innerHeight, rect.bottom) };
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const parentStyle = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
    if (/(hidden|auto|scroll|clip)/.test(parentStyle.overflowX)) { area.left = Math.max(area.left, bounds.left); area.right = Math.min(area.right, bounds.right); }
    if (/(hidden|auto|scroll|clip)/.test(parentStyle.overflowY)) { area.top = Math.max(area.top, bounds.top); area.bottom = Math.min(area.bottom, bounds.bottom); }
  }
  return areaSize(area) > 0 ? area : undefined;
}
function freeAreas(obstacles: Area[]) {
  let areas: Area[] = [{ left: 12, top: 12, right: innerWidth - 12, bottom: innerHeight - 12 }];
  for (const obstacle of obstacles) {
    areas = areas.flatMap(area => {
      if (!intersects(area, obstacle)) return [area];
      const left = Math.max(area.left, obstacle.left), right = Math.min(area.right, obstacle.right), top = Math.max(area.top, obstacle.top), bottom = Math.min(area.bottom, obstacle.bottom);
      return [{ ...area, bottom: top }, { ...area, top: bottom }, { left: area.left, top, right: left, bottom }, { left: right, top, right: area.right, bottom }].filter(part => areaSize(part) > 0);
    });
    // ACT: 最多保留64块空白区域，控制密集画布的定位开销；碎片过多时使用预留底部区域。
    areas = areas.sort((a, b) => areaSize(b) - areaSize(a)).slice(0, 64);
  }
  return areas;
}
export function registerPopupAvoidance() {
  const states = new Map<HTMLElement, PopupState>();
  let frame = 0, dockHeight = 0;
  const setProperty = (element: HTMLElement, key: string, value: string) => { if (element.style.getPropertyValue(key) !== value) element.style.setProperty(key, value); };
  const release = (element: HTMLElement) => { element.classList.remove("safePopupManaged", "safePopupShifted", "safePopupDocked"); for (const key of ["--popupShiftX", "--popupShiftY", "--popupMaxWidth", "--popupMaxHeight"]) element.style.removeProperty(key); states.delete(element); resizeObserver.unobserve(element); };
  const setDock = (height: number) => {
    dockHeight = height;
    document.body.classList.toggle("popupSpaceReserved", height > 0);
    setProperty(document.documentElement, "--popupDockHeight", `${height}px`);
  };
  function positionPopups() {
    frame = 0;
    const popups = [...document.querySelectorAll<HTMLElement>(popupSelector)].filter(element => { if (element.getAttribute("aria-hidden") === "true" || !element.getClientRects().length) return false; const style = getComputedStyle(element), rect = element.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0; });
    for (const element of states.keys()) if (!popups.includes(element)) release(element);
    if (!popups.length) { if (dockHeight) setDock(0); return; }
    const protectedElements = [...document.querySelectorAll<HTMLElement>(protectedSelector)];
    for (const popup of popups) {
      let state = states.get(popup);
      if (!state) { state = { x: 0, y: 0, docked: false }; states.set(popup, state); resizeObserver.observe(popup); }
      const rect = popup.getBoundingClientRect(), scaleX = rect.width / (popup.offsetWidth || rect.width), scaleY = rect.height / (popup.offsetHeight || rect.height);
      const original = { left: rect.left - state.x * scaleX, top: rect.top - state.y * scaleY };
      const obstacles = protectedElements.filter(element => !popup.contains(element) && !element.closest(popupSelector)).flatMap(element => {
        const area = visibleArea(element); return area ? [{ left: area.left - 6, top: area.top - 6, right: area.right + 6, bottom: area.bottom + 6 }] : [];
      });
      const preferred = { ...original, right: original.left + rect.width, bottom: original.top + rect.height };
      let left = original.left, top = original.top;
      const fits = (area: Area) => area.right - area.left >= rect.width && area.bottom - area.top >= rect.height;
      if (state.docked) {
        left = Math.max(12, Math.min(original.left, innerWidth - rect.width - 12)); top = innerHeight - dockHeight + 12;
      } else if (preferred.left < 12 || preferred.top < 12 || preferred.right > innerWidth - 12 || preferred.bottom > innerHeight - 12 || obstacles.some(area => intersects(preferred, area))) {
        const candidates = freeAreas(obstacles).filter(fits).map(area => {
          const x = Math.max(area.left, Math.min(original.left, area.right - rect.width)), y = Math.max(area.top, Math.min(original.top, area.bottom - rect.height));
          return { x, y, distance: Math.abs(x - original.left) + Math.abs(y - original.top) };
        }).sort((a, b) => a.distance - b.distance);
        if (candidates[0]) { left = candidates[0].x; top = candidates[0].y; }
        else {
          state.docked = true;
          const height = Math.min(Math.max(160, rect.height + 24), Math.floor(innerHeight * .45));
          setDock(Math.max(dockHeight, height));
          setProperty(popup, "--popupMaxHeight", `${(dockHeight - 24) / scaleY}px`);
          setProperty(popup, "--popupMaxWidth", `${(innerWidth - 24) / scaleX}px`);
          schedule(); continue;
        }
      }
      if (state.docked) { if (!popup.classList.contains("safePopupDocked")) popup.classList.add("safePopupDocked"); setProperty(popup, "--popupMaxHeight", `${(dockHeight - 24) / scaleY}px`); setProperty(popup, "--popupMaxWidth", `${(innerWidth - 24) / scaleX}px`); }
      state.x = Number(((left - original.left) / scaleX).toFixed(2)); state.y = Number(((top - original.top) / scaleY).toFixed(2));
      if (!popup.classList.contains("safePopupManaged")) popup.classList.add("safePopupManaged");
      popup.classList.toggle("safePopupShifted", Math.abs(state.x) + Math.abs(state.y) > 1);
      setProperty(popup, "--popupShiftX", `${state.x}px`); setProperty(popup, "--popupShiftY", `${state.y}px`);
    }
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(positionPopups); }
  const resizeObserver = new ResizeObserver(schedule);
  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class", "aria-hidden"] });
  window.addEventListener("resize", schedule); window.addEventListener("scroll", schedule, true); window.addEventListener("load", schedule, true); window.addEventListener("loadedmetadata", schedule, true);
  schedule();
  return () => { cancelAnimationFrame(frame); mutationObserver.disconnect(); resizeObserver.disconnect(); window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true); window.removeEventListener("load", schedule, true); window.removeEventListener("loadedmetadata", schedule, true); for (const element of states.keys()) release(element); setDock(0); document.documentElement.style.removeProperty("--popupDockHeight"); };
}

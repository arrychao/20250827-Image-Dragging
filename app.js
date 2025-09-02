// 以静态数组指向 image/ 下的 9 张图片（文件名含中文，使用 encodeURI）
const images = [
  "image/jimeng-2025-07-07-1357-展示产品与精致的木质或大理石桌面搭配，镜头从顶部慢慢推向瓶身，突出瓶身的光滑质感.png",
  "image/jimeng-2025-07-07-1653-采用仰视镜头展示产品，背后是柔和的自然光照射，突出简洁的设计和清新的氛围.png",
  "image/jimeng-2025-07-07-2333-以略微倾斜的俯视角度拍摄，产品周围围绕着柑橘类水果，展现自然与清新的主题.png",
  "image/jimeng-2025-07-07-2802-展示产品与精致的木质或大理石桌面搭配，镜头从顶部慢慢推向瓶身，突出瓶身的光滑质感.png",
  "image/jimeng-2025-07-07-3147-利用柔和的渐变和光效，营造梦幻般的氛围，将产品作为焦点.png",
  "image/jimeng-2025-07-07-3809-使用柔和的自然光拍摄，轻微阴影效果突显产品的光滑质感，背景中点缀一些白色花朵，创....png",
  "image/jimeng-2025-07-07-3847-将产品放置在浅色背景中，搭配清新简约的绿植，镜头缓慢推近，展示其光滑的瓶身和标签.png",
  "image/jimeng-2025-07-07-3972-捕捉产品瓶身旋转时的光泽感，背景中放置细小的植物装饰，增强自然清新的气氛.png",
  "image/jimeng-2025-07-07-4041-以简约、干净的设计展示产品，产品置于画面中央，周围环绕新鲜的水果，如柠檬、草莓和....png",
];

// 固定几何：100px 方图，间距 12px；第一行 5 个，第二行 4 个
const SIZE = 100;
const GAP = 12;
const PADDING = 16; // 与 .grid 的 padding 保持一致
const GRID_COLS_FIRST_ROW = 5;
const TOTAL = 9;

const grid = document.getElementById("grid");
const state = { order: [...images] };

// key -> element 的映射，key 即图片 src
const keyToEl = new Map();

function indexToXY(index) {
  // 槽位从 0..8：0..4 在第一行，5..8 在第二行
  const row = index < GRID_COLS_FIRST_ROW ? 0 : 1;
  const col = index < GRID_COLS_FIRST_ROW ? index : index - GRID_COLS_FIRST_ROW; // 第二行 0..3
  const x = PADDING + col * (SIZE + GAP);
  const y = PADDING + row * (SIZE + GAP);
  return { x, y };
}

function updateStageSize() {
  const total = state.order.length;
  const rows = total <= GRID_COLS_FIRST_ROW ? 1 : 2; // 当前为最多两行
  const contentWidth = GRID_COLS_FIRST_ROW * SIZE + (GRID_COLS_FIRST_ROW - 1) * GAP;
  const contentHeight = rows * SIZE + (rows - 1) * GAP;
  const stageWidth = PADDING * 2 + contentWidth;
  const stageHeight = PADDING * 2 + contentHeight;
  grid.style.width = stageWidth + "px";
  grid.style.height = stageHeight + "px";
}

function layout(order) {
  order.forEach((key, slotIndex) => {
    const el = keyToEl.get(key);
    if (!el || el.classList.contains("dragging")) return;
    const { x, y } = indexToXY(slotIndex);
    el.style.transform = `translate(${x}px, ${y}px)`;
  });
}

function render() {
  grid.innerHTML = "";
  keyToEl.clear();
  state.order.forEach((src, index) => {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.setAttribute("role", "listitem");
    // 禁用原生 DnD，避免与自定义指针拖拽冲突
    cell.draggable = false;
    cell.dataset.index = String(index);
    cell.dataset.key = src;

    const img = document.createElement("img");
    img.src = encodeURI(src);
    img.alt = `图片 ${index + 1}`;
    img.draggable = false;
    img.addEventListener("error", () => {
      if (!img.dataset._retry) { img.dataset._retry = "1"; img.src = encodeURI(src); }
    });
    cell.appendChild(img);

    // 悬浮覆盖层（文件：image/hover图片.png），缺失时自动隐藏
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const overlayImg = document.createElement("img");
    overlayImg.src = encodeURI("image/hover图层.png");
    overlayImg.alt = "";
    overlayImg.draggable = false;
    overlayImg.addEventListener("error", () => { overlay.style.display = "none"; });
    overlay.appendChild(overlayImg);
    cell.appendChild(overlay);
    grid.appendChild(cell);
    keyToEl.set(src, cell);

    // 防守：如果浏览器仍触发 dragstart，强制阻止
    cell.addEventListener("dragstart", (e) => { e.preventDefault(); });
  });

  bindDnd();
  updateStageSize();
  layout(state.order);
}

let dragIndex = null;
let dragKey = null;
let dragOffset = { x: 0, y: 0 };
let draggingElRef = null;
let tempOrder = null;
let gridRect = null;
let dragStartClient = { x: 0, y: 0 };
let hasActivatedReorder = false; // 移动阈值触发前不重排，避免初始跳位
let dragProxyEl = null; // 独立的拖拽代理节点（fixed）
let activePointerId = null;

function bindDnd() {
  const cells = Array.from(document.querySelectorAll(".cell"));
  cells.forEach(cell => {
    cell.addEventListener("pointerdown", onPointerDown);
  });
}

function getNearestSlotIndex(px, py) {
  // px/py 是相对 grid 左上角的坐标
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < TOTAL; i++) {
    const { x, y } = indexToXY(i);
    const cx = x + SIZE / 2;
    const cy = y + SIZE / 2;
    const dx = px - cx;
    const dy = py - cy;
    const d = dx * dx + dy * dy;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

function onDragStart(ev) {
  const target = ev.currentTarget;
  dragIndex = Number(target.dataset.index);
  dragKey = target.dataset.key;
  tempOrder = [...state.order];
  target.classList.add("dragging");
  ev.dataTransfer.effectAllowed = "move";
  try { ev.dataTransfer.setData("text/plain", "drag"); } catch (e) {}

  const transparentImg = new Image();
  transparentImg.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WcYJ7sAAAAASUVORK5CYII=";
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.top = "-1000px";
  wrap.style.left = "-1000px";
  wrap.appendChild(transparentImg);
  document.body.appendChild(wrap);
  ev.dataTransfer.setDragImage(transparentImg, 0, 0);
  setTimeout(() => document.body.removeChild(wrap), 0);

  const rect = target.getBoundingClientRect();
  gridRect = grid.getBoundingClientRect();
  dragStartClient = { x: ev.clientX || 0, y: ev.clientY || 0 };
  hasActivatedReorder = false;
  requestAnimationFrame(() => {
    dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    draggingElRef = target;
    // 创建拖拽代理节点，保持原元素位置不变，仅隐藏避免重影
    dragProxyEl = target.cloneNode(true);
    dragProxyEl.removeAttribute("draggable");
    dragProxyEl.style.position = "fixed";
    dragProxyEl.style.left = rect.left + "px";
    dragProxyEl.style.top = rect.top + "px";
    dragProxyEl.style.width = rect.width + "px";
    dragProxyEl.style.height = rect.height + "px";
    dragProxyEl.style.pointerEvents = "none";
    dragProxyEl.style.zIndex = 999;
    dragProxyEl.style.transition = "none";
    dragProxyEl.style.transform = "none"; // 关键：确保不受原元素 translate 影响
    document.body.appendChild(dragProxyEl);
    // 隐藏原元素，避免看到 transform 变化
    draggingElRef.style.visibility = "hidden";
  });
}

// Pointer 事件版本实现
function onContainerDragOver(_) {}

function onPointerDown(ev) {
  const target = ev.currentTarget;
  ev.preventDefault();
  ev.stopPropagation();

  activePointerId = ev.pointerId;
  try { target.setPointerCapture(activePointerId); } catch (_) {}

  dragIndex = Number(target.dataset.index);
  dragKey = target.dataset.key;
  tempOrder = [...state.order];
  target.classList.add("dragging");

  const rect = target.getBoundingClientRect();
  gridRect = grid.getBoundingClientRect();
  dragStartClient = { x: ev.clientX || 0, y: ev.clientY || 0 };
  hasActivatedReorder = false;
  dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  draggingElRef = target;

  // 代理
  dragProxyEl = target.cloneNode(true);
  dragProxyEl.removeAttribute("draggable");
  dragProxyEl.style.position = "fixed";
  // 代理初始放在指针下，消除“先回到原位”的任何视觉跳动
  dragProxyEl.style.left = ev.clientX - dragOffset.x + "px";
  dragProxyEl.style.top = ev.clientY - dragOffset.y + "px";
  dragProxyEl.style.width = rect.width + "px";
  dragProxyEl.style.height = rect.height + "px";
  dragProxyEl.style.pointerEvents = "none";
  dragProxyEl.style.zIndex = 999;
  dragProxyEl.style.transition = "none";
  dragProxyEl.style.transform = "none";
  document.body.appendChild(dragProxyEl);
  draggingElRef.style.visibility = "hidden";

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp, { once: true });
  window.addEventListener("pointercancel", onPointerUp, { once: true });
}

function onPointerMove(ev) {
  if (!draggingElRef || ev.pointerId !== activePointerId) return;
  if (typeof ev.clientX !== "number" || typeof ev.clientY !== "number") return;
  ev.preventDefault();

  // 代理跟随
  if (dragProxyEl) {
    dragProxyEl.style.left = ev.clientX - dragOffset.x + "px";
    dragProxyEl.style.top = ev.clientY - dragOffset.y + "px";
  }

  // 忽略早期无效
  if (ev.clientX === 0 && ev.clientY === 0) return;
  const localX = ev.clientX - gridRect.left;
  const localY = ev.clientY - gridRect.top;

  const moveManhattan = Math.abs(ev.clientX - dragStartClient.x) + Math.abs(ev.clientY - dragStartClient.y);
  if (!hasActivatedReorder) {
    if (moveManhattan < 3) return;
    hasActivatedReorder = true;
  }

  let desiredIndex = getNearestSlotIndex(localX, localY);
  const cur = tempOrder.indexOf(dragKey);
  if (cur !== -1) tempOrder.splice(cur, 1);
  desiredIndex = Math.min(desiredIndex, tempOrder.length);
  tempOrder.splice(desiredIndex, 0, dragKey);

  layout(tempOrder);
}

function onPointerUp(ev) {
  if (!draggingElRef || ev.pointerId !== activePointerId) return;
  try { draggingElRef.releasePointerCapture(activePointerId); } catch (_) {}
  activePointerId = null;

  // 提交排序
  state.order = tempOrder || state.order;
  const finalIndex = state.order.indexOf(dragKey);
  const { x, y } = indexToXY(finalIndex);

  // 原元素先就位（仍隐藏，不产生闪烁）
  const originalEl = draggingElRef;
  originalEl.style.transform = `translate(${x}px, ${y}px)`;

  // 让代理从当前位置动画到最终槽位，再无缝切换回原元素
  if (dragProxyEl) {
    const targetLeft = gridRect.left + x;
    const targetTop = gridRect.top + y;
    const proxyEl = dragProxyEl;
    const currentLeft = parseFloat(proxyEl.style.left || "0");
    const currentTop = parseFloat(proxyEl.style.top || "0");

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return; cleaned = true;
      if (proxyEl && proxyEl.parentNode) proxyEl.parentNode.removeChild(proxyEl);
      originalEl.style.visibility = "";
      originalEl.classList.remove("dragging");
    };

    const delta = Math.abs(currentLeft - targetLeft) + Math.abs(currentTop - targetTop);
    if (delta < 0.5) {
      cleanup();
    } else {
      proxyEl.style.transition = "left 200ms cubic-bezier(.2,.8,.2,1), top 200ms cubic-bezier(.2,.8,.2,1)";
      proxyEl.addEventListener("transitionend", cleanup, { once: true });
      // 触发动画
      proxyEl.style.left = targetLeft + "px";
      proxyEl.style.top = targetTop + "px";
      // 兜底：某些情况下 transitionend 不触发
      setTimeout(cleanup, 260);
    }
  } else {
    originalEl.style.visibility = "";
    originalEl.classList.remove("dragging");
  }
  dragProxyEl = null;

  // 更新索引标注
  state.order.forEach((key, idx) => {
    const el = keyToEl.get(key);
    if (el) el.dataset.index = String(idx);
  });

  // 清理
  window.removeEventListener("pointermove", onPointerMove);
  draggingElRef = null;
  dragIndex = null;
  dragKey = null;
  tempOrder = null;
  gridRect = null;
}

function onDragMove(ev) {
  if (!draggingElRef) return;
  if (typeof ev.clientX !== "number" || typeof ev.clientY !== "number") return;

  // 跟随指针
  if (dragProxyEl) {
    dragProxyEl.style.left = ev.clientX - dragOffset.x + "px";
    dragProxyEl.style.top = ev.clientY - dragOffset.y + "px";
  }

  // 计算最近槽位并生成临时顺序
  // 忽略早期无效 drag 事件（部分浏览器初始会给 0,0）
  if (ev.clientX === 0 && ev.clientY === 0) return;
  const localX = ev.clientX - gridRect.left;
  const localY = ev.clientY - gridRect.top;

  // 未超过最小移动阈值前不触发布局重排，避免初始跳到第一个槽位
  const moveManhattan = Math.abs(ev.clientX - dragStartClient.x) + Math.abs(ev.clientY - dragStartClient.y);
  if (!hasActivatedReorder) {
    if (moveManhattan < 3) return; // 3px 阈值
    hasActivatedReorder = true;
  }
  let desiredIndex = getNearestSlotIndex(localX, localY);

  const cur = tempOrder.indexOf(dragKey);
  if (cur !== -1) tempOrder.splice(cur, 1);
  desiredIndex = Math.min(desiredIndex, tempOrder.length); // 保险
  tempOrder.splice(desiredIndex, 0, dragKey);

  layout(tempOrder);
}

function onDragEnd() {
  if (!draggingElRef) return;
  // 提交排序
  state.order = tempOrder || state.order;
  // 移除代理，并恢复原元素可见
  const finalIndex = state.order.indexOf(dragKey);
  const { x, y } = indexToXY(finalIndex);
  if (dragProxyEl && dragProxyEl.parentNode) {
    dragProxyEl.parentNode.removeChild(dragProxyEl);
  }
  dragProxyEl = null;
  draggingElRef.style.visibility = "";
  draggingElRef.classList.remove("dragging");
  // 通过统一布局将原元素放回最终槽位
  draggingElRef.style.transform = `translate(${x}px, ${y}px)`;

  // 更新索引标注
  state.order.forEach((key, idx) => {
    const el = keyToEl.get(key);
    if (el) el.dataset.index = String(idx);
  });

  // 清理状态
  draggingElRef = null;
  dragIndex = null;
  dragKey = null;
  tempOrder = null;
  gridRect = null;
}

render();



var window = this;
var document = {
  createElement() { return new DesktopCanvas(); },
};

class DesktopCanvas {
  constructor() {
    this.id = native(0);
    this.w = this.h = 1;
    this.clientWidth = 340;
    this.context = new DesktopContext(this.id);
  }
  get width() { return this.w; }
  set width(w) { this.w = w; native(1, this.id, this.w, this.h); }
  get height() { return this.h; }
  set height(h) { this.h = h; native(1, this.id, this.w, this.h); }
  getContext() { return this.context; }
}

class DesktopGradient {
  constructor(args) { this.args = args; }
  addColorStop(position, color) { this.args.push(position, color); }
}

class DesktopContext {
  constructor(id) {
    this.id = id;
    this.fillStyle = this.strokeStyle = '#000000';
    this.lineWidth = this.globalAlpha = 1;
    this.font = '10px sans-serif';
    this.styles = [];
  }

  beginPath() { native(2, this.id); }
  closePath() { native(3, this.id); }
  clearRect() { native(4, this.id); }
  moveTo(x, y) { native(5, this.id, x, y); }
  lineTo(x, y) { native(6, this.id, x, y); }
  bezierCurveTo(a, b, c, d, x, y) { native(7, this.id, a, b, c, d, x, y); }
  ellipse(x, y, rx, ry, angle) { native(8, this.id, x, y, rx, ry, angle); }
  arc(x, y, r) { this.ellipse(x, y, r, r, 0); }
  roundRect(x, y, w, h, r) {
    const corners = Array.isArray(r) ? r : [r, r, r, r];
    native(9, this.id, x, y, w, h, ...corners);
  }

  save() {
    this.styles.push([this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha]);
    native(10, this.id);
  }
  restore() {
    [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha] = this.styles.pop();
    native(11, this.id);
  }
  translate(x, y) { native(12, this.id, x, y); }
  scale(x, y) { native(13, this.id, x, y); }
  rotate(a) { native(14, this.id, a); }
  setTransform(a, b, c, d, x, y) { native(15, this.id, a, b, c, d, x, y); }
  transform(a, b, c, d, x, y) { native(16, this.id, a, b, c, d, x, y); }

  createLinearGradient(x, y, x2, y2) { return new DesktopGradient([1, x, y, x2, y2]); }
  createRadialGradient(x, y, r, x2, y2, r2) { return new DesktopGradient([2, x, y, r, x2, y2, r2]); }
  fillArgs() { return typeof this.fillStyle === 'string' ? [0, this.fillStyle] : this.fillStyle.args; }
  fill() { native(17, this.id, ...this.fillArgs()); }
  fillRect(x, y, w, h) { native(18, this.id, x, y, w, h, ...this.fillArgs()); }
  stroke() { native(19, this.id, this.strokeStyle, this.lineWidth); }
  strokeRect(x, y, w, h) { native(20, this.id, x, y, w, h, this.strokeStyle, this.lineWidth); }
  drawImage(canvas, x, y, w = 0, h = 0) { native(21, this.id, canvas.id, x, y, w, h, this.globalAlpha); }
  fillText(text, x, y) {
    const size = Number(this.font.match(/([\d.]+)px/)[1]);
    native(22, this.id, text, x, y, this.fillStyle, size);
  }
}

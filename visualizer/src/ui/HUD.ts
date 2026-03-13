/**
 * Heads-up display overlay showing track info, BPM, FPS, channel layout.
 */
export class HUD {
  private element: HTMLElement;
  private lines: Map<string, string> = new Map();

  constructor() {
    this.element = document.getElementById('hud')!;
  }

  set(key: string, value: string): void {
    this.lines.set(key, value);
  }

  remove(key: string): void {
    this.lines.delete(key);
  }

  update(fps: number): void {
    this.lines.set('FPS', `${fps}`);
    const parts: string[] = [];
    for (const [key, val] of this.lines) {
      parts.push(`${key}: ${val}`);
    }
    this.element.textContent = parts.join('  |  ');
  }
}

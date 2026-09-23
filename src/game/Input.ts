/** Tracks WASD (and arrow keys) as simple axis values, plus Space for the handbrake and E for the horn. */
export class Input {
  private readonly pressed = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      // Keep Space from scrolling or re-clicking a focused button while driving.
      if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) e.preventDefault();
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.pressed.delete(e.code));
    window.addEventListener('blur', () => this.pressed.clear());
  }

  /** +1 forward (W), -1 backward (S). */
  get throttle(): number {
    return (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  }

  /** +1 left (A), -1 right (D). */
  get steer(): number {
    return (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0) - (this.isDown('KeyD', 'ArrowRight') ? 1 : 0);
  }

  get handbrake(): boolean {
    return this.isDown('Space');
  }

  get honk(): boolean {
    return this.isDown('KeyE');
  }

  /** Hold T to fast-forward the day/night cycle. */
  get fastForward(): boolean {
    return this.isDown('KeyT');
  }

  private isDown(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }
}

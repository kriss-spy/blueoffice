/** Original BlueOffice synthesized notification; no samples or third-party audio bytes. */
export class SceneSound {
  private context?: AudioContext;
  played = 0;
  async enable() {
    this.context ??= new AudioContext();
    await this.context.resume();
  }
  play() {
    if (!this.context || this.context.state !== "running") return;
    const context = this.context,
      now = context.currentTime;
    for (const [offset, frequency] of [
      [0, 660],
      [0.09, 880],
    ]) {
      const oscillator = context.createOscillator(),
        gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(0.025, now + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.085);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.09);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    }
    this.played++;
  }
  dispose() {
    void this.context?.close();
    this.context = undefined;
  }
}

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { HEAT_GRADIENT } from '../shared/heat/heat-ramp';
import { Icon } from '../shared/icon';
import { VideoHeatmap } from './video-heatmap';

/** Test mode: upload a video and tune how the heatmap is built from it. */
@Component({
  selector: 'app-settings-test',
  imports: [Icon, VideoHeatmap],
  templateUrl: './settings-test.html',
})
export class SettingsTest {
  protected readonly videoUrl = signal<string | null>(null);
  protected readonly fileName = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly dragging = signal(false);

  // Same options, ranges and defaults as the vision prototype.
  protected readonly showCamera = signal(true);
  protected readonly radius = signal(31);
  protected readonly confidence = signal(0.4);
  protected readonly decay = signal(0.85);

  protected readonly heatGradient = HEAT_GRADIENT;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.release());
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.load(input.files?.[0]);
    // Lets the user pick the same file again.
    input.value = '';
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.load(event.dataTransfer?.files[0]);
  }

  protected hover(event: DragEvent, over: boolean): void {
    event.preventDefault();
    this.dragging.set(over);
  }

  protected numberFrom(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected checkedFrom(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  private load(file: File | undefined): void {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('video/')) {
      this.error.set(`«${file.name}» no es un vídeo.`);
      return;
    }
    this.release();
    this.error.set(null);
    this.fileName.set(file.name);
    this.videoUrl.set(URL.createObjectURL(file));
  }

  private release(): void {
    const url = this.videoUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

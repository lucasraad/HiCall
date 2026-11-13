import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HicallDesktopSource } from '../../core/desktop/hicall-desktop';
import { ScreenQualityId, ScreenQualityOption } from '../../core/voice/screen-quality';
import { LucideMonitor, LucideX } from '../../shared/icons/app-icons';

export interface ScreenSharePickEvent {
  sourceId: string;
  includeSystemAudio: boolean;
}

@Component({
  selector: 'app-screen-share-picker',
  standalone: true,
  imports: [FormsModule, LucideMonitor, LucideX],
  template: `
    <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
      <div class="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
        <header class="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-zinc-100">Compartilhar tela</h2>
            <p class="mt-0.5 text-xs text-zinc-400">
              Marque “Incluir som do computador (sem o som da call)” para enviar o áudio da tela ou da janela.
            </p>
          </div>
          <button
            class="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            type="button"
            title="Cancelar"
            (click)="cancel.emit()"
          >
            <svg lucideX class="h-4 w-4"></svg>
          </button>
        </header>

        <div class="flex flex-wrap items-center gap-3 border-b border-zinc-700 px-4 py-2">
          <label class="flex min-w-0 flex-1 items-center gap-2 text-xs text-zinc-400">
            Qualidade
            <select
              class="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              name="hicall-picker-quality"
              [ngModel]="qualityId()"
              (ngModelChange)="onQualityChange($event)"
            >
              @for (option of qualities(); track option.id) {
                <option [value]="option.id">{{ option.label }}</option>
              }
            </select>
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-xs text-zinc-200" title="Envia o som da tela ou da janela, sem as vozes da call">
            <input
              class="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900"
              type="checkbox"
              [checked]="includeSystemAudio()"
              (change)="includeSystemAudio.set(($any($event.target)).checked)"
            />
            Incluir som do computador (sem o som da call)
          </label>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          @if (loading()) {
            <p class="py-8 text-center text-sm text-zinc-400">Carregando janelas e monitores...</p>
          } @else if (error()) {
            <p class="py-8 text-center text-sm text-red-400">{{ error() }}</p>
          } @else {
            @if (screens().length > 0) {
              <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Monitores</h3>
              <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                @for (source of screens(); track source.id) {
                  <button
                    class="overflow-hidden rounded-md border border-zinc-600 bg-zinc-900 text-left hover:border-brand"
                    type="button"
                    (click)="pick(source.id)"
                  >
                    <img class="h-28 w-full object-cover" [src]="source.thumbnail" [alt]="source.name" />
                    <span class="block truncate px-2 py-1.5 text-xs text-zinc-200">{{ source.name }}</span>
                  </button>
                }
              </div>
            }

            <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Janelas</h3>
            @if (windows().length === 0) {
              <p class="text-sm text-zinc-500">Nenhuma janela encontrada.</p>
            } @else {
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                @for (source of windows(); track source.id) {
                  <button
                    class="overflow-hidden rounded-md border border-zinc-600 bg-zinc-900 text-left hover:border-brand"
                    type="button"
                    (click)="pick(source.id)"
                  >
                    @if (source.thumbnail) {
                      <img class="h-28 w-full object-cover" [src]="source.thumbnail" [alt]="source.name" />
                    } @else {
                      <div class="flex h-28 items-center justify-center bg-zinc-950">
                        <svg lucideMonitor class="h-8 w-8 text-zinc-500"></svg>
                      </div>
                    }
                    <span class="block truncate px-2 py-1.5 text-xs text-zinc-200">{{ source.name }}</span>
                  </button>
                }
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class ScreenSharePickerComponent {
  readonly sources = input<HicallDesktopSource[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly qualityId = input<ScreenQualityId>('auto');
  readonly qualities = input<ScreenQualityOption[]>([]);

  readonly select = output<ScreenSharePickEvent>();
  readonly cancel = output<void>();
  readonly qualityChange = output<ScreenQualityId>();
  /** Default ligado (paridade com “áudio do sistema” no Chrome). */
  readonly includeSystemAudio = signal(true);

  screens(): HicallDesktopSource[] {
    return this.sources().filter((source) => source.type === 'screen');
  }

  windows(): HicallDesktopSource[] {
    return this.sources().filter((source) => source.type === 'window');
  }

  pick(sourceId: string): void {
    this.select.emit({ sourceId, includeSystemAudio: this.includeSystemAudio() });
  }

  onQualityChange(id: string): void {
    this.qualityChange.emit(id as ScreenQualityId);
  }
}

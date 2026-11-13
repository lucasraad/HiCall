import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-password-input',
  standalone: true,
  imports: [FormsModule],
  template: `
    <label class="block">
      <span class="mb-1 block text-sm" [class]="labelClass()">{{ label() }}</span>
      <div class="relative">
        <input
          class="w-full rounded-md border py-2 pl-3 pr-10 text-sm outline-none focus:border-brand"
          [class]="inputClass()"
          [type]="visible() ? 'text' : 'password'"
          [attr.name]="name()"
          [attr.autocomplete]="autocomplete()"
          [attr.minlength]="minlength()"
          [required]="required()"
          [(ngModel)]="value"
        />
        <button
          class="absolute inset-y-0 right-0 flex w-10 items-center justify-center"
          [class]="toggleClass()"
          type="button"
          [attr.aria-label]="visible() ? 'Ocultar senha' : 'Mostrar senha'"
          (click)="visible.set(!visible())"
        >
          @if (visible()) {
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.584 10.587a2 2 0 002.829 2.828M9.363 5.366A9.953 9.953 0 0112 5c4.255 0 7.893 2.025 10.243 5.15-.705.98-1.635 1.9-2.733 2.672M6.226 6.226C4.15 7.787 2.524 9.81 1.5 12c1.273 2.549 3.307 4.746 5.726 6.226" />
            </svg>
          } @else {
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1 1 0 010-.644C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        </button>
      </div>
    </label>
  `,
})
export class PasswordInputComponent {
  readonly label = input('Senha');
  readonly name = input<string>();
  readonly autocomplete = input<string>();
  readonly minlength = input<number>();
  readonly required = input(true);
  readonly variant = input<'light' | 'dark'>('dark');
  readonly value = model('');
  readonly visible = model(false);

  readonly labelClass = computed(() => (this.variant() === 'dark' ? 'text-zinc-300' : 'text-zinc-700'));

  readonly inputClass = computed(() =>
    this.variant() === 'dark'
      ? 'border-zinc-600 bg-zinc-900 text-zinc-100 placeholder:text-zinc-500'
      : 'border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400',
  );

  readonly toggleClass = computed(() =>
    this.variant() === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-800',
  );
}

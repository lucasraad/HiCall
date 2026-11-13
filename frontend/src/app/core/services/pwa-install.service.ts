import { Injectable, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  readonly canInstall = signal(false);
  readonly isStandalone = signal(false);
  readonly isIos = signal(false);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    this.isStandalone.set(this.detectStandalone());
    this.isIos.set(/iphone|ipad|ipod/i.test(navigator.userAgent));

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isStandalone.set(true);
    });
  }

  async install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPrompt) {
      return 'unavailable';
    }

    await this.deferredPrompt.prompt();
    const choice = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstall.set(false);

    if (choice.outcome === 'accepted') {
      this.isStandalone.set(true);
    }

    return choice.outcome;
  }

  private detectStandalone(): boolean {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
    );
  }
}

import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-landing-demo',
  standalone: true,
  templateUrl: './landing-demo.component.html',
  styleUrl: './landing-demo.component.css',
})
export class LandingDemoComponent {
  readonly scene = signal<'voice' | 'screen' | 'controls'>('voice');
  readonly paused = signal(false);
  readonly demoMuted = signal(false);
  readonly people = [
    { name: 'Lia', initials: 'LI', color: 'peach' },
    { name: 'Caio', initials: 'CA', color: 'blue' },
    { name: 'Bia', initials: 'BI', color: 'mint' },
  ];
}

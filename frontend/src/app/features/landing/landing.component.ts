import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DESKTOP_SETUP_URL } from '../../core/desktop/desktop-download';
import { LandingFeaturesComponent } from './landing-features.component';
import { LandingDemoComponent } from './landing-demo.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, LandingDemoComponent, LandingFeaturesComponent],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.css',
})
export class LandingComponent {
  readonly desktopUrl = DESKTOP_SETUP_URL;
}

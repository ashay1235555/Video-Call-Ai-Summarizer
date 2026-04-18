import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `<app-video-chat></app-video-chat>`,
  styles: [`
    :host { display: block; width: 100vw; height: 100vh; }
  `]
})
export class AppComponent {
  title = 'vonage-video-client';
}

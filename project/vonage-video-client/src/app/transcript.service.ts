import { Injectable, NgZone } from '@angular/core';
import { Subject, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TranscriptService {
  private recognition: any;
  private isListening = false;
  
  public transcript$ = new Subject<{text: string, isFinal: boolean}>();
  public status$ = new BehaviorSubject<'idle' | 'listening' | 'error' | 'not-supported'>('idle');

  constructor(private zone: NgZone) {
    const { webkitSpeechRecognition }: any = window as any;
    if (webkitSpeechRecognition) {
      this.recognition = new webkitSpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        this.zone.run(() => {
          if (!event.results || event.results.length === 0) return;
          
          const i = event.results.length - 1;
          if (!event.results[i] || !event.results[i][0]) return;

          const transcript = event.results[i][0].transcript;
          const isFinal = event.results[i].isFinal;
          
          console.log(`Latest Speech: "${transcript}" (Final: ${isFinal})`);
          this.transcript$.next({ text: transcript.trim(), isFinal });
        });
      };

      this.recognition.onerror = (event: any) => {
        this.zone.run(() => {
          console.error('Speech recognition error:', event.error);
          this.status$.next('error');
          if (event.error === 'no-speech' || event.error === 'aborted') {
            console.log('Non-critical error, will attempt to restart...');
          } else if (event.error === 'not-allowed') {
            console.error('Microphone access denied.');
            this.isListening = false;
          }
        });
      };

      this.recognition.onend = () => {
        this.zone.run(() => {
          console.log('Speech recognition service disconnected.');
          if (this.isListening) {
            console.log('Restarting transcription service...');
            setTimeout(() => {
              if (this.isListening) {
                try {
                  this.recognition.start();
                  this.status$.next('listening');
                } catch (e) {
                  console.error('Failed to restart recognition:', e);
                  this.status$.next('error');
                }
              }
            }, 1000);
          } else {
            this.status$.next('idle');
          }
        });
      };
    } else {
      console.warn('Speech recognition not supported in this browser.');
      this.status$.next('not-supported');
    }
  }

  start() {
    if (this.recognition && !this.isListening) {
      try {
        this.isListening = true;
        this.recognition.start();
        this.status$.next('listening');
        console.log('Transcription started...');
      } catch (e) {
        console.error('Failed to start recognition:', e);
        this.status$.next('error');
      }
    }
  }

  stop() {
    this.isListening = false;
    if (this.recognition) {
      this.recognition.stop();
      this.status$.next('idle');
      console.log('Transcription stopped.');
    }
  }
}

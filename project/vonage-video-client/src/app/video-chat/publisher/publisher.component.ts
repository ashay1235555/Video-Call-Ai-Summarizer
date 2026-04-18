import { Component, ElementRef, AfterViewInit, ViewChild, Input, OnDestroy, NgZone, OnInit, Output, EventEmitter } from '@angular/core';
import * as OT from '@opentok/client';

@Component({
  selector: 'app-publisher',
  templateUrl: './publisher.component.html',
  styleUrls: ['./publisher.component.css']
})
export class PublisherComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('publisherDiv') publisherDiv!: ElementRef;
  @Input() session!: any;
  @Output() endCallRequest = new EventEmitter<void>();

  publisher!: any;
  publishing: boolean = false;
  isPublished: boolean = false;
  isVideoActive: boolean = true;
  isAudioActive: boolean = true;
  isScreenSharing: boolean = false;
  screenPublisher!: any;

  constructor(private zone: NgZone) { }

  ngOnInit() { }

  ngAfterViewInit() {
    this.startVideoCall();
  }

  startVideoCall() {
    console.log('Initializing publisher...');
    this.publisher = OT.initPublisher(this.publisherDiv.nativeElement, {
      insertMode: 'append',
      width: '100%',
      height: '100%',
      showControls: false,
      style: { buttonDisplayMode: 'off' }
    }, (err: any) => {
      this.zone.run(() => {
        if (err) {
          console.error('Publisher Init Error:', err);
          if (err.name === 'OT_USER_MEDIA_ACCESS_DENIED') {
            alert('Camera/Microphone access was denied. Please check your browser permissions.');
          } else if (err.name === 'OT_HARDWARE_UNAVAILABLE') {
            alert('Your camera or microphone is being used by another application.');
          } else {
            alert('Failed to initialize camera: ' + (err.message || err.name));
          }
        } else {
          console.log('Publisher initialized successfully.');
          this.checkAndPublish();
        }
      });
    });

    if (this.session) {
      this.session.once('sessionConnected', () => {
        console.log('Session connected event in publisher');
        this.checkAndPublish();
      });
    }
  }

  private checkAndPublish() {
    if (this.session && this.session.connection && this.publisher && !this.publishing && !this.isPublished) {
      console.log('All requirements met, initiating publish...');
      this.publish();
    } else {
      console.log('Publish deferred: session connected:', !!(this.session && this.session.connection), 
                  'publisher ready:', !!this.publisher, 
                  'already publishing:', this.publishing,
                  'already published:', this.isPublished);
    }
  }

  publish() {
    if (this.publishing || this.isPublished) {
      return;
    }

    if (!this.session || !this.session.connection || !this.publisher) {
      console.warn('Cannot publish: session or publisher missing.');
      return;
    }

    console.log('Publishing stream to session...');
    this.publishing = true;

    this.session.publish(this.publisher, (err: any) => {
      this.zone.run(() => {
        this.publishing = false;
        if (err) {
          console.error('Publish Error:', err);
          this.isPublished = false;
        } else {
          console.log('Stream published successfully.');
          this.isPublished = true;
        }
      });
    });
  }

  toggleVideo() {
    if (this.publisher) {
      this.isVideoActive = !this.isVideoActive;
      this.publisher.publishVideo(this.isVideoActive);
    }
  }

  toggleAudio() {
    if (this.publisher) {
      this.isAudioActive = !this.isAudioActive;
      this.publisher.publishAudio(this.isAudioActive);
    }
  }

  emitEndCall() {
    this.endCallRequest.emit();
  }

  toggleScreenShare() {
    if (this.isScreenSharing) {
      this.stopScreenShare();
    } else {
      this.startScreenShare();
    }
  }

  private startScreenShare() {
    this.screenPublisher = OT.initPublisher(undefined, {
      videoSource: 'screen',
      insertMode: 'append',
      width: '100%',
      height: '100%'
    }, (err: any) => {
      if (err) {
        console.error('Screen sharing error:', err);
        return;
      }

      this.session.publish(this.screenPublisher, (pubErr: any) => {
        if (pubErr) {
          console.error('Publish screen error:', pubErr);
        } else {
          this.zone.run(() => this.isScreenSharing = true);
        }
      });
    });

    this.screenPublisher.on('streamDestroyed', (event: any) => {
      if (event.reason === 'clientDisconnected' || event.reason === 'mediaStopped') {
        this.zone.run(() => this.isScreenSharing = false);
      }
    });
  }

  private stopScreenShare() {
    if (this.session && this.screenPublisher) {
      this.session.unpublish(this.screenPublisher);
      this.screenPublisher.destroy();
      this.screenPublisher = null;
      this.isScreenSharing = false;
    }
  }

  ngOnDestroy() {
    if (this.publisher) {
      this.publisher.destroy();
    }
    if (this.screenPublisher) {
      this.screenPublisher.destroy();
    }
  }
}

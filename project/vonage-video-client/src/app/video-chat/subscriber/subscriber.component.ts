import { Component, ElementRef, AfterViewInit, ViewChild, Input, OnDestroy, NgZone, Output, EventEmitter } from '@angular/core';
import * as OT from '@opentok/client';

@Component({
  selector: 'app-subscriber',
  templateUrl: './subscriber.component.html',
  styleUrls: ['./subscriber.component.css']
})
export class SubscriberComponent implements AfterViewInit, OnDestroy {
  @ViewChild('subscriberDiv') subscriberDiv!: ElementRef;
  @Input() session!: any;
  @Input() stream!: any;
  @Input() callerName: string = '';

  private subscriberInstance!: any;

  constructor(private zone: NgZone) { }

  ngAfterViewInit() {
    this.zone.run(() => {
      this.subscriberInstance = this.session.subscribe(
        this.stream,
        this.subscriberDiv.nativeElement,
        {
          insertMode: "append",
          width: "100%",
          height: "100%",
          showControls: true,
        },
        (err: any) => {
          if (err) {
            console.error("OpenTok subscribe error:", err.message || err);
          }
        }
      );
    });
  }

  ngOnDestroy() {
    if (this.subscriberInstance && this.session) {
      this.session.unsubscribe(this.subscriberInstance);
    }
  }
}

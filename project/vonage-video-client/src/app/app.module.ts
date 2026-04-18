import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';

import { FormsModule } from '@angular/forms';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { VideoChatComponent } from './video-chat/video-chat.component';
import { PublisherComponent } from './video-chat/publisher/publisher.component';
import { SubscriberComponent } from './video-chat/subscriber/subscriber.component';

@NgModule({
  declarations: [
    AppComponent,
    VideoChatComponent,
    PublisherComponent,
    SubscriberComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

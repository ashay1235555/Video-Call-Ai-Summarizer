import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject, BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SignalrService {
  private hubConnection?: signalR.HubConnection;
  
  public onlineUsers$ = new BehaviorSubject<string[]>([]);
  public incomingCall$ = new Subject<string>();
  public callAnswered$ = new Subject<{ targetUsername: string, accepted: boolean }>();
  public hangUp$ = new Subject<{ username: string, role: string }>();
  public transcriptReceived$ = new Subject<{ speakerName: string, text: string }>();

  public startConnection(username: string) {
    const normalizedUsername = username.toLowerCase().trim();
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`http://localhost:5000/callHub?username=${normalizedUsername}`)
      .build();

    this.hubConnection
      .start()
      .then(() => console.log('SignalR Connection Started for:', normalizedUsername))
      .catch(err => console.log('Error while starting SignalR connection: ' + err));

    this.hubConnection.on('UpdateUserList', (users: string[]) => {
      this.onlineUsers$.next(users);
    });

    this.hubConnection.on('IncomingCall', (callerUsername: string) => {
      this.incomingCall$.next(callerUsername);
    });

    this.hubConnection.on('CallAnswered', (targetUsername: string, accepted: boolean) => {
      this.callAnswered$.next({ targetUsername, accepted });
    });

    this.hubConnection.on('CallEnded', (username: string, role: string) => {
      this.hangUp$.next({ username, role });
    });

    this.hubConnection.on('ReceiveTranscriptSegment', (speakerName: string, text: string) => {
      this.transcriptReceived$.next({ speakerName, text });
    });
  }

  public sendCall(targetUsername: string, callerUsername: string) {
    // targetUsername is normalized for routing, callerUsername is for display
    this.hubConnection?.invoke('SendCall', targetUsername.toLowerCase().trim(), callerUsername.trim())
      .catch(err => console.error(err));
  }

  public answerCall(callerUsername: string, targetUsername: string, accepted: boolean) {
    this.hubConnection?.invoke('AnswerCall', callerUsername.toLowerCase().trim(), targetUsername.trim(), accepted)
      .catch(err => console.error(err));
  }

  public hangUp(targetUsername: string, callerUsername: string, role: string) {
    this.hubConnection?.invoke('HangUp', targetUsername.toLowerCase().trim(), callerUsername.trim(), role)
      .catch(err => console.error(err));
  }

  public broadcastTranscript(targetUsername: string, text: string, speakerName: string) {
    this.hubConnection?.invoke('SendTranscriptSegment', targetUsername.toLowerCase().trim(), text, speakerName)
      .catch(err => console.error(err));
  }
}

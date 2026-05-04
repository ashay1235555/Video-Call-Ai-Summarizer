import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { VideoService } from '../video.service';
import { SignalrService } from '../signalr.service';
import { TranscriptService } from '../transcript.service';
import { SummaryService, MedicalSummary } from '../summary.service';
import * as OT from '@opentok/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

@Component({
  selector: 'app-video-chat',
  templateUrl: './video-chat.component.html',
  styleUrls: ['./video-chat.component.css']
})
export class VideoChatComponent implements OnInit, OnDestroy {
  session?: any;
  streams: Array<any> = [];
  onlineUsers: string[] = [];
  isRecording: boolean = false;
  archiveId: string | null = null;
  currentSessionId: string | null = null;

  // Transcript State
  transcriptSegments: Array<{ speaker: string, text: string }> = [];
  showCaptions: boolean = true;
  lastCaption: string = '';
  interimCaption: string = '';
  remoteInterimCaption: string = '';
  showTranscript: boolean = false;
  transcriptStatus: string = 'idle';

  // Summary State
  medicalSummary: MedicalSummary | null = null;
  isGeneratingSummary: boolean = false;
  showSummaryCard: boolean = false;

  // SignalR & Call States
  username: string = '';
  userRole: string = 'patient';
  targetUsername: string = '';
  isLoggedIn: boolean = false;
  incomingCall: boolean = false;
  isCalling: boolean = false;
  callerUsername: string = '';

  // UI Display Info
  callerName: string = '';
  callerRole: string = '';
  showEndDialog: boolean = false;
  callDuration: string = '00:00';
  callConnected: boolean = false;
  sessionStatus: string = 'Idle';
  errorMessage: string = '';
  hangUpMessage: string = '';
  private durationInterval: any;
  private durationSeconds: number = 0;
  private joiningRoom: boolean = false;

  constructor(
    private videoService: VideoService,
    private signalrService: SignalrService,
    public transcriptService: TranscriptService,
    private summaryService: SummaryService,
    private zone: NgZone
  ) { }

  ngOnInit() {
    // Listen for incoming calls
    this.signalrService.incomingCall$.subscribe(caller => {
      this.zone.run(() => {
        console.log('Incoming call from:', caller);
        this.callerUsername = caller;
        this.callerName = caller;
        this.callerRole = 'patient'; // Default role for display
        this.incomingCall = true;
        this.hangUpMessage = '';
      });
    });

    // Listen for call responses
    this.signalrService.callAnswered$.subscribe(response => {
      this.zone.run(() => {
        console.log('Call answered by:', response.targetUsername, 'Accepted:', response.accepted);
        if (response.accepted) {
          this.isCalling = false;
          this.joinRoom('default');
        } else {
          alert(`${response.targetUsername} declined the call.`);
          this.isCalling = false;
        }
      });
    });

    // Listen for hang up
    this.signalrService.hangUp$.subscribe(data => {
      this.zone.run(() => {
        console.log('Hang-up received from:', data.username, data.role);
        const capitalizedRole = data.role.charAt(0).toUpperCase() + data.role.slice(1);
        this.hangUpMessage = `${capitalizedRole} ${data.username} disconnected the call`;
        this.autoDisconnect();
      });
    });

    // Listen for online users
    this.signalrService.onlineUsers$.subscribe(users => {
      this.zone.run(() => {
        this.onlineUsers = users.filter(u => u.toLowerCase() !== this.username.toLowerCase());
      });
    });

    // Listen for transcript status
    this.transcriptService.status$.subscribe(status => {
      this.zone.run(() => {
        this.transcriptStatus = status;
        console.log('Transcript Status:', status);
      });
    });

    // --- Transcription Listeners ---
    // 1. Local transcription (Self)
    this.transcriptService.transcript$.subscribe(data => {
      this.zone.run(() => {
        console.log('Local transcript received:', data);

        // Broadcast to partner (both interim and final)
        const target = this.callerUsername || this.targetUsername;
        if (target) {
          this.signalrService.broadcastTranscript(target, data.text, this.username, data.isFinal);
        }

        if (data.isFinal) {
          this.interimCaption = '';
          this.addTranscriptSegment(this.username, data.text);
        } else {
          // New interim speech started, clear the old "static" caption
          if (data.text.length > 0) {
            this.lastCaption = '';
          }
          this.interimCaption = data.text;
        }
      });
    });

    // 2. Remote transcription (Partner)
    this.signalrService.transcriptReceived$.subscribe(data => {
      this.zone.run(() => {
        console.log('Remote transcript received:', data);
        if (data.isFinal) {
          this.remoteInterimCaption = '';
          this.addTranscriptSegment(data.speakerName, data.text);
        } else {
          // Clear old caption when new remote interim arrives
          if (data.text.length > 0) {
            this.lastCaption = '';
          }
          this.remoteInterimCaption = data.text;
        }
      });
    });
  }

  private addTranscriptSegment(speaker: string, text: string) {
    this.transcriptSegments.push({ speaker, text });
    this.lastCaption = text;
    // Auto-clear caption after 10 seconds if no new speech
    setTimeout(() => {
      if (this.lastCaption === text) this.lastCaption = '';
    }, 10000);
  }

  login() {
    if (this.username.trim()) {
      this.signalrService.startConnection(this.username);
      this.isLoggedIn = true;
      console.log('User logged in as:', this.username);
    }
  }

  /* ─── Call Initiation ─── */
  startCall() {
    if (!this.targetUsername.trim()) {
      alert('Please enter a username to call.');
      return;
    }
    if (this.targetUsername.toLowerCase().trim() === this.username.toLowerCase().trim()) {
      alert('You cannot call yourself. Please log in as a different user in another tab/browser.');
      return;
    }
    this.isCalling = true;
    this.callerName = this.targetUsername;
    this.hangUpMessage = '';
    console.log('Initiating call to:', this.targetUsername);
    this.signalrService.sendCall(this.targetUsername, this.username);
  }

  /* ─── Incoming Call Actions ─── */
  acceptCall() {
    this.incomingCall = false;
    this.signalrService.answerCall(this.callerUsername, this.username, true);
    this.joinRoom('default');
  }

  declineCall() {
    this.incomingCall = false;
    this.signalrService.answerCall(this.callerUsername, this.username, false);
    this.hangUpMessage = 'Call declined';
    setTimeout(() => this.hangUpMessage = '', 3000);
  }

  cancelCall() {
    this.isCalling = false;
    if (this.targetUsername) {
      this.signalrService.hangUp(this.targetUsername, this.username, this.userRole);
    }
    this.hangUpMessage = 'Call cancelled';
    setTimeout(() => this.hangUpMessage = '', 3000);
  }

  /* ─── Room Join ─── */
  async joinRoom(roomName: string) {
    if (this.joiningRoom || (this.session && this.session.connection)) {
      console.log('Already in a room or joining middle of a join process.');
      return;
    }

    try {
      this.joiningRoom = true;
      console.log('Joining room:', roomName);
      this.sessionStatus = 'Fetching credentials...';
      const credentials = await this.videoService.getSessionCredentials(roomName);
      console.log('Credentials received for session:', credentials.sessionId);

      if (this.session) {
        console.warn('Session already exists, disconnecting before new join.');
        this.session.disconnect();
      }

      this.currentSessionId = credentials.sessionId;
      this.session = OT.initSession(credentials.applicationId, credentials.sessionId);
      this.sessionStatus = 'Connecting...';

      this.session.on('streamCreated', (event: any) => {
        console.log('Stream created event received:', event.stream.streamId);
        this.handleRemoteStream(event.stream);
      });

      this.session.on('streamDestroyed', (event: any) => {
        console.log('Stream destroyed:', event.stream.streamId);
        this.zone.run(() => {
          const idx = this.streams.indexOf(event.stream);
          if (idx > -1) this.streams.splice(idx, 1);
        });
      });

      // BACKUP: If the other user leaves the session entirely
      this.session.on('connectionDestroyed', (event: any) => {
        console.log('Connection destroyed:', event.connection.connectionId);
        if (this.session && this.session.connection && event.connection.connectionId !== this.session.connection.connectionId) {
          this.zone.run(() => {
            console.log('Remote user left the session. Disconnecting locally...');
            if (!this.hangUpMessage) {
              this.hangUpMessage = `${this.callerName} disconnected the call`;
            }
            this.autoDisconnect();
          });
        }
      });

      this.session.connect(credentials.token, (err: any) => {
        this.zone.run(() => {
          if (err) {
            console.error('Connection Error:', err);
            this.sessionStatus = 'Connection failed';
            this.errorMessage = err.message || 'Failed to connect to video session';
          } else {
            console.log('Connected to session successfully');
            this.sessionStatus = 'Connected';
            this.transcriptService.start(); // Start transcription

            // Catch-up: Check for any existing streams already in the session
            if (this.session && this.session.streams) {
              const streamsAttr = this.session.streams;
              // OpenTok SDK collections might store models in an array or be a function-based collection
              const streamList = Array.isArray(streamsAttr) ? streamsAttr : (streamsAttr.models || []);
              console.log(`Found ${streamList.length} initial streams detected.`);
              streamList.forEach((stream: any) => {
                this.handleRemoteStream(stream);
              });
            }
          }
          this.joiningRoom = false;
        });
      });
    } catch (err: any) {
      this.zone.run(() => {
        console.error('Failed to join room', err);
        this.sessionStatus = 'Setup failed';
        this.errorMessage = err.message || 'Failed to initialize session';
        this.joiningRoom = false;
      });
    }
  }

  private handleRemoteStream(stream: any) {
    if (!stream || !stream.connection) {
      console.log('Stream or connection not yet ready, skipping handleRemoteStream.');
      return;
    }

    // Safety: If session.connection is not yet set, we treat it as remote (can't be local yet)
    const isLocal = this.session && this.session.connection &&
      stream.connection.connectionId === this.session.connection.connectionId;

    if (!isLocal) {
      this.zone.run(() => {
        console.log('Evaluating remote stream:', stream.streamId);
        // Check if already added to prevent duplicates
        const alreadyExists = this.streams.some(s => s.streamId === stream.streamId);
        if (!alreadyExists) {
          this.streams.push(stream);
          console.log('Remote stream added to streams array. Total:', this.streams.length);
          if (!this.callConnected) {
            this.callConnected = true;
            this.startDurationTimer();
          }
        } else {
          console.log('Stream already known, skipping duplicate.');
        }
      });
    } else {
      console.log('Ignoring local stream:', stream.streamId);
    }
  }

  /* ─── End Call Dialog ─── */
  requestEndCall() {
    this.showEndDialog = true;
  }

  cancelEnd() {
    this.showEndDialog = false;
  }

  confirmEnd() {
    this.showEndDialog = false;
    const target = this.callerUsername || this.targetUsername;

    // Force-broadcast last interim before hanging up
    if (this.interimCaption && this.interimCaption.trim().length > 0) {
      if (target) {
        this.signalrService.broadcastTranscript(target, this.interimCaption, this.username, true);
      }
    }

    if (target) {
      this.signalrService.hangUp(target, this.username, this.userRole);
    }
    this.hangUpMessage = 'You ended the call';
    this.autoDisconnect();
  }

  private autoDisconnect() {
    this.disconnectLocal();
    // Clear hangUpMessage after some time
    setTimeout(() => {
      this.zone.run(() => this.hangUpMessage = '');
    }, 5000);
  }

  private disconnectLocal() {
    this.stopDurationTimer();
    this.callConnected = false;

    // Force-save any remaining interim speech before stopping
    if (this.interimCaption && this.interimCaption.trim().length > 0) {
      console.log('Force-finalizing interim speech on disconnect:', this.interimCaption);
      this.addTranscriptSegment(this.username, this.interimCaption);
      this.interimCaption = '';
    }

    if (this.session) {
      this.transcriptService.stop(); // Stop transcription
      this.session.disconnect();
      this.session = undefined;
      this.streams = [];
    }
  }

  getInitials(name: string): string {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  toggleTranscript() {
    this.showTranscript = !this.showTranscript;
  }

  restartTranscript() {
    this.transcriptService.stop();
    setTimeout(() => {
      this.transcriptService.start();
    }, 100);
  }

  /* ─── Recording ─── */
  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  private async startRecording() {
    if (!this.currentSessionId) return;
    try {
      this.archiveId = await this.videoService.startRecording(this.currentSessionId);
      this.isRecording = true;
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  private async stopRecording() {
    if (!this.archiveId) return;
    try {
      await this.videoService.stopRecording(this.archiveId);
      this.isRecording = false;
      this.archiveId = null;
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  }

  /* ─── Duration Timer ─── */
  private startDurationTimer() {
    this.durationSeconds = 0;
    this.durationInterval = setInterval(() => {
      this.durationSeconds++;
      const m = Math.floor(this.durationSeconds / 60).toString().padStart(2, '0');
      const s = (this.durationSeconds % 60).toString().padStart(2, '0');
      this.callDuration = `${m}:${s}`;
    }, 1000);
  }

  private stopDurationTimer() {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    this.durationSeconds = 0;
    this.callDuration = '00:00';
  }

  /* ─── Summary Generation ─── */
  async generateSummary() {
    if (this.transcriptSegments.length === 0) {
      alert('No conversation captured to summarize.');
      return;
    }

    this.isGeneratingSummary = true;
    this.showSummaryCard = true; // Show it early with a loading state

    const fullTranscript = this.transcriptSegments
      .map(s => `${s.speaker}: ${s.text}`)
      .join('\n');

    this.summaryService.generateSummary(fullTranscript).subscribe({
      next: (summary) => {
        this.zone.run(() => {
          console.log('Summary received:', summary);
          // Handle cases where backend might return a string instead of object
          if (typeof summary === 'string') {
            try {
              this.medicalSummary = JSON.parse(summary);
            } catch (e) {
              console.error('Failed to parse summary string:', e);
              this.errorMessage = 'Summary received in invalid format.';
            }
          } else {
            this.medicalSummary = summary;
          }
          this.isGeneratingSummary = false;
        });
      },
      error: (err) => {
        this.zone.run(() => {
          console.error('Summary generation failed', err);
          this.errorMessage = 'Failed to generate AI summary. Please try again.';
          this.isGeneratingSummary = false;
        });
      }
    });
  }

  closeSummary() {
    this.showSummaryCard = false;
    this.medicalSummary = null;
  }

  downloadPDF() {
    console.log('Initiating PDF download...');

    // We allow download even if medicalSummary is null by using defaults
    const summary = this.medicalSummary || {
      diagnosis: 'No diagnosis recorded',
      symptoms: [],
      medications: [],
      advice: [],
      follow_up: 'Not specified',
      duration: this.callDuration
    };

    console.log('Using summary data for PDF:', summary);

    const doc = new jsPDF();
    const timestamp = new Date().toLocaleString();
    const filename = `Medical_Summary_${new Date().getTime()}.pdf`;

    // Header
    doc.setFontSize(22);
    doc.setTextColor(44, 62, 80); // Dark Blue
    doc.text('Medical Encounter Summary', 14, 22);

    doc.setFontSize(10);
    doc.setTextColor(127, 140, 141); // Gray
    doc.text(`Generated on: ${timestamp}`, 14, 30);
    doc.text(`Doctor: ${this.userRole === 'provider' ? this.username : this.callerName}`, 14, 35);
    doc.text(`Patient: ${this.userRole === 'patient' ? this.username : this.callerName}`, 14, 40);
    doc.text(`Duration: ${summary.duration || this.callDuration}`, 14, 45);

    doc.setLineWidth(0.5);
    doc.setDrawColor(52, 152, 219); // Blue
    doc.line(14, 50, 196, 50);

    // Diagnosis Section
    doc.setFontSize(14);
    doc.setTextColor(44, 62, 80);
    doc.text('Clinical Diagnosis', 14, 60);
    doc.setFontSize(12);
    doc.setTextColor(52, 73, 94);
    doc.text(summary.diagnosis || 'N/A', 14, 67);

    // Details Table
    const tableData = [
      ['Symptoms', (summary.symptoms || []).join(', ') || 'None reported'],
      ['Medications', (summary.medications || []).join(', ') || 'None prescribed'],
      ['Doctor\'s Advice', (summary.advice || []).join('\n') || 'N/A'],
      ['Follow-up', summary.follow_up || 'Not specified']
    ];

    autoTable(doc, {
      startY: 75,
      head: [['Category', 'Details']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [52, 152, 219] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { cellWidth: 'auto' }
      },
      margin: { top: 75 }
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(150);
      const str = `Page ${i} of ${pageCount}`;
      doc.text(str, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
      doc.text('CONFIDENTIAL MEDICAL RECORD', 14, doc.internal.pageSize.getHeight() - 10);
    }

    doc.save(filename);
  }

  ngOnDestroy() {
    this.stopDurationTimer();
    if (this.session) this.session.disconnect();
  }
}

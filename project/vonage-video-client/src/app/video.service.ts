import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import * as OT from '@opentok/client';

export interface VonageSessionCredentials {
    applicationId: string;
    sessionId: string;
    token: string;
}

@Injectable({
    providedIn: 'root'
})
export class VideoService {
    private apiUrl = 'http://localhost:5000/api/video'; // Use HTTP port for local development

    constructor(private http: HttpClient) { }

    async getSessionCredentials(roomName: string = 'default'): Promise<VonageSessionCredentials> {
        return await lastValueFrom(this.http.post<VonageSessionCredentials>(`${this.apiUrl}/session`, { roomName }));
    }

    async startRecording(sessionId: string): Promise<string> {
        const response = await lastValueFrom(this.http.post<{ archiveId: string }>(`${this.apiUrl}/start-recording`, { sessionId }));
        return response.archiveId;
    }

    async stopRecording(archiveId: string): Promise<void> {
        await lastValueFrom(this.http.post(`${this.apiUrl}/stop-recording`, { archiveId }));
    }

    initSession(credentials: VonageSessionCredentials): any {
        return OT.initSession(credentials.applicationId, credentials.sessionId);
    }
}

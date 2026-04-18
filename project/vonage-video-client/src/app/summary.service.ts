import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface MedicalSummary {
  symptoms: string[];
  duration: string;
  diagnosis: string;
  medications: string[];
  advice: string[];
  follow_up: string;
}

@Injectable({
  providedIn: 'root'
})
export class SummaryService {
  private apiUrl = 'http://localhost:5000/api/summary';

  constructor(private http: HttpClient) { }

  generateSummary(fullTranscript: string): Observable<MedicalSummary> {
    return this.http.post<MedicalSummary>(`${this.apiUrl}/generate`, { fullTranscript });
  }
}

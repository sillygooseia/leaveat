import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { LicenseService } from './license.service';
import { Schedule, ActivityEvent } from '../models';

export interface RegistrationEntry {
  inviteId: string;
  memberName: string;
  inviteCreatedAt: string;
  expiresAt: string;
  status: 'pending' | 'registered' | 'revoked' | 'expired';
  tokenId: string | null;
  registeredAt: string | null;
  lastAccessedAt: string | null;
}

export interface MyScheduleData {
  scheduleData: Schedule;
  scheduleName: string;
  mode: 'workplace' | 'family' | 'personal';
  visibility: 'own' | 'all';
  memberName: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class RegisteredAccessService {

  constructor(
    private http: HttpClient,
    private licenseService: LicenseService
  ) {}

  // ─── Admin calls ──────────────────────────────────────────────────────────

  /** Upsert a published workspace snapshot. Returns the workspaceId. */
  async publishWorkspace(
    scheduleId: string,
    snapshot: Schedule,
    mode: 'workplace' | 'family' | 'personal',
    visibility: 'own' | 'all'
  ): Promise<{ workspaceId: string; updatedAt: string }> {
    return firstValueFrom(
      this.http.post<{ workspaceId: string; updatedAt: string }>(
        '/api/workspace/publish',
        { scheduleId, snapshot, mode, visibility },
        { headers: this.authHeaders() }
      )
    );
  }

  /** Create a one-time invite link for a named member. */
  async createInvite(
    workspaceId: string,
    memberName: string
  ): Promise<{ inviteId: string; inviteUrl: string }> {
    return firstValueFrom(
      this.http.post<{ inviteId: string; inviteUrl: string }>(
        `/api/workspace/${workspaceId}/invite`,
        { memberName },
        { headers: this.authHeaders() }
      )
    );
  }

  /** List all registrations (invites + tokens) for a workspace. */
  async getRegistrations(workspaceId: string): Promise<RegistrationEntry[]> {
    const result = await firstValueFrom(
      this.http.get<{ registrations: RegistrationEntry[] }>(
        `/api/workspace/${workspaceId}/registrations`,
        { headers: this.authHeaders() }
      )
    );
    return result.registrations;
  }

  /** Revoke a registered device. */
  async revokeDevice(tokenId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<{ ok: boolean }>(
        `/api/workspace/registration/${tokenId}`,
        { headers: this.authHeaders() }
      )
    );
  }

  // ─── Member calls (no admin auth) ────────────────────────────────────────

  /** Preview invite metadata without consuming it. */
  async getInvitePreview(inviteId: string): Promise<{
    workspaceName: string;
    memberName: string;
    mode: 'workplace' | 'family' | 'personal';
    visibility: 'own' | 'all';
  }> {
    return firstValueFrom(
      this.http.get<{
        workspaceName: string;
        memberName: string;
        mode: 'workplace' | 'family' | 'personal';
        visibility: 'own' | 'all';
      }>(`/api/workspace/invite/${inviteId}/preview`)
    );
  }

  /** Claim a one-time invite and mint an access token on this device. */
  async claimInvite(inviteId: string): Promise<{
    accessTokenId: string;
    workspaceName: string;
    memberName: string;
    mode: 'workplace' | 'family' | 'personal';
    visibility: 'own' | 'all';
  }> {
    return firstValueFrom(
      this.http.post<{
        accessTokenId: string;
        workspaceName: string;
        memberName: string;
        mode: 'workplace' | 'family' | 'personal';
        visibility: 'own' | 'all';
      }>(`/api/workspace/register/${inviteId}`, {})
    );
  }

  /** Fetch the latest schedule for a registered device. */
  async getMySchedule(accessTokenId: string): Promise<MyScheduleData> {
    return firstValueFrom(
      this.http.get<MyScheduleData>(`/api/workspace/view/${accessTokenId}`)
    );
  }

  /** Full join URL for sharing with members. */
  getJoinUrl(inviteId: string): string {
    return `${window.location.origin}/join/${inviteId}`;
  }

  // ─── Activity Events (admin) ──────────────────────────────────────────────

  /** Create an activity event in a workspace. */
  async createEvent(workspaceId: string, event: {
    title: string;
    activityType?: string;
    location?: string;
    startAt: string;
    endAt: string;
    participants?: string[];
    notes?: string;
    slots?: { id: string; label: string }[];
  }): Promise<ActivityEvent> {
    const result = await firstValueFrom(
      this.http.post<{ event: ActivityEvent }>(
        `/api/workspace/${workspaceId}/events`,
        event,
        { headers: this.authHeaders() }
      )
    );
    return result.event;
  }

  /** List all activity events for an admin workspace. */
  async getEvents(workspaceId: string): Promise<ActivityEvent[]> {
    const result = await firstValueFrom(
      this.http.get<{ events: ActivityEvent[] }>(
        `/api/workspace/${workspaceId}/events`,
        { headers: this.authHeaders() }
      )
    );
    return result.events;
  }

  /** Update an activity event. */
  async updateEvent(workspaceId: string, eventId: string, changes: Partial<{
    title: string;
    activityType: string;
    location: string;
    startAt: string;
    endAt: string;
    participants: string[];
    notes: string;
    slots: { id: string; label: string }[];
  }>): Promise<ActivityEvent> {
    const result = await firstValueFrom(
      this.http.put<{ event: ActivityEvent }>(
        `/api/workspace/${workspaceId}/events/${eventId}`,
        changes,
        { headers: this.authHeaders() }
      )
    );
    return result.event;
  }

  /** Delete an activity event. */
  async deleteEvent(workspaceId: string, eventId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<{ ok: boolean }>(
        `/api/workspace/${workspaceId}/events/${eventId}`,
        { headers: this.authHeaders() }
      )
    );
  }

  // ─── Activity Events (member device) ─────────────────────────────────────

  /** Fetch activity events for a registered device. */
  async getMemberEvents(accessTokenId: string): Promise<{ events: ActivityEvent[]; memberName: string }> {
    return firstValueFrom(
      this.http.get<{ events: ActivityEvent[]; memberName: string }>(
        `/api/workspace/view/${accessTokenId}/events`
      )
    );
  }

  /** Claim a volunteer slot on an event. */
  async claimEventSlot(eventId: string, accessTokenId: string, slotId: string): Promise<ActivityEvent> {
    const result = await firstValueFrom(
      this.http.post<{ event: ActivityEvent }>(
        `/api/events/${eventId}/claim`,
        { accessTokenId, slotId }
      )
    );
    return result.event;
  }

  /** Unclaim a volunteer slot on an event. */
  async unclaimEventSlot(eventId: string, accessTokenId: string, slotId: string): Promise<ActivityEvent> {
    const result = await firstValueFrom(
      this.http.request<{ event: ActivityEvent }>(
        'DELETE',
        `/api/events/${eventId}/claim`,
        { body: { accessTokenId, slotId } }
      )
    );
    return result.event;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private authHeaders(): HttpHeaders {
    const token = this.licenseService.token();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

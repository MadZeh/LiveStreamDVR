export interface Condition {
    broadcaster_user_id: string;
}

export interface Transport {
    method: "webhook";
    callback: string;
    secret?: string;
}

export interface Subscription {
    id: string;
    type: EventSubTypes;
    version: string;
    status: EventSubStatus;
    cost: number;
    condition: Condition;
    transport: Transport;
    created_at: string;
}

export interface Pagination {
    cursor?: string;
}

export interface ErrorResponse {
    error: "Unauthorized";
    status: number;
    "message": "Invalid OAuth token";
}

export type EventSubStatus = 
    "enabled" |
    "webhook_callback_verification_pending" |
    "webhook_callback_verification_failed" |
    "notification_failures_exceeded" |
    "authorization_revoked" |
    "user_removed"
;

export type EventSubTypes = "channel.update" | "stream.offline" | "stream.online";

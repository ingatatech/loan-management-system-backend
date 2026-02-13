import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";
import { Organization } from "./Organization";

export enum SecurityEventType {
  BRUTE_FORCE_ATTEMPT = "brute_force_attempt",
  SUSPICIOUS_LOGIN = "suspicious_login",
  LOGIN_FROM_NEW_DEVICE = "login_from_new_device",
  LOGIN_FROM_NEW_LOCATION = "login_from_new_location",
  MULTIPLE_FAILED_LOGINS = "multiple_failed_logins",
  ACCOUNT_LOCKED = "account_locked",
  ACCOUNT_UNLOCKED = "account_unlocked",
  
  // Authorization
  UNAUTHORIZED_ACCESS_ATTEMPT = "unauthorized_access_attempt",
  PERMISSION_CHANGE = "permission_change",
  ROLE_CHANGE = "role_change",
  
  // Data access
  SENSITIVE_DATA_ACCESS = "sensitive_data_access",
  BULK_DATA_EXPORT = "bulk_data_export",
  DATA_MODIFICATION = "data_modification",
  
  // API Security
  API_KEY_USAGE = "api_key_usage",
  INVALID_API_KEY = "invalid_api_key",
  RATE_LIMIT_EXCEEDED = "rate_limit_exceeded",
  
  // Session management
  SESSION_CREATED = "session_created",
  SESSION_EXPIRED = "session_expired",
  SESSION_TERMINATED = "session_terminated",
  CONCURRENT_SESSIONS = "concurrent_sessions",
  
  // System security
  FIREWALL_ALERT = "firewall_alert",
  INTRUSION_DETECTED = "intrusion_detected",
  MALWARE_DETECTED = "malware_detected",
  VULNERABILITY_DETECTED = "vulnerability_detected",
  
  // Compliance
  COMPLIANCE_VIOLATION = "compliance_violation",
  DATA_RETENTION_VIOLATION = "data_retention_violation",
  PRIVACY_VIOLATION = "privacy_violation"
}

export enum SecurityEventSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info"
}

export enum SecurityEventStatus {
  NEW = "new",
  INVESTIGATING = "investigating",
  CONFIRMED = "confirmed",
  FALSE_POSITIVE = "false_positive",
  RESOLVED = "resolved",
  IGNORED = "ignored"
}

@Entity("security_events")
@Index(["organizationId", "createdAt"])
@Index(["type", "severity"])
@Index(["status"])
export class SecurityEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "enum",
    enum: SecurityEventType
  })
  type: SecurityEventType;

  @Column({
    type: "enum",
    enum: SecurityEventSeverity,
    default: SecurityEventSeverity.INFO
  })
  severity: SecurityEventSeverity;

  @Column({
    type: "enum",
    enum: SecurityEventStatus,
    default: SecurityEventStatus.NEW
  })
  status: SecurityEventStatus;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "jsonb", nullable: true })
  source: {
    ip: string;
    location?: string;
    device?: string;
    browser?: string;
    os?: string;
  } | null;

  @Column({ type: "jsonb", nullable: true })
  details: Record<string, any> | null;

  @Column({ type: "int", nullable: true })
  count: number;

  @Column({ type: "boolean", default: false })
  isResolved: boolean;

  @Column({ type: "timestamp", nullable: true })
  resolvedAt: Date | null;

  @Column({ type: "int", nullable: true })
  resolvedBy: number | null;

  @Column({ type: "text", nullable: true })
  resolution: string | null;

  @Column({ type: "jsonb", nullable: true })
  actions: Array<{
    type: string;
    description: string;
    performedAt: Date;
    performedBy: number;
  }> | null;

  @Column({ type: "jsonb", nullable: true })
  tags: string[] | null;

  @Column({ type: "int", nullable: true })
  userId: number | null;

  @Column({ type: "int", nullable: true })
  organizationId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "userId" })
  user: User | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: "organizationId" })
  organization: Organization | null;
}
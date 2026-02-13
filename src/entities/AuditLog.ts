import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Organization } from "./Organization";

export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = "login_success",
  LOGIN_FAILED = "login_failed",
  LOGOUT = "logout",
  PASSWORD_CHANGE = "password_change",
  PASSWORD_RESET = "password_reset",
  PASSWORD_RESET_REQUEST = "password_reset_request",
  
  // User management
  USER_CREATED = "user_created",
  USER_UPDATED = "user_updated",
  USER_DELETED = "user_deleted",
  USER_ACTIVATED = "user_activated",
  USER_DEACTIVATED = "user_deactivated",
  USER_ROLE_CHANGED = "user_role_changed",
  
  // Organization management
  ORG_CREATED = "org_created",
  ORG_UPDATED = "org_updated",
  ORG_DELETED = "org_deleted",
  
  // Loan operations
  LOAN_CREATED = "loan_created",
  LOAN_UPDATED = "loan_updated",
  LOAN_APPROVED = "loan_approved",
  LOAN_REJECTED = "loan_rejected",
  LOAN_DISBURSED = "loan_disbursed",
  LOAN_STATUS_CHANGED = "loan_status_changed",
  
  // Borrower operations
  BORROWER_CREATED = "borrower_created",
  BORROWER_UPDATED = "borrower_updated",
  BORROWER_DELETED = "borrower_deleted",
  
  // Payment operations
  PAYMENT_MADE = "payment_made",
  PAYMENT_REVERSED = "payment_reversed",
  PAYMENT_APPROVED = "payment_approved",
  
  // Security events
  MFA_ENABLED = "mfa_enabled",
  MFA_DISABLED = "mfa_disabled",
  MFA_VERIFIED = "mfa_verified",
  API_KEY_CREATED = "api_key_created",
  API_KEY_REVOKED = "api_key_revoked",
  
  // Data exports
  DATA_EXPORTED = "data_exported",
  REPORT_GENERATED = "report_generated",
  
  // System events
  SYSTEM_CONFIG_CHANGED = "system_config_changed",
  BACKUP_CREATED = "backup_created",
  BACKUP_RESTORED = "backup_restored"
}

export enum AuditResource {
  USER = "user",
  ORGANIZATION = "organization",
  LOAN = "loan",
  BORROWER = "borrower",
  PAYMENT = "payment",
  REPORT = "report",
  CONFIG = "config",
  API_KEY = "api_key",
  SECURITY = "security",
  SYSTEM = "system"
}

export enum AuditStatus {
  SUCCESS = "success",
  FAILURE = "failure",
  PENDING = "pending",
  BLOCKED = "blocked"
}

@Entity("audit_logs")
@Index(["organizationId", "createdAt"])
@Index(["userId", "createdAt"])
@Index(["action", "createdAt"])
@Index(["resource", "resourceId"])
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: "enum",
    enum: AuditAction
  })
  action: AuditAction;

  @Column({
    type: "enum",
    enum: AuditResource
  })
  resource: AuditResource;

  @Column({ type: "varchar", length: 100, nullable: true })
  resourceId: string | null;

  @Column({
    type: "enum",
    enum: AuditStatus,
    default: AuditStatus.SUCCESS
  })
  status: AuditStatus;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "inet", nullable: true })
  ipAddress: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  sessionId: string | null;

  @Column({ type: "jsonb", nullable: true })
  requestData: Record<string, any> | null;

  @Column({ type: "jsonb", nullable: true })
  responseData: Record<string, any> | null;

  @Column({ type: "int", nullable: true })
  responseTime: number | null;

  @Column({ type: "int", nullable: true })
  userId: number | null;

  @Column({ type: "int", nullable: true })
  organizationId: number | null;

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "userId" })
  user: User | null;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: "organizationId" })
  organization: Organization | null;
}
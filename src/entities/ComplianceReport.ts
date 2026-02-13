import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./User";
import { Organization } from "./Organization";

export enum ComplianceType {
  AML = "aml",
  KYC = "kyc", 
  GDPR = "gdpr",
  PCI_DSS = "pci_dss",
  SOX = "sox",
  BASEL = "basel",
  
  FINANCIAL_AUDIT = "financial_audit",
  TAX_COMPLIANCE = "tax_compliance",
  INTERNAL_AUDIT = "internal_audit",
  
  DATA_RETENTION = "data_retention",
  ACCESS_CONTROL = "access_control",
  DISASTER_RECOVERY = "disaster_recovery",
  BUSINESS_CONTINUITY = "business_continuity",
  
  SECURITY_AUDIT = "security_audit",
  PENETRATION_TEST = "penetration_test",
  VULNERABILITY_SCAN = "vulnerability_scan",
  
  CUSTOM = "custom"
}

export enum ComplianceStatus {
  DRAFT = "draft",
  GENERATING = "generating",
  COMPLETED = "completed",
  FAILED = "failed",
  ARCHIVED = "archived",
  REVIEWED = "reviewed",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export enum ComplianceSeverity {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
  INFO = "info"
}

export interface ComplianceFinding {
  id: string;
  type: string;
  severity: ComplianceSeverity;
  title: string;
  description: string;
  recommendation: string;
  affectedItems: string[];
  status: 'open' | 'in_progress' | 'resolved' | 'waived';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: number;
  notes?: string;
}

export interface ComplianceMetric {
  name: string;
  value: number;
  target: number;
  unit: string;
  status: 'met' | 'partial' | 'not_met' | 'critical';
  trend: number;
}

export interface ComplianceSection {
  id: string;
  title: string;
  description: string;
  status: 'passed' | 'failed' | 'partial' | 'not_applicable';
  findings: ComplianceFinding[];
  score: number;
  weight: number;
}

@Entity("compliance_reports")
@Index(["organizationId", "createdAt"])
@Index(["type", "status"])
@Index(["reportDate"])
export class ComplianceReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 100, unique: true })
  reportId: string;

  @Column({
    type: "enum",
    enum: ComplianceType
  })
  type: ComplianceType;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({
    type: "enum",
    enum: ComplianceStatus,
    default: ComplianceStatus.DRAFT
  })
  status: ComplianceStatus;

  @Column({ type: "date" })
  reportDate: Date;

  @Column({ type: "date", nullable: true })
  periodStart: Date | null;

  @Column({ type: "date", nullable: true })
  periodEnd: Date | null;

  @Column({ type: "date", nullable: true })
  dueDate: Date | null;

  @Column({ type: "int", default: 0 })
  overallScore: number;

  @Column({ type: "jsonb", nullable: true })
  sections: ComplianceSection[] | null;

  @Column({ type: "jsonb", nullable: true })
  metrics: ComplianceMetric[] | null;

  @Column({ type: "jsonb", nullable: true })
  findings: ComplianceFinding[] | null;

  @Column({ type: "jsonb", nullable: true })
  executiveSummary: Record<string, any> | null;

  @Column({ type: "jsonb", nullable: true })
  recommendations: string[] | null;

  @Column({ type: "jsonb", nullable: true })
  remediationPlan: {
    critical: string[];
    high: string[];
    medium: string[];
    low: string[];
    timeline: string;
    owner: string;
  } | null;

  @Column({ type: "text", nullable: true })
  reportUrl: string | null;

  @Column({ type: "jsonb", nullable: true })
  attachments: Array<{
    name: string;
    url: string;
    type: string;
    size: number;
    uploadedAt: Date;
  }> | null;

  @Column({ type: "jsonb", nullable: true })
  approvers: Array<{
    userId: number;
    name: string;
    role: string;
    approvedAt: Date;
    comments: string;
  }> | null;

  @Column({ type: "boolean", default: false })
  isArchived: boolean;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @ManyToOne(() => Organization)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "createdBy" })
  creator: User | null;
}
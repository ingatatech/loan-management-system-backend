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
import { Organization } from "./Organization";
import * as bcrypt from "bcryptjs";

export enum UserRole {
  SYSTEM_OWNER = "system_owner",
  CLIENT = "client",
  MANAGER = "manager",
  LOAN_OFFICER = "loan_officer",
  BOARD_DIRECTOR = "board_director",
  SENIOR_MANAGER = "senior_manager",
  MANAGING_DIRECTOR = "managing_director",
  STAFF = "staff",
  AUDITOR = "auditor",
  SUPPORT = "support",
  BUSINESS_OFFICER = "business_officer",
  CREDIT_OFFICER = "credit_officer",
  FINANCE_OFFICER = "finance_officer",
}
@Entity("users")
@Index(["email", "organization"], { unique: true })
@Index(["username", "organization"], { unique: true })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  username: string;

  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ type: "varchar", length: 255, select: false })
  hashedPassword: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.CLIENT,
  })
  role: UserRole;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone: string | null;

  @ManyToOne(() => Organization, (organization) => organization.users, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization | null;
  @Column({ type: "varchar", length: 255, nullable: true })
  branch: string | null
  @Column({ name: "organization_id", nullable: true })
  organizationId: number | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "boolean", default: false })
  isVerified: boolean;

  @Column({ type: "boolean", default: true })
  isFirstLogin: boolean;

  @Column({ type: "int", default: 0 })
  failedLoginAttempts: number;

  @Column({ type: "timestamp", nullable: true })
  accountLockedUntil: Date | null;

  @Column({ type: "timestamp", nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  resetPasswordToken: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  firstName: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  lastName: string | null;

  @Column({ type: "timestamp", nullable: true })
  resetPasswordExpires: Date | null;

  @Column({ type: "boolean", default: false })
  is2FAEnabled: boolean;

  @Column({ type: "int", default: 0 })
  otpAttempts: number;

  @Column({ type: "varchar", length: 20, nullable: true })
  telephone: string | null;
  @Column({ type:"varchar", nullable: true })
  otpLockUntil: any
  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  async validatePassword(password: string): Promise<boolean> {
    if (!this.hashedPassword || !password) {
      return false;
    }
    return bcrypt.compare(password, this.hashedPassword);
  }

  isAccountLocked(): boolean {
    return !!(this.accountLockedUntil && this.accountLockedUntil > new Date());
  }

  async incrementFailedLoginAttempts(): Promise<void> {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
      this.accountLockedUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
  }

  async resetFailedLoginAttempts(): Promise<void> {
    this.failedLoginAttempts = 0;
    this.accountLockedUntil = null;
    this.lastLoginAt = new Date();
  }

  async setPassword(password: string): Promise<void> {
    if (!password) {
      throw new Error('Password cannot be empty');
    }
    this.hashedPassword = await bcrypt.hash(password, 12);
  }
}
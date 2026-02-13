import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

export enum DemoRequestStatus {
  PENDING = "pending",
  CONTACTED = "contacted",
  COMPLETED = "completed",
  SPAM = "spam"
}

@Entity("demo_requests")
@Index(["email"])
@Index(["status"])
@Index(["createdAt"])
export class DemoRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  institutionName: string;

  @Column({ type: "varchar", length: 100 })
  institutionType: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  portfolioSize: string;

  @Column({ type: "varchar", length: 255 })
  fullName: string;

  @Column({ type: "varchar", length: 255 })
  jobTitle: string;

  @Column({ type: "varchar", length: 255 })
  email: string;

  @Column({ type: "varchar", length: 50 })
  phone: string;

  @Column({ type: "jsonb", nullable: true })
  interests: string[];

  @Column({
    type: "enum",
    enum: DemoRequestStatus,
    default: DemoRequestStatus.PENDING
  })
  status: DemoRequestStatus;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "timestamp", nullable: true })
  contactedAt: Date | null;

  @Column({ type: "int", nullable: true })
  contactedBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
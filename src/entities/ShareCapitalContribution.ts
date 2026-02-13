// @ts-nocheck
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate
} from "typeorm";
import { ShareCapital } from "./ShareCapital";

export enum ShareType {
  ORDINARY = "ordinary",
  PREFERENCE = "preference",
  CUMULATIVE_PREFERENCE = "cumulative_preference",
  REDEEMABLE = "redeemable",
  OTHER = "other"
}

export interface PaymentDetails {
  paymentMethod: string;
  paymentDate: Date;
  paymentReference: string;
  bankName?: string | null;
  accountNumber?: string | null;
  chequeNumber?: string | null;
  transactionId?: string | null;
  paymentProofUrl?: string | null;
}

@Entity("share_capital_contributions")
export class ShareCapitalContribution {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ShareCapital, (shareCapital) => shareCapital.contributions, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "share_capital_id" })
  shareCapital: ShareCapital;

  

  @Column({ name: "share_capital_id" })
  shareCapitalId: number;

  @Column({ type: "date" })
  contributionDate: Date;

  @Column({
    type: "enum",
    enum: ShareType,
    default: ShareType.ORDINARY,
  })
  shareType: ShareType;

  @Column({ type: "integer" })
  numberOfShares: number;

  @Column({ type: "decimal", precision: 20, scale: 2 })
  valuePerShare: number;

  @Column({ type: "decimal", precision: 20, scale: 2 })
  totalValue: number;

  @Column("jsonb", { nullable: false })
  paymentDetails: PaymentDetails;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column({ type: "boolean", default: false })
  isVerified: boolean;

  @Column({ type: "int", nullable: true })
  recordedBy: number | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  recordedByName: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @BeforeInsert()
  @BeforeUpdate()
  calculateTotalValue() {
    this.numberOfShares = Math.floor(Number(this.numberOfShares) || 0);
    this.valuePerShare = Number(Number(this.valuePerShare).toFixed(2));
    const total = this.numberOfShares * this.valuePerShare;
    this.totalValue = Number(total.toFixed(2));
  }

  getFormattedShareType(): string {
    return this.shareType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Safe version for JSON responses
  toJSON() {
    const { shareCapital, ...rest } = this;
    return {
      ...rest,
      shareCapitalId: this.shareCapitalId
    };
  }
}
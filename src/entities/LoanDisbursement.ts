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
import { Loan } from "./Loan";
import { ClientBorrowerAccount } from "./ClientBorrowerAccount";
import { Organization } from "./Organization";

@Entity("loan_disbursements")
@Index(["loanId", "organizationId"])
export class LoanDisbursement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50 })
  borrowerAccountNumber: string;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "varchar", length: 50 })
  applicationNumber: string;

  // Approved amount from LoanAnalysisReport
  @Column({ type: "decimal", precision: 15, scale: 2 })
  approvedAmount: number;

  // Commission calculations
  @Column({ type: "decimal", precision: 5, scale: 2 })
  commissionRate: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  commissionAmount: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  vatAmount: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalCommissionWithVAT: number;

  // Insurance fees
  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  insurancePolicyFees: number;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  fireInsurancePolicyFees: number;

  @Column({ type: "decimal", precision: 15, scale: 2 })
  totalInsuranceFees: number;

  // Other fees
  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  otherFees: number;

  // Net amount payable to borrower
  @Column({ type: "decimal", precision: 15, scale: 2 })
  netAmountPayable: number;

  // Proof of disbursement
  @Column({ type: "text" })
  proofOfDisbursementFileUrl: string;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "int" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Loan)
  @JoinColumn({ name: "loanId" })
  loan: Loan;

  @ManyToOne(() => ClientBorrowerAccount)
  @JoinColumn({ name: "borrowerAccountNumber", referencedColumnName: "accountNumber" })
  borrowerAccount: ClientBorrowerAccount;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: "organizationId" })
  organization: Organization;
}
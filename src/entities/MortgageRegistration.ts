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

@Entity("mortgage_registrations")
@Index(["loanId", "organizationId"])
export class MortgageRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50 })
  borrowerAccountNumber: string;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "varchar", length: 50 })
  loanApplicationNumber: string;

  @Column({ type: "text" })
  notarisedAOMAFileUrl: string;

  @Column({ type: "text" })
  rdbFeesFileUrl: string;
  @Column({ type: "text", nullable: true })
  mortgageRegistrationCertificateUrl: string | null;

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
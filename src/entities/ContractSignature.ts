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

@Entity("contract_signatures")
@Index(["loanId", "organizationId"])
export class ContractSignature {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 50 })
  borrowerAccountNumber: string;

  @Column({ type: "int" })
  loanId: number;

  @Column({ type: "varchar", length: 50 })
  loanApplicationNumber: string;

  @Column({ type: "varchar", length: 200 })
  notaryName: string;

  @Column({ type: "date" })
  notarizationDate: Date;

  @Column({ type: "varchar", length: 100 })
  notaryLicenceNumber: string;

  @Column({ type: "varchar", length: 20 })
  notaryTelephone: string;

  @Column({ type: "varchar", length: 100 })
  addressDistrict: string;

  @Column({ type: "varchar", length: 100 })
  addressSector: string;

  @Column({ type: "text" })
  notarisedContractFileUrl: string;

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
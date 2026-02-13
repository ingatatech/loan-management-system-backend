import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from "typeorm";
import { Organization } from "./Organization";
import { Category } from "./Category";

@Entity("services")
@Index(["name", "category"], { unique: true })
export class Service {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "varchar", length: 20, nullable: true })
  serviceCode: string | null;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true })
  basePrice: number | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  pricingType: string | null; // fixed, variable, percentage

  @Column({ type: "decimal", precision: 5, scale: 2, nullable: true })
  interestRate: number | null;

  @Column({ type: "int", nullable: true })
  minLoanAmount: number | null;

  @Column({ type: "int", nullable: true })
  maxLoanAmount: number | null;

  @Column({ type: "int", nullable: true })
  minTenureMonths: number | null;

  @Column({ type: "int", nullable: true })
  maxTenureMonths: number | null;

  @Column("jsonb", { nullable: true })
  requirements: string[] | null;

  @Column("jsonb", { nullable: true })
  eligibilityCriteria: { [key: string]: any } | null;

  @ManyToOne(() => Category, (category) => category.services, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "category_id" })
  category: Category;

  @Column({ name: "category_id" })
  categoryId: number;

  @ManyToOne(() => Organization, (organization) => organization.services, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @Column({ name: "organization_id" })
  organizationId: number;

  @Column({ type: "int", nullable: true })
  createdBy: number | null;

  @Column({ type: "int", nullable: true })
  updatedBy: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt: Date | null;

  // Business methods
  calculateInterestAmount(principal: number, tenureMonths: number): number {
    if (!this.interestRate) return 0;
    return (principal * this.interestRate * tenureMonths) / (100 * 12);
  }

  isEligibleLoanAmount(amount: number): boolean {
    const minAmount = this.minLoanAmount || 0;
    const maxAmount = this.maxLoanAmount || Infinity;
    return amount >= minAmount && amount <= maxAmount;
  }

  isEligibleTenure(months: number): boolean {
    const minTenure = this.minTenureMonths || 0;
    const maxTenure = this.maxTenureMonths || Infinity;
    return months >= minTenure && months <= maxTenure;
  }

  getFormattedInterestRate(): string {
    return this.interestRate ? `${this.interestRate}%` : "N/A";
  }
}
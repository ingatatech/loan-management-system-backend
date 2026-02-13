import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from "typeorm";
import { Organization } from "./Organization";
import { Service } from "./Service";

@Entity("categories")
@Index(["name", "organization"], { unique: true })
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "boolean", default: true })
  isActive: boolean;

  @Column({ type: "varchar", length: 10, nullable: true })
  categoryCode: string | null;

  @Column({ type: "text", nullable: true })
  categoryIcon: string | null;

  @ManyToOne(() => Organization, (organization) => organization.categories, {
    nullable: false,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "organization_id" })
  organization: Organization;

  @Column({ name: "organization_id" })
  organizationId: number;

  @OneToMany(() => Service, (service) => service.category, {
    cascade: ["remove"],
  })
  services: Service[];

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
  getActiveServicesCount(): number {
    return this.services?.filter(service => service.isActive).length || 0;
  }

  getTotalServicesCount(): number {
    return this.services?.length || 0;
  }

  hasActiveServices(): boolean {
    return this.getActiveServicesCount() > 0;
  }

  canBeDeleted(): boolean {
    return this.getTotalServicesCount() === 0;
  }
}
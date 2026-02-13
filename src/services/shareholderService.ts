import type { Repository } from "typeorm"
import type { IndividualShareholder } from "../entities/IndividualShareholder"
import type { InstitutionShareholder } from "../entities/InstitutionShareholder"
import type { ShareCapital } from "../entities/ShareCapital"
import type { Organization } from "../entities/Organization"

export class ShareholderService {
  constructor(
    private individualShareholderRepository: Repository<IndividualShareholder>,
    private institutionShareholderRepository: Repository<InstitutionShareholder>,
    private shareCapitalRepository: Repository<ShareCapital>,
    private organizationRepository: Repository<Organization>,
  ) {}

  async createIndividualShareholder(shareholderData: Partial<IndividualShareholder>, organizationId: number) {
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } })
    if (!organization) {
      throw new Error("Organization not found")
    }

    const shareholder = this.individualShareholderRepository.create({
      ...shareholderData,
      organization,
    })

    return await this.individualShareholderRepository.save(shareholder)
  }

  async createInstitutionShareholder(shareholderData: Partial<InstitutionShareholder>, organizationId: number) {
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } })
    if (!organization) {
      throw new Error("Organization not found")
    }

    const shareholder = this.institutionShareholderRepository.create({
      ...shareholderData,
      organization,
    })

    return await this.institutionShareholderRepository.save(shareholder)
  }

  async getShareholdersByOrganization(organizationId: number) {
    const individuals = await this.individualShareholderRepository.find({
      where: { organization: { id: organizationId } },
      relations: ["shareCapitals"],
    })

    const institutions = await this.institutionShareholderRepository.find({
      where: { organization: { id: organizationId } },
      relations: ["shareCapitals"],
    })

    return {
      individuals,
      institutions,
    }
  }

  async recordShareCapital(shareCapitalData: Partial<ShareCapital>, organizationId: number) {
    const organization = await this.organizationRepository.findOne({ where: { id: organizationId } })
    if (!organization) {
      throw new Error("Organization not found")
    }

    // Calculate total value
    const totalValue = (shareCapitalData.numberOfShares || 0) * (shareCapitalData.valuePerShare || 0)

    const shareCapital = this.shareCapitalRepository.create({
      ...shareCapitalData,
      totalContributedCapitalValue: totalValue,
      organization,
    })

    return await this.shareCapitalRepository.save(shareCapital)
  }

  async getShareCapitalByOrganization(organizationId: number) {
    return await this.shareCapitalRepository.find({
      where: { organization: { id: organizationId } },
      relations: ["individualShareholder", "institutionShareholder"],
    })
  }

  async updateShareholder(id: number, type: "individual" | "institution", updateData: any) {
    if (type === "individual") {
      const shareholder = await this.individualShareholderRepository.findOne({ where: { id } })
      if (!shareholder) {
        throw new Error("Individual shareholder not found")
      }
      Object.assign(shareholder, updateData)
      return await this.individualShareholderRepository.save(shareholder)
    } else {
      const shareholder = await this.institutionShareholderRepository.findOne({ where: { id } })
      if (!shareholder) {
        throw new Error("Institution shareholder not found")
      }
      Object.assign(shareholder, updateData)
      return await this.institutionShareholderRepository.save(shareholder)
    }
  }

  async deleteShareholder(id: number, type: "individual" | "institution") {
    if (type === "individual") {
      return await this.individualShareholderRepository.delete(id)
    } else {
      return await this.institutionShareholderRepository.delete(id)
    }
  }
}

export type Ref = {
  id: string;
  label?: string | null;
  code?: string | null;
};

export type SkuValue = string | number | {
  id?: string;
  label?: string | null;
  sku?: string | number | null;
  caseProduct?: Ref | null;
} | null;

export type CustomerSku = {
  customer?: Ref & { board?: unknown };
  sku?: SkuValue;
};

export type WorkOrderItem = {
  id?: string;
  label?: string;
  unitGtin?: { id?: string; label?: string; unitGtin?: string | null } | null;
  caseGtin?: (Ref & { caseProduct?: Ref | null }) | null;
  sku?: SkuValue;
  productPortfolio?: Ref | null;
  product?: {
    id: string;
    label?: string;
    brand?: Ref | null;
    customers?: CustomerSku[];
    caseInformation?: {
      quantity?: string | number | null;
      unitProduct?: {
        id?: string;
        label?: string;
        isRotating?: boolean | null;
        isVarietyPack?: boolean | null;
        cannabisWeight?: number | null;
        format?: Ref | null;
        atomicProduct?: {
          id?: string;
          label?: string;
          cannabisWeight?: number | null;
          productType?: Ref | null;
          cannabis?: {
            profile?: {
              id?: string;
              label?: string;
              strain?: {
                type?: string | null;
              } | null;
            } | null;
          } | null;
        } | null;
      } | null;
    } | null;
  } | null;
  numberOfUnits?: string | number | null;
  unitsInACase?: string | number | null;
  numberOfCases?: string | number | null;
  casePrice?: string | number | null;
  extendedPrice?: string | number | null;
  amount?: string | number | null;
  itemRecord?: Ref | null;
};

export type WorkOrder = {
  id: string;
  label?: string;
  poNumber?: string | number | null;
  customer?: (Ref & {
    type?: string | null;
    board?: Ref | null;
  }) | null;
  poDate?: string | null;
  targetDeliveryDate?: string | null;
  items?: WorkOrderItem[];
};

export type StorePurchaseOrder = {
  id: string;
  label?: string | null;
  store?: Ref | null;
  board?: (Ref & {
    productSelection?: string | null;
    unitOfMeasure?: string | null;
  }) | null;
  province?: string | null;
  poNumber?: string | number | null;
  poDate?: string | null;
  requestedDate?: string | null;
  targetPickupDate?: string | null;
  items?: WorkOrderItem[];
};

export type ShippingStoreItem = {
  id?: string;
  label?: string | null;
  caseProduct?: Ref | null;
  requiredCases?: string | number | null;
  amount?: string | number | null;
  status?: string | null;
  itemRecord?: Ref | null;
  inventory?: ProductInventory[] | null;
};

export type ShippingStore = {
  id: string;
  label?: string | null;
  shipmentIdentifier?: string | null;
  poFromStore?: Ref | null;
  board?: Ref | null;
  destination?: (Ref & { board?: (Ref & { province?: string | null }) | null }) | null;
  status?: string | null;
  pickupDate?: string | null;
  expectedDeliveryDate?: string | null;
  confirmedDeliveryDate?: string | null;
  items?: ShippingStoreItem[] | null;
};

export type ScmItem = {
  id: string;
  label?: string | null;
  skuText?: string | number | null;
  sku?: SkuValue;
  unitGtin?: (Ref & { unitGtin?: string | null }) | null;
  caseGtin?: Ref | null;
  product?: WorkOrderItem['product'];
  brand?: Ref | null;
  profile?: Ref | null;
  strain?: {
    type?: string | null;
  } | null;
  numberOfUnits?: string | number | null;
  unitsInACase?: string | number | null;
  numberOfCases?: string | number | null;
  amount?: string | number | null;
  thcRanges?: string | null;
  inputLotId?: InputLot | InputLot[] | null;
  varietyProfiles?: Array<{
    inputLotId?: InputLot | null;
  }> | null;
  thc?: string | number | null;
  cbd?: string | number | null;
  primaryProductLotId?: string | null;
  packagingDate?: string | null;
  skidChecked?: boolean | null;
  executionStatus?: string | null;
  tasksProgress?: string | number | null;
};

export type CaseProduct = {
  id: string;
  label?: string;
  brand?: Ref | null;
  customers?: CustomerSku[];
  caseInformation?: NonNullable<WorkOrderItem['product']>['caseInformation'];
};

export type ProductInventory = {
  id: string;
  label?: string;
  board?: Ref | null;
  caseProduct?: Ref | null;
  purchaseOrder?: Ref | null;
  item?: Ref | null;
  inputLotId?: Array<Ref & { bulkLot?: string | null }> | null;
  primaryProductLotId?: string | null;
  packagingDate?: string | null;
  currentInventory?: number | null;
  status?: string | null;
  skidChecked?: boolean | null;
  totalThcPercentage?: string | number | null;
  totalCbdPercentage?: string | number | null;
  inReWork?: boolean | null;
};

export type Comparison = 'equal' | 'lessThan' | 'lessOrEqual' | 'greaterThan' | 'greaterOrEqual' | string;

export type MeasurementValue = {
  comparison?: Comparison | null;
  value?: number | null;
  measurement?: string | null;
  label?: string | null;
};

export type InputLot = {
  id: string;
  label?: string;
  strain?: (Ref & {
    type?: string | null;
    strain?: { type?: string | null } | null;
  }) | null;
  bulkLot?: string | null;
  cannabinoids?: {
    thc?: MeasurementValue | null;
    cbd?: MeasurementValue | null;
    totalThc?: MeasurementValue | null;
    totalCbd?: MeasurementValue | null;
    totalThcPercentage?: MeasurementValue | null;
    totalCbdPercentage?: MeasurementValue | null;
  } | null;
  totalTerpenePercent?: number | string | null;
  terpenesTable?: string | null;
  tripleChecked?: boolean | null;
};

export type Portfolio = {
  id: string;
  label?: string;
  sku?: string | null;
  unitGtin?: string | null;
  caseGtin?: string | null;
  caseProduct?: Ref & { status?: string | null };
  customer?: Ref | null;
  ft?: boolean | null;
  productInventoryEntry?: Ref | null;
  newLaunch?: boolean | null;
  strainType?: string | null;
  listing?: {
    status?: string | null;
    launchDate?: string | null;
  } | null;
  currentPrice?: {
    landedCostPerUnit?: number | null;
    msrpPerUnit?: number | null;
    wholesalePricePerUnit?: number | null;
    date?: string | null;
  } | null;
  thcRange?: string | null;
  cbdRange?: string | null;
    tolerances?: {
    thcLowerBound?: number | string | null;
    thcUpperBound?: number | string | null;
    cbdLowerBound?: number | string | null;
    cbdUpperBound?: number | string | null;
    thcUnitOfMeasurement?: string | null;
    cbdUnitOfMeasurement?: string | null;
    units?: string | null;
  } | null;
  status?: string | null;
};

export type PagedResponse<T> = {
  total?: number;
  offset?: string | null;
  items?: T[];
};

export type SellSheetProvince = 'ontario' | 'alberta';

export type SellSheetRow = {
  brand: string;
  productName: string;
  strainType: string;
  format: string;
  category: string;
  sku: string;
  msrp: string | number;
  unitsPerCase: string | number;
  costPerUnit: string | number;
  costPerCase: string | number;
  thcPercent: string;
  terps: string;
  totalTerpenePercent: string | number;
  cbdPercent: string;
  casesAvailable: number | '';
  listing: string;
  _raw: {
    sourceEntity?: string;
    poNumber?: string | number | null;
    workOrderId: string;
    workOrderItemId?: string;
    productId: string;
    poItemId?: string;
    itemRecordId?: string;
    scmItemId?: string;
    isVarietyPack?: boolean;
    scmItemSkuText: string;
    exactPortfolioId?: string;
    portfolioIdSource: string;
    scmItemInputLotId?: string;
    scmItemInputLotLabel: string;
    scmItemPrimaryProductLotId: string;
    scmItemThc: string | number;
    scmItemCbd: string | number;
    scmItemThcRanges: string;
    scmItemPackagingDate: string;
    scmItemSkidChecked: boolean | '';
    scmItemExecutionStatus: string;
    scmItemTasksProgress: string | number;
    inventoryIds: string[];
    selectedInventoryId?: string;
    inputLotIds: string[];
    selectedInputLotId?: string;
    portfolioId?: string;
    portfolioSku?: string;
    portfolioThcRange: string;
    listingProgram: string;
    msrpSourceValue: string | number;
    wholesalePriceSourceValue: string | number;
    landedCostSourceValue: string | number;
    poAmount: string | number;
    rawInventoryThc: string | number;
    rawInventoryCbd: string | number;
    rawInputLotThc: string;
    rawInputLotCbd: string;
    fieldSources: Record<string, string>;
    generatedAt: string;
    warnings: string[];
  };
};

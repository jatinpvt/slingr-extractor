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
  caseGtin?: unknown;
  sku?: SkuValue;
  productPortfolio?: unknown;
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
        format?: Ref | null;
        atomicProduct?: {
          id?: string;
          label?: string;
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
  numberOfUnits?: number | null;
  unitsInACase?: number | null;
  numberOfCases?: number | null;
  amount?: number | null;
  itemRecord?: Ref | null;
};

export type WorkOrder = {
  id: string;
  label?: string;
  poNumber?: string | number | null;
  customer?: Ref | null;
  poDate?: string | null;
  items?: WorkOrderItem[];
};

export type CaseProduct = {
  id: string;
  label?: string;
  brand?: Ref | null;
};

export type ProductInventory = {
  id: string;
  label?: string;
  board?: Ref | null;
  caseProduct?: Ref | null;
  purchaseOrder?: Ref | null;
  item?: Ref | null;
  inputLotId?: Ref[] | null;
  primaryProductLotId?: string | null;
  packagingDate?: string | null;
  currentInventory?: number | null;
  status?: string | null;
  skidChecked?: boolean | null;
  totalThcPercentage?: string | number | null;
  inReWork?: boolean | null;
};

export type Comparison = 'equal' | 'lessThan' | 'greaterThan' | string;

export type MeasurementValue = {
  comparison?: Comparison | null;
  value?: number | null;
  measurement?: string | null;
  label?: string | null;
};

export type InputLot = {
  id: string;
  label?: string;
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
  status?: string | null;
};

export type PagedResponse<T> = {
  total?: number;
  offset?: string | null;
  items?: T[];
};

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
  casesAvailable: number;
  listing: string;
  _raw: {
    productId: string;
    poItemId?: string;
    itemRecordId?: string;
    inventoryIds: string[];
    selectedInventoryId?: string;
    inputLotIds: string[];
    selectedInputLotId?: string;
    portfolioId?: string;
    warnings: string[];
  };
};
